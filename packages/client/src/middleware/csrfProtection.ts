/**
 * CSRFトークン検証ミドルウェア
 * OAuth2 stateパラメータを使用したCSRF攻撃防止
 */
import { Request, Response, NextFunction } from 'express'
import { randomBytes } from 'crypto'
import logger from '../utils/logger.js'

interface CSRFStore {
  [sessionId: string]: {
    token: string
    expires: number
  }
}

const csrfStore: CSRFStore = {}

// 古いトークンのクリーンアップ
setInterval(() => {
  const now = Date.now()
  Object.keys(csrfStore).forEach(sessionId => {
    if (csrfStore[sessionId].expires < now) {
      delete csrfStore[sessionId]
    }
  })
}, 10 * 60 * 1000) // 10分ごと

/**
 * CSRFトークンを生成する
 */
export function generateCSRFToken(sessionId: string): string {
  const token = randomBytes(32).toString('hex')
  const expires = Date.now() + (30 * 60 * 1000) // 30分有効

  csrfStore[sessionId] = { token, expires }
  return token
}

/**
 * CSRFトークンを検証する
 */
export function validateCSRFToken(sessionId: string, token: string): boolean {
  const stored = csrfStore[sessionId]
  if (!stored || stored.expires < Date.now()) {
    return false
  }

  // タイミング攻撃を防ぐため、constant-time比較を使用
  return constantTimeCompare(stored.token, token)
}

/**
 * Constant-time文字列比較
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }

  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }

  return result === 0
}

/**
 * OAuth2のstateパラメータを検証するミドルウェア
 */
export function validateOAuthState(req: Request, res: Response, next: NextFunction): void {
  const state = req.query.state as string
  const sessionId = (req as any).sessionID || req.ip // セッションIDまたはIPアドレスを使用

  if (!state) {
    logger.warn('Missing state parameter in OAuth request', { ip: req.ip })
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'Missing state parameter'
    })
    return
  }

  if (!validateCSRFToken(sessionId, state)) {
    logger.warn('Invalid state parameter in OAuth request', {
      ip: req.ip,
      sessionId: sessionId.substring(0, 8) + '...' // セキュリティのため一部のみログ
    })
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'Invalid state parameter'
    })
    return
  }

  next()
}
