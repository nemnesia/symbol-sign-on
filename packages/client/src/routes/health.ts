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

// ヘルスチェックエンドポイント
router.get('/', async (req, res) => {
  try {
    const mongoStatus = await checkMongoConnection()

    const healthStatus = {
      status: mongoStatus ? 'OK' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime(),
      database: mongoStatus ? 'connected' : 'disconnected',
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development',
    }

    const statusCode = mongoStatus ? 200 : 503
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
