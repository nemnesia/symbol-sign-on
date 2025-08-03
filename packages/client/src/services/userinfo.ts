/**
 * ユーザー情報を取得するためのサービス
 */
import { Request, Response } from 'express'
import { verifyAndRevokeJWT } from '../utils/jwt.js'
import logger from '../utils/logger.js'

/**
 * Symbolネットワークタイプ
 */
const SYMBOL_NETWORK_TYPE = process.env.SYMBOL_NETWORK_TYPE || 'testnet'

/**
 * ユーザー情報を取得するためのハンドラー
 * @param req リクエストオブジェクト
 * @param res レスポンスオブジェクト
 */
export async function handleUserinfo(req: Request, res: Response): Promise<void> {
  try {
    const auth = req.headers['authorization']

    // Authorizationヘッダーのチェック
    if (!auth || !auth.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' })
      return
    }

    // トークンからBearerを除去
    const token = auth.replace('Bearer ', '').trim()

    logger.debug('Processing userinfo request with provided token')

    // JWTの検証とリフレッシュ
    const decodedToken = await verifyAndRevokeJWT(token)
    if (!decodedToken) {
      res.status(401).json({
        error: 'invalid_token',
        error_description: 'The access token is invalid or has expired',
      })
      return
    }
    const address = decodedToken.sub
    const publicKey = decodedToken.pub
    const network = SYMBOL_NETWORK_TYPE
    res.json({ address, publicKey, network })
  } catch (err) {
    logger.error(`/oauth/userinfo error: ${(err as Error).message}`)
    res.status(500).json({ error: 'Internal server error' })
  }
}
