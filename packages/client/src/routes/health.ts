import { Router } from 'express'
import logger from '../utils/logger.js'

const router = Router()

// Mongo接続確認用のヘルパー関数
async function checkMongoConnection(): Promise<boolean> {
  try {
    const { getDb } = await import('../db/mongo.js')
    const db = getDb()
    if (!db) return false

    await db.admin().ping()
    return true
  } catch {
    return false
  }
}

// Redis接続確認用のヘルパー関数
async function checkRedisConnection(): Promise<boolean> {
  const timeout = 3000 // 3秒タイムアウト

  return new Promise((resolve) => {
    // タイムアウトタイマーを設定
    const timeoutId = setTimeout(() => {
      logger.info('Redis ping timeout after 3 seconds')
      resolve(false)
    }, timeout)

    // 非同期処理を実行
    ;(async () => {
      try {
        const { getRedisClient } = await import('../db/redis.js')
        const redisClient = getRedisClient()

        if (!redisClient) {
          logger.info('Redis client is null')
          clearTimeout(timeoutId)
          resolve(false)
          return
        }

        logger.info('Attempting Redis ping...')
        const pong = await redisClient.ping()
        logger.info(`Redis ping response: ${pong}`)

        clearTimeout(timeoutId)
        resolve(pong === 'PONG')
      } catch (error) {
        logger.error('Redis ping error:', error)
        clearTimeout(timeoutId)
        resolve(false)
      }
    })()
  })
}

// ヘルスチェックエンドポイント
router.get('/', async (req, res) => {
  try {
    const mongoStatus = await checkMongoConnection()
    const redisStatus = await checkRedisConnection()

    const healthStatus = {
      status: mongoStatus && redisStatus ? 'OK' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime(),
      database: mongoStatus ? 'connected' : 'disconnected',
      redis: redisStatus ? 'connected' : 'disconnected',
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development',
    }

    const statusCode = mongoStatus && redisStatus ? 200 : 503
    res.status(statusCode).json(healthStatus)
  } catch (error) {
    logger.error(`Health check failed: ${(error as Error).message}`)
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    })
  }
})

export default router
