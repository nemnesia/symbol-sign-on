/**
 * レート制限ミドルウェア
 * OAuth認可エンドポイントのブルートフォース攻撃を防ぐ
 */
import { Request } from 'express'
import logger from '../utils/logger.js'

// 簡易的なレート制限実装（express-rate-limitの代替）
interface RateLimitStore {
  [key: string]: {
    count: number
    resetTime: number
  }
}

const store: RateLimitStore = {}

// 古いエントリをクリーンアップ
setInterval(() => {
  const now = Date.now()
  Object.keys(store).forEach(key => {
    if (store[key].resetTime < now) {
      delete store[key]
    }
  })
}, 5 * 60 * 1000) // 5分ごと

/**
 * OAuth認可エンドポイント用のレート制限チェック
 */
export function checkAuthorizeRateLimit(req: Request): { allowed: boolean; error?: any } {
  const windowMs = 15 * 60 * 1000 // 15分
  const maxRequests = 10
  const clientId = req.query.client_id || 'unknown'
  const key = `${req.ip}:${clientId}`
  const now = Date.now()

  if (!store[key] || store[key].resetTime < now) {
    store[key] = {
      count: 1,
      resetTime: now + windowMs
    }
    return { allowed: true }
  }

  if (store[key].count >= maxRequests) {
    logger.warn('Rate limit exceeded for OAuth authorize', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      clientId: req.query.client_id,
    })

    return {
      allowed: false,
      error: {
        error: 'too_many_requests',
        error_description: 'Too many authorization requests, please try again later',
      }
    }
  }

  store[key].count++
  return { allowed: true }
}
