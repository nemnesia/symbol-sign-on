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
import { deleteRefreshToken, getAuthCode, getRefreshToken, setAuthCode, setRefreshToken } from '../db/redis.js'
import { AuthCodeDocument, RefreshTokenDocument } from '../types/redis.types.js'
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
    const { grant_type, code, client_id, refresh_token, code_verifier } = req.body

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
      if (!refresh_token || !client_id) {
        res.status(400).json({ error: 'Missing refresh_token or client_id' })
        return
      }
      await handleRefreshTokenGrant(res, refresh_token, client_id)
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
    authCodeDoc = (await getAuthCode(authCode)) as AuthCodeDocument | null
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
        res.status(500).json({ error: 'server_error', error_description: 'Failed to verify code challenge' })
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
  const accessToken = generateJWT(authCodeDoc.address!, authCodeDoc.publicKey!, clientId)
  const refreshToken = uuidv4()

  // 認可コードを使用済みに更新
  try {
    await setAuthCode(authCode, { ...authCodeDoc, used: true, used_at: new Date() })
  } catch (dbError) {
    logger.error(`Failed to update auth code: ${(dbError as Error).message}`)
  }

  // リフレッシュトークン保存
  try {
    const refreshTokenDoc: RefreshTokenDocument = {
      refresh_token: refreshToken,
      address: authCodeDoc.address,
      publicKey: authCodeDoc.publicKey,
      used: false,
      revoked: false,
    }
    await setRefreshToken(refreshToken, refreshTokenDoc)
  } catch (dbError) {
    logger.error(`Failed to store refresh token: ${(dbError as Error).message}`)
  }

  // トークン発行成功レスポンス
  logger.info(`Token issued for client: ${clientId}`)
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
async function handleRefreshTokenGrant(res: Response, refreshToken: string, clientId: string): Promise<void> {
  // リフレッシュトークン有効性チェック
  let refreshTokenDoc: RefreshTokenDocument | null = null
  try {
    refreshTokenDoc = await getRefreshToken(refreshToken)
  } catch (dbError) {
    logger.error(`Database query failed: ${(dbError as Error).message}`)
    res.status(500).json({ error: 'Database connection error' })
    return
  }

  if (!refreshTokenDoc || refreshTokenDoc.used || refreshTokenDoc.revoked === true) {
    logger.warn(`Invalid or used/expired refresh_token: token=${refreshToken}`)
    res.status(400).json({ error: 'Invalid or used/expired refresh_token' })
    return
  }

  // JWT・新しいリフレッシュトークン発行
  const accessToken = generateJWT(refreshTokenDoc.address!, refreshTokenDoc.publicKey!, clientId)
  const newRefreshToken = uuidv4()

  // 古いリフレッシュトークン削除
  try {
    await deleteRefreshToken(refreshToken)
  } catch (dbError) {
    logger.error(`Failed to delete old token: ${(dbError as Error).message}`)
  }

  // 新しいリフレッシュトークン保存
  try {
    const newRefreshTokenDoc: RefreshTokenDocument = {
      refresh_token: newRefreshToken,
      address: refreshTokenDoc.address,
      publicKey: refreshTokenDoc.publicKey,
      used: false,
      revoked: false,
    }
    await setRefreshToken(newRefreshToken, newRefreshTokenDoc)
  } catch (dbError) {
    logger.error(`Failed to store new refresh token: ${(dbError as Error).message}`)
  }

  // トークン再発行成功レスポンス
  logger.info(`Token refreshed for client: ${clientId}`)
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
