/**
 * ログアウトサービス
 */
import { Request, Response } from 'express'
import { findSessionByRefreshToken, updateSession } from '../db/mongo.js'
import { SessionDocument } from '../types/mongo.types.js'
import logger from '../utils/logger.js'

/**
 * ログアウト処理
 * @param req リクエストオブジェクト
 * @param res レスポンスオブジェクト
 */
export async function handleLogout(req: Request, res: Response): Promise<void> {
  try {
    const { refresh_token } = req.body

    // リフレッシュトークンが提供されていない場合は400エラー
    if (!refresh_token) {
      res.status(400).json({ error: 'Missing refresh_token' })
      return
    }

    // セッション検索
    let sessionDoc: SessionDocument | null = null
    try {
      sessionDoc = await findSessionByRefreshToken(refresh_token)
    } catch (dbError) {
      logger.error(`Database query failed: ${(dbError as Error).message}`)
      res.status(500).json({ error: 'Database connection error' })
      return
    }

    // セッションが存在しない場合は400エラー
    if (!sessionDoc) {
      res.status(400).json({ error: 'Invalid refresh_token' })
      return
    }

    // セッションが既に取り消し済みの場合は400エラー
    if (sessionDoc.revoked) {
      res.status(400).json({ error: 'Session already revoked' })
      return
    }

    // セッションを無効化
    try {
      await updateSession(sessionDoc.session_id, {
        revoked: true,
        revoked_at: new Date(),
      })
    } catch (dbError) {
      logger.error(`Failed to revoke session: ${(dbError as Error).message}`)
      // セッション無効化失敗は致命的ではないので続行
    }
    res.json({ status: 'ok', message: 'session revoked' })
  } catch (err) {
    logger.error(`/oauth/logout error: ${(err as Error).message}`)
    res.status(500).json({ error: 'Internal server error' })
  }
}
