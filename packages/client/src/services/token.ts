/**
 * OAuth2 Token Endpoint Service
 * OAuth2トークンエンドポイントの処理を担当する
 * - Authorization Code Grant
 * - Refresh Token Grant
 * - PKCE検証
 * - JWT生成・発行
 */
import crypto from 'crypto'
import { Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import {
  findAuthCode,
  findSessionByRefreshToken,
  insertSession,
  updateAuthCode,
  updateSession,
} from '../db/mongo.js'
import { AuthCodeDocument, SessionDocument } from '../types/mongo.types.js'
import { generateJWT } from '../utils/jwt.js'
import logger from '../utils/logger.js'
import { parseTimeToSeconds } from '../utils/time.js'

/**
 * JWTの有効期限（秒）
 */
const JWT_EXPIRES_IN = parseTimeToSeconds(process.env.JWT_EXPIRES_IN || '1h')

/**
 * /oauth/token エンドポイントの処理
 * OAuth2 Token Endpointの実装
 * @param req Expressリクエスト
 * @param res Expressレスポンス
 */
export async function handleToken(req: Request, res: Response): Promise<void> {
  try {
    const { grant_type, code, client_id, code_verifier } = req.body

    // 必須パラメータの検証
    if (!grant_type) {
      res.status(400).json({ error: 'Missing grant_type' })
      return
    }

    if (grant_type === 'authorization_code') {
      // 認可コードグラントの処理
      if (!code || !client_id) {
        res.status(400).json({ error: 'Missing code or client_id' })
        return
      }
      await handleAuthorizationCodeGrant(res, code, client_id, code_verifier)
    } else if (grant_type === 'refresh_token') {
      // リフレッシュトークングラントの処理
      // HTTP Only Cookieからリフレッシュトークンを取得
      console.log('クッキー:', req.cookies)
      const refreshToken = req.cookies.refresh_token
      if (!refreshToken) {
        res
          .status(401)
          .json({ error: 'Unauthorized', error_description: 'Refresh token is missing' })
        return
      }
      if (!refreshToken || !client_id) {
        res.status(400).json({ error: 'Missing refresh_token or client_id' })
        return
      }
      await handleRefreshTokenGrant(res, refreshToken, client_id)
    } else {
      res.status(400).json({ error: 'Unsupported grant_type' })
    }
  } catch (err) {
    logger.error(`/oauth/token error: ${(err as Error).message}`)
    res.status(500).json({ error: 'Internal server error' })
  }
}

/**
 * 認可コードグラント処理
 * @param res レスポンスオブジェクト
 * @param authCode 認可コード
 * @param clientId クライアントID
 * @param pkceCodeVerifier PKCEコードベリファイア（オプション）
 */
async function handleAuthorizationCodeGrant(
  res: Response,
  authCode: string,
  clientId: string,
  pkceCodeVerifier?: string,
): Promise<void> {
  // 認可コードの有効性チェック
  let authCodeDoc: AuthCodeDocument | null = null
  try {
    authCodeDoc = (await findAuthCode(clientId, authCode)) as AuthCodeDocument | null
  } catch (dbError) {
    logger.error(`Database query failed: ${(dbError as Error).message}`)
    res.status(500).json({ error: 'Database connection error' })
    return
  }

  if (!authCodeDoc || authCodeDoc.used) {
    logger.warn(`Invalid or used code: code=${authCode}`)
    res.status(400).json({ error: 'Invalid or used code' })
    return
  }

  const authCodeDocRef = authCodeDoc as AuthCodeDocument

  // PKCE検証（S256のみ対応）
  if (authCodeDocRef.pkce_challenge) {
    if (!pkceCodeVerifier) {
      logger.warn('Missing code_verifier for PKCE flow')
      res.status(400).json({
        error: 'invalid_grant',
        error_description: 'PKCE code_verifier is required but was not supplied',
      })
      return
    }

    let calculatedChallenge: string
    if (authCodeDocRef.pkce_challenge_method === 'S256') {
      try {
        calculatedChallenge = calculatePKCEChallenge(pkceCodeVerifier, 'S256')
        logger.debug('PKCE S256 challenge calculated')
      } catch (err) {
        logger.error(`PKCE S256 calculation error: ${err instanceof Error ? err.message : err}`)
        res
          .status(500)
          .json({ error: 'server_error', error_description: 'Failed to verify code challenge' })
        return
      }
    } else {
      logger.warn(`Unsupported PKCE method: ${authCodeDocRef.pkce_challenge_method}`)
      res.status(400).json({
        error: 'invalid_grant',
        error_description: `Unsupported PKCE method: ${authCodeDocRef.pkce_challenge_method}`,
      })
      return
    }

    if (calculatedChallenge !== authCodeDocRef.pkce_challenge) {
      logger.warn('PKCE verification failed: code_verifier does not match code_challenge')
      res.status(400).json({
        error: 'invalid_grant',
        error_description: 'code_verifier does not match code_challenge',
      })
      return
    }
    logger.info('PKCE verification successful')
  }

  // JWT・リフレッシュトークン発行
  const accessToken = generateJWT(authCodeDoc.symbol_address!, authCodeDoc.symbol_public_key!, clientId)
  const refreshToken = uuidv4()

  // 認可コードを使用済みに更新
  try {
    await updateAuthCode(clientId, authCode, { used: true, used_at: new Date() })
  } catch (dbError) {
    logger.error(`Failed to update auth code: ${(dbError as Error).message}`)
  }

  // セッション作成
  try {
    const sessionDoc: Omit<SessionDocument, 'created_at' | 'updated_at' | 'expires_at'> = {
      session_id: uuidv4(),
      client_id: clientId,
      refresh_token: refreshToken,
      access_token: accessToken,
      symbol_address: authCodeDoc.symbol_address,
      symbol_public_key: authCodeDoc.symbol_public_key,
      revoked: false,
    }
    await insertSession(sessionDoc)
  } catch (dbError) {
    logger.error(`Failed to store session: ${(dbError as Error).message}`)
  }

  // トークン発行成功レスポンス
  logger.info(`Token issued for client: ${clientId}`)
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true, // HttpOnly属性を設定
    secure: process.env.NODE_ENV === 'production', // 本番環境ではSecure属性を設定
    path: '/', // アプリ全体
  })
  res.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: JWT_EXPIRES_IN,
  })
}

