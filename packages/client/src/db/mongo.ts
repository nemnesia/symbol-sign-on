import { Collection, Db, MongoClient } from 'mongodb'
import {
  AccessTokenBlacklistDocument,
  AuthCodeDocument,
  ChallengeDocument,
  ClientDocument,
  RefreshTokenDocument,
} from '../types/mongo.types.js'
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

let client: MongoClient | null = null
let db: Db | null = null

// 型安全なコレクション定義
export let Clients: Collection<ClientDocument>
export let Challenges: Collection<ChallengeDocument>
export let AuthCodes: Collection<AuthCodeDocument>
export let RefreshTokens: Collection<RefreshTokenDocument>
export let AccessTokenBlacklist: Collection<AccessTokenBlacklistDocument>

/**
 * MongoDBに接続し、各コレクションを初期化
 */
export async function connectToMongo(): Promise<void> {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error('MONGODB_URI is not set in .env')
  }

  client = new MongoClient(uri)
  await client.connect()
  db = client.db()

  // コレクション初期化
  Clients = db.collection('clients')
  Challenges = db.collection('challenges')
  AuthCodes = db.collection('authcodes')
  RefreshTokens = db.collection('refresh_tokens')
  AccessTokenBlacklist = db.collection('access_token_blacklist')

  // Clients コレクションのインデックス作成
  try {
    await Clients.createIndex({ client_id: 1 }, { unique: true })
  } catch (error) {
    logger.warn('Failed to create index for clients:', (error as Error).message)
  }

  // Challenges コレクションのインデックス作成
  try {
    await Challenges.createIndex({ challenge: 1 }, { unique: true })
    await Challenges.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  } catch (error) {
    logger.warn('Failed to create index for challenges:', (error as Error).message)
  }

  // AuthCodes コレクションのインデックス作成
  try {
    await AuthCodes.createIndex({ auth_code: 1 }, { unique: true })
    await AuthCodes.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  } catch (error) {
    logger.warn('Failed to create index for authcodes:', (error as Error).message)
  }

  // RefreshTokens コレクションのインデックス作成
  try {
    await RefreshTokens.createIndex({ refresh_token: 1 }, { unique: true })
    await RefreshTokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  } catch (error) {
    logger.warn('Failed to create index for refresh_tokens:', (error as Error).message)
  }

  // AccessTokenBlacklist コレクションのインデックス作成
  try {
    await AccessTokenBlacklist.createIndex({ jwt_id: 1 }, { unique: true })
    await AccessTokenBlacklist.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  } catch (error) {
    logger.warn('Failed to create index for access_token_blacklist:', (error as Error).message)
  }
}

/**
 * データベースインスタンスを取得
 */
export function getDb(): Db | null {
  return db
}

/**
 * データベース接続を閉じる
 */
export async function closeConnection(): Promise<void> {
  if (client) {
    await client.close()
    logger.info('Disconnected from MongoDB')
    client = null
    db = null
  }
}

/**
 * 全クライアントのtrusted_redirect_urisを集めてCORS許可オリジンとして返す
 */
export async function getAllowedOriginsFromMongo(): Promise<string[]> {
  if (!Clients) return []
  const clients = await Clients.find({}).toArray()
  // trusted_redirect_urisからオリジン部分だけ抽出し、重複除去
  const origins = clients
    .flatMap((c) => {
      const uris = typeof c.trusted_redirect_uri === 'string'
        ? [c.trusted_redirect_uri]
        : Array.isArray(c.trusted_redirect_uri)
          ? c.trusted_redirect_uri
          : [];
      return uris.map((url) => {
        try {
          const u = new URL(url)
          return u.origin
        } catch {
          return null
        }
      });
    })
    .filter((o): o is string => !!o)
  // 重複除去
  return Array.from(new Set(origins))
}

/**
 * チャレンジをMongoに保存
 * @param key チャレンジキー
 * @param value チャレンジドキュメント
 * @param expiresIn 有効期限（秒）
 */
export async function insertChallenge(
  key: string,
  value: Omit<ChallengeDocument, 'createdAt' | 'expiresAt'>,
  expiresIn = CHALLENGE_EXPIRATION,
): Promise<void> {
  ensureMongoConnected()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + expiresIn * 1000)

  const doc: ChallengeDocument = {
    ...value,
    challenge: key,
    createdAt: now,
    expiresAt: expiresAt,
  }

  await Challenges.insertOne(doc)
}

/**
 * チャレンジをMongoから取得
 * @param key チャレンジキー
 * @returns チャレンジドキュメントまたはnull
 */
export async function findChallenge(key: string): Promise<ChallengeDocument | null> {
  ensureMongoConnected()
  const doc = await Challenges.findOne({ challenge: key })
  return doc || null
}

/**
 * チャレンジをMongoから削除
 * @param key チャレンジキー
 */
