/**
 * Redisクライアントの初期化と操作
 * Redisを使用してチャレンジ、認可コード、トークンの管理を行う
 */
import Redis from 'ioredis'
import {
  AccessTokenBlacklistDocument,
  AuthCodeDocument,
  ChallengeDocument,
  RefreshTokenDocument,
} from '../types/redis.types.js'
import logger from '../utils/logger.js'
import { parseTimeToSeconds } from '../utils/time.js'

/**
 * チャレンジの有効期限（秒）
 */
const CHALLENGE_EXPIRATION = parseTimeToSeconds(process.env.CHALLENGE_EXPIRATION || '3m')

/**
 * 認可コードの有効期限（秒）
 */
const AUTHCODE_EXPIRATION = parseTimeToSeconds(process.env.AUTHCODE_EXPIRATION || '2m')

/**
 * リフレッシュトークンの有効期限（秒）
 */
const REFRESH_TOKEN_EXPIRATION = parseTimeToSeconds(process.env.REFRESH_TOKEN_EXPIRATION || '30d')

/**
 * アクセストークンの有効期限（秒）
 */
const ACCESS_TOKEN_EXPIRATION = parseTimeToSeconds(process.env.ACCESS_TOKEN_EXPIRATION || '15m')

// Redisクライアントの初期化
let redis: Redis.Cluster | null = null

/**
 * Redisクラスタに接続
 */
export async function connectToRedis(): Promise<void> {
  const hosts = process.env.REDIS_CLUSTER_HOSTS
  if (!hosts) {
    throw new Error('REDIS_CLUSTER_HOSTS is not set in .env')
  }
  const nodes = hosts.split(',').map((h) => {
    const [host, port] = h.split(':')
    return { host, port: Number(port) }
  })
  redis = new Redis.Cluster(nodes)
}

/**
 * Redisクライアントを取得
 */
export function getRedisClient(): Redis.Cluster | null {
  return redis
}

/**
 * Redisクラスタの接続を閉じる
 */
export async function closeConnection(): Promise<void> {
  if (redis) {
    await redis.quit()
    console.log('Disconnected from Redis Cluster')
    redis = null
  }
}

/**
 * チャレンジをRedisに保存
 * @param key チャレンジキー
 * @param value チャレンジドキュメント
 * @param expiresIn 有効期限（秒）
 */
export async function setChallenge(
  key: string,
  value: ChallengeDocument,
  expiresIn = CHALLENGE_EXPIRATION,
): Promise<void> {
  ensureRedisConnected()
  await redis!.set(`challenge:${key}`, JSON.stringify(value), 'EX', expiresIn)
}

/**
 * チャレンジをRedisから取得
 * @param key チャレンジキー
 * @returns チャレンジドキュメントまたはnull
 */
export async function getChallenge(key: string): Promise<ChallengeDocument | null> {
  ensureRedisConnected()
  const val = await redis!.get(`challenge:${key}`)
  return val ? JSON.parse(val) : null
}

/**
 * チャレンジをRedisから削除
 * @param key チャレンジキー
 * @returns チャレンジを削除
 */
export async function deleteChallenge(key: string): Promise<void> {
  ensureRedisConnected()
  await redis!.del(`challenge:${key}`)
}

/**
 * 認可コードをRedisに保存
 * @param authCode 認可コード
 * @param doc 認可コードドキュメント
 * @param expiresIn 有効期限（秒）
 */
export async function setAuthCode(
  authCode: string,
  doc: AuthCodeDocument,
  expiresIn = AUTHCODE_EXPIRATION,
): Promise<void> {
  ensureRedisConnected()
  await redis!.set(`authcode:${authCode}`, JSON.stringify(doc), 'EX', expiresIn)
}

/**
 * 認可コードをRedisから取得
 * @param authCode 認可コード
 * @returns 認可コードドキュメントまたはnull
 */
export async function getAuthCode(authCode: string): Promise<AuthCodeDocument | null> {
  ensureRedisConnected()
  const val = await redis!.get(`authcode:${authCode}`)
  return val ? JSON.parse(val) : null
}

/**
 * リフレッシュトークンをRedisに保存
 * @param refreshToken リフレッシュトークン
 * @param doc トークンドキュメント
 * @param expiresIn 有効期限（秒）
 */
export async function setRefreshToken(
  refreshToken: string,
  doc: RefreshTokenDocument,
  expiresIn = REFRESH_TOKEN_EXPIRATION,
): Promise<void> {
  ensureRedisConnected()
  await redis!.set(`refresh_token:${refreshToken}`, JSON.stringify(doc), 'EX', expiresIn)
  logger.debug(`Refresh token set: ${refreshToken}, expires in ${expiresIn} seconds`)
}

/**
 * リフレッシュトークンをRedisから取得
 * @param refreshToken リフレッシュトークン
 * @returns トークンドキュメントまたはnull
 */
export async function getRefreshToken(refreshToken: string): Promise<RefreshTokenDocument | null> {
  ensureRedisConnected()
  const val = await redis!.get(`refresh_token:${refreshToken}`)
  logger.debug(`Get refresh token: ${refreshToken}, value: ${val}`)
  return val ? JSON.parse(val) : null
}

/**
 * リフレッシュトークンをRedisから削除
 * @param refreshToken リフレッシュトークン
 * @returns トークンを削除
 */
export async function deleteRefreshToken(refreshToken: string): Promise<void> {
  ensureRedisConnected()
  await redis!.del(`refresh_token:${refreshToken}`)
  logger.debug(`Refresh token deleted: ${refreshToken}`)
}

/**
 * アクセストークンブラックリストをRedisに保存
 * @param jwtId JWT ID（アクセストークン）
 * @param doc トークンドキュメント
 * @param expiresIn 有効期限（秒）
 */
export async function setAccessTokenBlacklist(
  jwtId: string,
  doc: AccessTokenBlacklistDocument,
  expiresIn = ACCESS_TOKEN_EXPIRATION,
): Promise<void> {
  ensureRedisConnected()
  await redis!.set(`blacklist:access_token:${jwtId}`, JSON.stringify(doc), 'EX', expiresIn)
  logger.debug(`Access token blacklist set: ${jwtId}, expires in ${expiresIn} seconds`)
}

/**
 * redisが接続されていることを確認
 * @throws Error if redis is not connected
 */
export function ensureRedisConnected() {
  if (!redis) throw new Error('Redis not connected')
}
