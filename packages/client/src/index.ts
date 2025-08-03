import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { connectToMongo, getAllowedOriginsFromMongo } from './db/mongo.js'
import { connectToRedis } from './db/redis.js'
import healthRoutes from './routes/health.js'
import oauthRoutes from './routes/oauth.js'
import logger from './utils/logger.js'

// 最初に環境変数を読み込む
dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

// ミドルウェア設定
app.use(
  cors({
    origin: async (origin, callback) => {
      try {
        const allowedOrigins = await getAllowedOriginsFromMongo()
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true)
        } else {
          callback(new Error('Not allowed by CORS'))
        }
      } catch {
        callback(new Error('CORS origin check failed'))
      }
    },
    credentials: true,
  }),
)
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(express.static('public'))

// ログミドルウェア
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`)
  next()
})

// ルート設定
app.use('/oauth', oauthRoutes)
app.use('/health', healthRoutes)

// Chrome DevTools用のエンドポイント（404警告を回避）
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
  res.status(404).json({ error: 'Not implemented' })
})

// 404ハンドラー
app.use('*', (req, res) => {
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
    await connectToMongo()
    logger.info('MongoDB connected')

    await connectToRedis()
    logger.info('Redis connected')

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
    const { closeConnection: closeRedisConnection } = await import('./db/redis.js')
    await closeMongoConnection()
    await closeRedisConnection()
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