export async function deleteChallenge(key: string): Promise<void> {
  ensureMongoConnected()
  await Challenges.deleteOne({ challenge: key })
}

/**
 * 認可コードをMongoに保存
 * @param authCode 認可コード
 * @param doc 認可コードドキュメント
 * @param expiresIn 有効期限（秒）
 */
export async function insertAuthCode(
  authCode: string,
  doc: Omit<AuthCodeDocument, 'createdAt' | 'expiresAt'>,
  expiresIn = AUTHCODE_EXPIRATION,
): Promise<void> {
  ensureMongoConnected()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + expiresIn * 1000)

  const fullDoc: AuthCodeDocument = {
    ...doc,
    auth_code: authCode,
    createdAt: now,
    expiresAt: expiresAt,
  }

  await AuthCodes.insertOne(fullDoc)
}

/**
 * 認可コードをMongoから取得
 * @param authCode 認可コード
 * @returns 認可コードドキュメントまたはnull
 */
export async function findAuthCode(authCode: string): Promise<AuthCodeDocument | null> {
  ensureMongoConnected()
  const doc = await AuthCodes.findOne({ auth_code: authCode })
  return doc || null
}

/**
 * 認可コードを更新
 * @param authCode 認可コード
 * @param updateFields 更新するフィールド
 */
export async function updateAuthCode(
  authCode: string,
  updateFields: Partial<Omit<AuthCodeDocument, 'createdAt' | 'expiresAt'>>,
): Promise<void> {
  ensureMongoConnected()

  const result = await AuthCodes.updateOne(
    { auth_code: authCode },
    { $set: updateFields }
  )

  if (result.matchedCount === 0) {
    throw new Error(`AuthCode not found: ${authCode}`)
  }
}

/**
 * リフレッシュトークンをMongoに保存
 * @param refreshToken リフレッシュトークン
 * @param doc トークンドキュメント
 * @param expiresIn 有効期限（秒）
 */
export async function insertRefreshToken(
  refreshToken: string,
  doc: Omit<RefreshTokenDocument, 'createdAt' | 'expiresAt'>,
  expiresIn = REFRESH_TOKEN_EXPIRATION,
): Promise<void> {
  ensureMongoConnected()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + expiresIn * 1000)

  const fullDoc: RefreshTokenDocument = {
    ...doc,
    refresh_token: refreshToken,
    createdAt: now,
    expiresAt: expiresAt,
  }

  await RefreshTokens.insertOne(fullDoc)
  logger.debug(`Refresh token set: ${refreshToken}, expires in ${expiresIn} seconds`)
}

/**
 * リフレッシュトークンをMongoから取得
 * @param refreshToken リフレッシュトークン
 * @returns トークンドキュメントまたはnull
 */
export async function findRefreshToken(refreshToken: string): Promise<RefreshTokenDocument | null> {
  ensureMongoConnected()
  const doc = await RefreshTokens.findOne({ refresh_token: refreshToken })
  logger.debug(`Get refresh token: ${refreshToken}, value: ${doc}`)
  return doc || null
}

/**
 * リフレッシュトークンをMongoから削除
 * @param refreshToken リフレッシュトークン
 */
export async function deleteRefreshToken(refreshToken: string): Promise<void> {
  ensureMongoConnected()
  await RefreshTokens.deleteOne({ refresh_token: refreshToken })
  logger.debug(`Refresh token deleted: ${refreshToken}`)
}

/**
 * アクセストークンブラックリストをMongoに保存
 * @param jwtId JWT ID（アクセストークン）
 * @param doc トークンドキュメント
 * @param expiresIn 有効期限（秒）
 */
export async function insertAccessTokenBlacklist(
  jwtId: string,
  doc: Omit<AccessTokenBlacklistDocument, 'createdAt' | 'expiresAt'>,
  expiresIn = ACCESS_TOKEN_EXPIRATION,
): Promise<void> {
  ensureMongoConnected()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + expiresIn * 1000)

  const fullDoc: AccessTokenBlacklistDocument = {
    ...doc,
    jwt_id: jwtId,
    createdAt: now,
    expiresAt: expiresAt,
  }

  await AccessTokenBlacklist.insertOne(fullDoc)
  logger.debug(`Access token blacklist set: ${jwtId}, expires in ${expiresIn} seconds`)
}

/**
 * アクセストークンがブラックリストに登録されているかチェック
 * @param jwtId JWT ID（アクセストークン）
 * @returns ブラックリストに登録されている場合はドキュメント、されていない場合はnull
 */
export async function findAccessTokenBlacklist(jwtId: string): Promise<AccessTokenBlacklistDocument | null> {
  ensureMongoConnected()
  const doc = await AccessTokenBlacklist.findOne({ jwt_id: jwtId })
  return doc || null
}

/**
 * MongoDBが接続されていることを確認
 * @throws Error if MongoDB is not connected
 */
export function ensureMongoConnected() {
  if (!db) throw new Error('MongoDB not connected')
}
