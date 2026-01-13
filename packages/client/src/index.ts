// 環境変数の読み込み
import dotenv from 'dotenv'
dotenv.config()

// 必要なモジュールのインポート
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import { connectToMongo, getAllowedOriginsFromMongo } from './db/mongo.js'
import healthRoutes from './routes/health.js'
import oauthRoutes from './routes/oauth.js'
import logger from './utils/logger.js'
import { parseTimeToSeconds } from './utils/time.js'

// 定数の定義
const app = express()
const PORT = Number(process.env.PORT) || 3000
const CACHE_TTL_MS = parseTimeToSeconds(process.env.CORS_ORIGINS_CACHE_TTL || '5m') * 1000 // CORS originキャッシュのTTL

// 許可されたオリジンのキャッシュ
let allowedOriginsCache: string[] = []
let cacheLastUpdated = 0

// 許可されたオリジンを取得（キャッシュ機能付き）
async function getCachedAllowedOrigins(): Promise<string[]> {
  const now = Date.now()

  if (allowedOriginsCache.length > 0 && now - cacheLastUpdated < CACHE_TTL_MS) {
    return allowedOriginsCache
  }

  try {
    const mongoOrigins = await getAllowedOriginsFromMongo()

    if (!process.env.CORS_ORIGIN) {
      throw new Error('CORS_ORIGIN environment variable is required')
    }

    const origins = [...mongoOrigins, process.env.CORS_ORIGIN]
    allowedOriginsCache = origins
    cacheLastUpdated = now

    logger.debug(`CORS origins cache updated: ${origins.length} origins`)
    logger.debug(`CORS origins cache TTL: ${CACHE_TTL_MS}ms (${CACHE_TTL_MS / 1000}s)`)
    return origins
  } catch (error) {
    logger.error(`Failed to update CORS origins cache: ${(error as Error).message}`)

    if ((error as Error).message.includes('CORS_ORIGIN environment variable is required')) {
      throw error
    }

    if (allowedOriginsCache.length > 0) {
      logger.warn('Using stale CORS origins cache due to DB error')
      return allowedOriginsCache
    }

    if (!process.env.CORS_ORIGIN) {
      throw new Error('CORS_ORIGIN environment variable is required')
    }

    return [process.env.CORS_ORIGIN]
  }
}

// ミドルウェアの設定
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
app.options(/.*/, cors())

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`)
  next()
})
app.use(cookieParser())
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(express.static('public'))

// ルートの設定
app.use('/oauth', oauthRoutes)
app.use('/health', healthRoutes)

// 404ハンドラー
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
    if (!process.env.CORS_ORIGIN) {
      throw new Error('CORS_ORIGIN environment variable is required. Please set it in .env file.')
    }

    await connectToMongo()
    logger.info('MongoDB connected')

    await getCachedAllowedOrigins()
    logger.info(`CORS origins cache initialized with base origin: ${process.env.CORS_ORIGIN}`)
    logger.info(
      `CORS origins cache TTL: ${CACHE_TTL_MS / 1000}s (${process.env.CORS_ORIGINS_CACHE_TTL || '5m'})`,
    )

    const host = process.env.NODE_ENV === 'development' ? '0.0.0.0' : '127.0.0.1'

    app.listen(PORT, host, () => {
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

// アプリケーションの起動
startServer().catch((error) => {
  logger.error(`Failed to start application: ${error.message}`)
  process.exit(1)
})