/**
 * Refresh Token Grantの処理
 * @param res Expressレスポンス
 * @param refreshToken リフレッシュトークン
 * @param clientId クライアントID
 */
async function handleRefreshTokenGrant(
  res: Response,
  refreshToken: string,
  clientId: string,
): Promise<void> {
  // セッション有効性チェック
  let sessionDoc: SessionDocument | null = null
  try {
    sessionDoc = await findSessionByRefreshToken(refreshToken)
  } catch (dbError) {
    logger.error(`Database query failed: ${(dbError as Error).message}`)
    res.status(500).json({ error: 'Database connection error' })
    return
  }

  if (!sessionDoc || sessionDoc.revoked === true) {
    logger.warn(`Invalid or revoked session: token=${refreshToken}`)
    res.status(400).json({ error: 'Invalid or revoked session' })
    return
  }

  // JWT・新しいリフレッシュトークン発行
  const accessToken = generateJWT(sessionDoc.symbol_address!, sessionDoc.symbol_public_key!, clientId)
  const newRefreshToken = uuidv4()

  // 古いセッション無効化
  try {
    await updateSession(sessionDoc.session_id, { revoked: true, revoked_at: new Date() })
  } catch (dbError) {
    logger.error(`Failed to revoke old session: ${(dbError as Error).message}`)
  }

  // 新しいセッション作成
  try {
    const newSessionDoc: Omit<SessionDocument, 'created_at' | 'updated_at' | 'expires_at'> = {
      session_id: uuidv4(),
      client_id: clientId,
      refresh_token: newRefreshToken,
      access_token: accessToken,
      symbol_address: sessionDoc.symbol_address,
      symbol_public_key: sessionDoc.symbol_public_key,
      revoked: false,
    }
    await insertSession(newSessionDoc)
  } catch (dbError) {
    logger.error(`Failed to store new session: ${(dbError as Error).message}`)
  }

  // トークン再発行成功レスポンス
  logger.info(`Token refreshed for client: ${clientId}`)
  res.cookie('refresh_token', newRefreshToken, {
    httpOnly: true, // HttpOnly属性を設定
    secure: process.env.NODE_ENV === 'production', // 本番環境ではSecure属性を設定
    path: '/', // アプリ全体
  })
  res.json({
    access_token: accessToken,
    refresh_token: newRefreshToken,
    expires_in: JWT_EXPIRES_IN,
  })
}

/**
 * PKCE code_challengeを計算する関数
 * @param verifier code_verifier
 * @param method PKCE method ('S256')
 * @returns 計算されたchallenge
 */
export function calculatePKCEChallenge(verifier: string, method: string): string {
  if (method === 'S256') {
    return crypto.createHash('sha256').update(verifier).digest('base64url')
  } else {
    throw new Error(`Unsupported PKCE method: ${method}`)
  }
}
