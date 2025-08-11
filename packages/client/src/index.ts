import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { connectToMongo, getAllowedOriginsFromMongo } from './db/mongo.js'
import healthRoutes from './routes/health.js'
import loginRoutes from './routes/login.js'
import oauthRoutes from './routes/oauth.js'
import logger from './utils/logger.js'
import cookieParser from 'cookie-parser'

// __dirname を ESモジュールで定義
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 最初に環境変数を読み込む
dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

// 許可されたオリジンのキャッシュ
let allowedOriginsCache: string[] = []
let cacheLastUpdated = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5分間のキャッシュ

/**
 * 許可されたオリジンを取得（キャッシュ機能付き）
 */
async function getCachedAllowedOrigins(): Promise<string[]> {
  const now = Date.now()

  // キャッシュが有効期限内の場合はキャッシュを返す
  if (allowedOriginsCache.length > 0 && now - cacheLastUpdated < CACHE_TTL_MS) {
    return allowedOriginsCache
  }

  try {
    // MongoDBから最新のオリジンを取得
    const mongoOrigins = await getAllowedOriginsFromMongo()

    // CORS_ORIGINが設定されていることを確認
    if (!process.env.CORS_ORIGIN) {
      throw new Error('CORS_ORIGIN environment variable is required')
    }

    // デフォルトオリジンを追加
    const origins = [...mongoOrigins, process.env.CORS_ORIGIN]

    // キャッシュを更新
    allowedOriginsCache = origins
    cacheLastUpdated = now

    logger.debug(`CORS origins cache updated: ${origins.length} origins`)
    return origins
  } catch (error) {
    logger.error(`Failed to update CORS origins cache: ${(error as Error).message}`)

    // CORS_ORIGIN未設定エラーの場合は再スロー（致命的エラー）
    if ((error as Error).message.includes('CORS_ORIGIN environment variable is required')) {
      throw error
    }

    // エラーの場合は既存のキャッシュまたはデフォルトを返す
    if (allowedOriginsCache.length > 0) {
      logger.warn('Using stale CORS origins cache due to DB error')
      return allowedOriginsCache
    }

    // キャッシュもない場合はCORS_ORIGINのみ（設定されている場合）
    if (!process.env.CORS_ORIGIN) {
      throw new Error('CORS_ORIGIN environment variable is required')
    }

    return [process.env.CORS_ORIGIN]
  }
}

// ミドルウェア設定
app.use(
  cors({
    origin: async (origin, callback) => {
      try {
        const allowedOrigins = await getCachedAllowedOrigins()

        logger.debug(`CORS check - Origin: ${origin}, Cache size: ${allowedOrigins.length}`)

        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true)
        } else {
          logger.warn(`CORS blocked request from origin: ${origin}`)
          callback(new Error('Not allowed by CORS'))
        }
      } catch (error) {
        logger.error(`CORS error: ${(error as Error).message}`)
        callback(new Error('CORS origin check failed'))
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
  }),
)
// プリフライトリクエストを明示的に処理
app.options(/.*/, cors())

// ログミドルウェア
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`)
  next()
})

app.use(cookieParser())
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(express.static('public'))

// POSTリクエストを処理するエンドポイント
app.post('/login.html', (req, res) => {
  console.log('Request body:', req.body)
  logger.info(`POST request to login.html with data:`, req.body)

  const filePath = path.join(__dirname, '../public/login.html')

  // HTMLファイルを読み取り
  import('fs')
    .then((fs) => {
      fs.readFile(filePath, 'utf8', (err, html) => {
        if (err) {
          logger.error(`Error reading file: ${err.message}`)
          return res.status(404).send('ファイルが見つかりません')
        }

        // POSTデータをJSONとしてHTMLに埋め込む
        const postDataScript = `
                <script>
                    window.postData = ${JSON.stringify(req.body)};
                    console.log('POST Data received:', window.postData);
                </script>
            `

        // HTMLの</head>タグの前にスクリプトを挿入
        const modifiedHtml = html.replace('</head>', `${postDataScript}</head>`)

        res.setHeader('Content-Type', 'text/html')
        res.send(modifiedHtml)
      })
    })
    .catch((error) => {
      logger.error(`Error importing fs: ${error.message}`)
      res.status(500).send('Internal server error')
    })
})

// ルート設定
app.use('/login', loginRoutes)
app.use('/oauth', oauthRoutes)
app.use('/health', healthRoutes)

// 404ハンドラー - '*' の代わりに正規表現を使用
app.use(/.*/, (req, res) => {
  const isDevToolsRequest =
    req.originalUrl.includes('/.well-known/') ||
    req.originalUrl.includes('/favicon.ico') ||
    req.originalUrl.includes('/chrome-extension/')

  if (isDevToolsRequest) {
    logger.debug(`404 - ${req.method} ${req.originalUrl}`)
  } else {
    logger.warn(`404 - ${req.method} ${req.originalUrl}`)
  }

  res.status(404).json({ error: 'Endpoint not found' })
})

// エラーハンドラー
app.use((err: Error, req: express.Request, res: express.Response) => {
  logger.error(`Error: ${err.message}`)
  res.status(500).json({ error: 'Internal server error' })
})

// サーバー起動
async function startServer(): Promise<void> {
  try {
    // 環境変数の必須チェック
    if (!process.env.CORS_ORIGIN) {
      throw new Error('CORS_ORIGIN environment variable is required. Please set it in .env file.')
    }

    await connectToMongo()
    logger.info('MongoDB connected')

    // CORS許可オリジンのキャッシュを初期化
    await getCachedAllowedOrigins()
    logger.info(`CORS origins cache initialized with base origin: ${process.env.CORS_ORIGIN}`)

    app.listen(PORT, () => {
      logger.info(`Server running on http://localhost:${PORT}`)
      logger.info(`API endpoints:`)
      logger.info(`  GET  /health - Health check`)
      logger.info(`  GET  /oauth/authorize - Start authentication`)
      logger.info(`  POST /oauth/verify-signature - Verify Symbol signature`)
      logger.info(`  POST /oauth/token - Exchange code for token`)
      logger.info(`  GET  /oauth/userinfo - Get user info`)
      logger.info(`  GET  /login-demo.html - Demo page`)
    })
  } catch (error) {
    logger.error(`Failed to start server: ${(error as Error).message}`)
    process.exit(1)
  }
}

// 未処理のプロミス拒否をキャッチ
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
})
// 未処理の例外をキャッチ
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error)
  process.exit(1)
})

// グレースフルシャットダウン
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, shutting down gracefully`)
  try {
    const { closeConnection: closeMongoConnection } = await import('./db/mongo.js')
    await closeMongoConnection()
  } catch (error) {
    logger.error(`Error during shutdown: ${(error as Error).message}`)
  }
  process.exit(0)
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

/**
 * アプリケーションの起動
 */
startServer().catch((error) => {
  logger.error(`Failed to start application: ${error.message}`)
  process.exit(1)
})
