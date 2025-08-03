/**
 * ログアウトサービス
 */
import { Request, Response } from 'express'
import { getRefreshToken, setRefreshToken } from '../db/redis.js'
import { RefreshTokenDocument } from '../types/redis.types.js'
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

    // リフレッシュトークンの取得
    let refreshTokenDoc: RefreshTokenDocument | null = null
    try {
      refreshTokenDoc = await getRefreshToken(refresh_token)
    } catch (dbError) {
      logger.error(`Database query failed: ${(dbError as Error).message}`)
      res.status(500).json({ error: 'Database connection error' })
      return
    }

    // リフレッシュトークンが存在しない場合は400エラー
    if (!refreshTokenDoc) {
      res.status(400).json({ error: 'Invalid refresh_token' })
      return
    }

    // トークンが使用済みまたは取り消し済みの場合は400エラー
    if (refreshTokenDoc.used || refreshTokenDoc.revoked) {
      res.status(400).json({ error: 'Refresh token already used or revoked' })
      return
    }

    // リフレッシュトークンを取り消し
    try {
      const updatedRefreshToken: RefreshTokenDocument = {
        refresh_token: refreshTokenDoc.refresh_token,
        address: refreshTokenDoc.address,
        publicKey: refreshTokenDoc.publicKey,
        used: true,
        used_at: new Date(),
        revoked: false,
      }
      await setRefreshToken(refresh_token, updatedRefreshToken)
    } catch (dbError) {
      logger.error(`Failed to revoke token: ${(dbError as Error).message}`)
      // トークン無効化失敗は致命的ではないので続行
    }
    res.json({ status: 'ok', message: 'refresh token revoked' })
  } catch (err) {
    logger.error(`/oauth/logout error: ${(err as Error).message}`)
    res.status(500).json({ error: 'Internal server error' })
  }
}
