/**
 * JWTの検証ユーティリティ
 * 不正な場合はJWT ID（アクセストークン）をブラックリストに追加する。
 */
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import { setAccessTokenBlacklist } from '../db/mongo.js'
import { JWTPayload } from '../types/jwt.types.js'
import { AccessTokenBlacklistDocument } from '../types/mongo.types.js'
import logger from '../utils/logger.js'
import { parseTimeToSeconds } from './time.js'

/**
 * JWTの秘密鍵
 */
const JWT_SECRET = process.env.JWT_SECRET || 'development_fallback_jwt_secret'

/**
 * JWTの有効期限（秒）
 */
const JWT_EXPIRES_IN = parseTimeToSeconds(process.env.JWT_EXPIRES_IN || '1h')

/**
 * JWTを生成する関数
 * @param symbolAddress ユーザーのSymbolアドレス
 * @param symbolPublicKey ユーザーのSymbol公開鍵
 * @param clientId クライアントID
 * @returns 生成されたJWT
 */
export function generateJWT(symbolAddress: string, symbolPublicKey: string, clientId: string): string {
  const jwtPayload: JWTPayload = {
    sub: symbolAddress, // サブジェクトはSymbolアドレス
    pub: symbolPublicKey, // 公開鍵
    client_id: clientId, // クライアントID
    iat: Math.floor(Date.now() / 1000), // 発行時刻
    jwtId: uuidv4(), // JWT ID - 一意性を保証
    type: 'access_token', // トークンタイプ
  }

  return jwt.sign(jwtPayload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    algorithm: 'HS256',
  })
}

/**
 * JWTの検証ユーティリティ
 * 不正な場合はJWT ID（アクセストークン）をブラックリストに追加する。
 * @param jwtId JWT ID（アクセストークン）
 * @returns JWTPayload | null
 */
export async function verifyAndRevokeJWT(jwtId: string): Promise<JWTPayload | null> {
  try {
    return jwt.verify(jwtId, JWT_SECRET) as JWTPayload
  } catch {
    logger.error(`JWT verification error: Token invalid or expired`)
    // トークンが無効な場合はブラックリストに追加
    addBlacklistEntry(jwtId)
    return null
  }
}

/**
 * アクセストークンをブラックリストに追加
 * @param jwtId JWT ID（アクセストークン）
 */
function addBlacklistEntry(jwtId: string): void {
  const accessTokenBlacklistDocument: Omit<AccessTokenBlacklistDocument, 'createdAt' | 'expiresAt'> = {
    jwt_id: jwtId,
    revoked_at: new Date(),
  }
  // ブラックリスト登録
  setAccessTokenBlacklist(jwtId, accessTokenBlacklistDocument)
  logger.info(`JWT ${jwtId} added to blacklist`)
}
