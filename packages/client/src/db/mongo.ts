import { Collection, Db, MongoClient } from 'mongodb'
import {
  AccessTokenBlacklistDocument,
  AuthCodeDocument,
  ChallengeDocument,
  ClientDocument,
  SessionDocument,
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
export let AccessTokenBlacklist: Collection<AccessTokenBlacklistDocument>
export let Sessions: Collection<SessionDocument>

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
  Sessions = db.collection('sessions')
  AccessTokenBlacklist = db.collection('access_token_blacklist')

  /**
   * クライアントコレクションのインデックス作成
   * インデックス1
   * - client_id  クライアントID
   * - unique     ユニーク制約を付与
   */
  try {
    await Clients.createIndex({ client_id: 1 }, { unique: true })
  } catch (error) {
    logger.warn('Failed to create index for clients:', (error as Error).message)
  }

  /**
   * チャレンジコレクションのインデックス作成
   * インデックス1
   * - client_id  クライアントID
   * - challenge  チャレンジ
   * - unique     ユニーク制約を付与
   * インデックス2
   * - expires_at  有効期限
   * - expireAfterSeconds  経過時間で自動削除
   */
  try {
    await Challenges.createIndex({ client_id: 1, challenge: 1 }, { unique: true })
    await Challenges.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 })
  } catch (error) {
    logger.warn('Failed to create index for challenges:', (error as Error).message)
  }

  /**
   * 認可コードコレクションのインデックス作成
   * インデックス1
   * - client_id  クライアントID
   * - auth_code  認可コード
   * - unique     ユニーク制約を付与
   * インデックス2
   * - expires_at  有効期限
   * - expireAfterSeconds  経過時間で自動削除
   */
  try {
    await AuthCodes.createIndex({ client_id: 1, auth_code: 1 }, { unique: true })
    await AuthCodes.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 })
  } catch (error) {
    logger.warn('Failed to create index for authcodes:', (error as Error).message)
  }

  /**
   * セッションコレクションのインデックス作成
   * インデックス1
   * - session_id  セッションID
   * - unique      ユニーク制約を付与
   * インデックス2
   * - client_id   クライアントID
   * インデックス3
   * - client_id   クライアントID
   * - refresh_token リフレッシュトークン
   * インデックス4
   * - revoked     無効化フラグ
   * インデックス5
   * - expires_at リフレッシュトークン有効期限
   * - expireAfterSeconds  経過時間で自動削除
   */
  try {
    await Sessions.createIndex({ session_id: 1 }, { unique: true })
    await Sessions.createIndex({ client_id: 1 })
    await Sessions.createIndex({ client_id: 1, refresh_token: 1 })
    await Sessions.createIndex({ revoked: 1 })
    await Sessions.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 })
  } catch (error) {
    logger.warn('Failed to create index for sessions:', (error as Error).message)
  }

  /**
   * アクセストークンブラックリストコレクションのインデックス作成
   * インデックス1
   * - access_token アクセストークン
   * - unique      ユニーク制約を付与
   * インデックス2
   * - client_id   クライアントID
   * インデックス3
   * - client_id   クライアントID
   * - access_token アクセストークン
   * インデックス4
   * - revoked_at  無効化日時
   * インデックス5
   * - expires_at  有効期限
   * - expireAfterSeconds  経過時間で自動削除
   */
  try {
    await AccessTokenBlacklist.createIndex({ access_token: 1 }, { unique: true })
    await AccessTokenBlacklist.createIndex({ client_id: 1 })
    await AccessTokenBlacklist.createIndex({ client_id: 1, access_token: 1 })
    await AccessTokenBlacklist.createIndex({ revoked_at: 1 })
    await AccessTokenBlacklist.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 })
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
 * URLからオリジンを抽出
 * @param url URL文字列
 * @returns オリジン文字列またはnull（無効なURLの場合）
 */
function extractOrigin(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/**
 * 全クライアントのtrusted_redirect_urisを集めてCORS許可オリジンとして返す
 */
export async function getAllowedOriginsFromMongo(): Promise<string[]> {
  if (!Clients) return []
  const clients = await Clients.find({}).toArray()

  // trusted_redirect_uriからオリジン部分だけ抽出し、重複除去
  const origins = clients
    .flatMap((c) => {
      const uris =
        typeof c.trusted_redirect_uri === 'string'
          ? [c.trusted_redirect_uri]
          : Array.isArray(c.trusted_redirect_uri)
            ? c.trusted_redirect_uri
            : []
      return uris.map((url) => extractOrigin(url))
    })
    .filter((o): o is string => !!o) // nullを除外

  // 重複除去
  return Array.from(new Set(origins))
}

/**
 * チャレンジドキュメント登録
 * @param doc チャレンジドキュメント
 * @param expiresIn 有効期限（秒）
 */
export async function insertChallenge(
  doc: Omit<ChallengeDocument, 'created_at' | 'updated_at' | 'expires_at'>,
  expiresIn = CHALLENGE_EXPIRATION,
): Promise<void> {
  ensureMongoConnected()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + expiresIn * 1000)

  const fullDoc: ChallengeDocument = {
    ...doc,
    expires_at: expiresAt,
    created_at: now,
    updated_at: now,
  }

  await Challenges.insertOne(fullDoc)
}

/**
 * チャレンジドキュメント取得
 * @param clientId クライアントID
 * @param challenge チャレンジ
 * @returns チャレンジドキュメントまたはnull
 */
export async function findChallenge(
  clientId: string,
  challenge: string,
): Promise<ChallengeDocument | null> {
  ensureMongoConnected()
  const doc = await Challenges.findOne({ client_id: clientId, challenge: challenge })
  return doc || null
}

/**
 * チャレンジドキュメント削除
 * @param clientId クライアントID
 * @param challenge チャレンジ
 */
export async function deleteChallenge(clientId: string, challenge: string): Promise<void> {
  ensureMongoConnected()
  await Challenges.deleteOne({ client_id: clientId, challenge: challenge })
}

/**
 * 認可コードドキュメント登録
 * @param authCode 認可コード
 * @param doc 認可コードドキュメント
 * @param expiresIn 有効期限（秒）
 */
export async function insertAuthCode(
  doc: Omit<AuthCodeDocument, 'created_at' | 'updated_at' | 'expires_at'>,
  expiresIn = AUTHCODE_EXPIRATION,
): Promise<void> {
  ensureMongoConnected()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + expiresIn * 1000)

  const fullDoc: AuthCodeDocument = {
    ...doc,
    expires_at: expiresAt,
    created_at: now,
    updated_at: now,
  }

  await AuthCodes.insertOne(fullDoc)
}

/**
 * 認可コードドキュメント取得
 * @param clientId クライアントID
 * @param authCode 認可コード
 * @returns 認可コードドキュメントまたはnull
 */
export async function findAuthCode(
  clientId: string,
  authCode: string,
): Promise<AuthCodeDocument | null> {
  ensureMongoConnected()
  const doc = await AuthCodes.findOne({ client_id: clientId, auth_code: authCode })
  return doc || null
}

/**
 * 認可コードドキュメント更新
 * @param clientId クライアントID
 * @param authCode 認可コード
 * @param updateFields 更新するフィールド
 */
export async function updateAuthCode(
  clientId: string,
  authCode: string,
  updateFields: Partial<Omit<AuthCodeDocument, 'created_at' | 'updated_at' | 'expires_at'>>,
): Promise<void> {
  ensureMongoConnected()

  const result = await AuthCodes.updateOne(
    { client_id: clientId, auth_code: authCode },
    { $set: updateFields },
  )

  if (result.matchedCount === 0) {
    throw new Error(`AuthCode not found: ${authCode}`)
  }
}

/**
 * セッションドキュメント登録
 * @param doc セッションドキュメント
 * @param expiresIn 有効期限（秒）
 */
export async function insertSession(
  doc: Omit<SessionDocument, 'created_at' | 'updated_at' | 'expires_at'>,
  expiresIn = REFRESH_TOKEN_EXPIRATION,
): Promise<void> {
  ensureMongoConnected()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + expiresIn * 1000)

  const fullDoc: SessionDocument = {
    ...doc,
    expires_at: expiresAt,
    created_at: now,
    updated_at: now,
  }

  await Sessions.insertOne(fullDoc)
}

/**
 * セッションドキュメント取得（セッションIDで検索）
 * @param sessionId セッションID
 * @returns セッションドキュメントまたはnull
 */
export async function findSession(sessionId: string): Promise<SessionDocument | null> {
  ensureMongoConnected()
  const doc = await Sessions.findOne({ session_id: sessionId })
  return doc || null
}

/**
 * セッションドキュメント取得（クライアントIDで検索）
 * @param clientId クライアントID
 * @returns セッションドキュメントまたはnull
 */
export async function findSessionByClientId(clientId: string): Promise<SessionDocument | null> {
  ensureMongoConnected()
  const doc = await Sessions.findOne({ client_id: clientId })
  return doc || null
}

/**
 * セッションドキュメント取得（リフレッシュトークンで検索）
 * @param refreshToken リフレッシュトークン
 * @returns セッションドキュメントまたはnull
 */
export async function findSessionByRefreshToken(
  refreshToken: string,
): Promise<SessionDocument | null> {
  ensureMongoConnected()
  const doc = await Sessions.findOne({ refresh_token: refreshToken })
  return doc || null
}

/**
 * セッションドキュメント取得（クライアントIDとリフレッシュトークンで検索）
 * @param clientId クライアントID
 * @param refreshToken リフレッシュトークン
 * @returns セッションドキュメントまたはnull
 */
export async function findSessionByClientIdAndRefreshToken(
  clientId: string,
  refreshToken: string,
): Promise<SessionDocument | null> {
  ensureMongoConnected()
  const doc = await Sessions.findOne({ client_id: clientId, refresh_token: refreshToken })
  return doc || null
}

/**
 * セッションドキュメント取得（クライアントIDとアクセストークンで検索）
 * @param clientId クライアントID
 * @param accessToken アクセストークン
 * @returns セッションドキュメントまたはnull
 */
export async function findSessionByClientIdAndAccessToken(
  clientId: string,
  accessToken: string,
): Promise<SessionDocument | null> {
  ensureMongoConnected()
  const doc = await Sessions.findOne({ client_id: clientId, access_token: accessToken })
  return doc || null
}

/**
 * セッションドキュメント更新
 * @param sessionId セッションID
 * @param updateFields 更新するフィールド
 */
export async function updateSession(
  sessionId: string,
  updateFields: Partial<Omit<SessionDocument, 'created_at' | 'updated_at' | 'expires_at'>>,
): Promise<void> {
  ensureMongoConnected()

  const result = await Sessions.updateOne({ session_id: sessionId }, { $set: updateFields })

  if (result.matchedCount === 0) {
    throw new Error(`Session not found: ${sessionId}`)
  }
}

/**
 * アクセストークンブラックリストドキュメント登録
 * @param doc トークンドキュメント
 * @param expiresIn 有効期限（秒）
 */
export async function insertAccessTokenBlacklist(
  doc: Omit<AccessTokenBlacklistDocument, 'created_at' | 'updated_at' | 'expires_at'>,
  expiresIn = ACCESS_TOKEN_EXPIRATION,
): Promise<void> {
  ensureMongoConnected()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + expiresIn * 1000)

  const fullDoc: AccessTokenBlacklistDocument = {
    ...doc,
    expires_at: expiresAt,
    created_at: now,
    updated_at: now,
  }

  await AccessTokenBlacklist.insertOne(fullDoc)
  logger.debug(
    `Access token blacklist set: ${(doc as any).access_token}, expires in ${expiresIn} seconds`,
  )
}

/**
 * アクセストークンブラックリストドキュメント取得（クライアントIDで検索）
 * @param clientId クライアントID
 * @returns アクセストークンブラックリストドキュメントまたはnull
 */
export async function findAccessTokenBlacklistByClientId(
  clientId: string,
): Promise<AccessTokenBlacklistDocument | null> {
  ensureMongoConnected()
  const doc = await AccessTokenBlacklist.findOne({ client_id: clientId })
  return doc || null
}

/**
 * アクセストークンブラックリストドキュメント取得（クライアントIDとアクセストークンで検索）
 * @param clientId クライアントID
 * @param accessToken アクセストークン
 * @returns アクセストークンブラックリストドキュメントまたはnull
 */
export async function findAccessTokenBlacklistByClientIdAndAccessToken(
  clientId: string,
  accessToken: string,
): Promise<AccessTokenBlacklistDocument | null> {
  ensureMongoConnected()
  const doc = await AccessTokenBlacklist.findOne({ client_id: clientId, access_token: accessToken })
  return doc || null
}

/**
 * MongoDBが接続されていることを確認
 * @throws Error if MongoDB is not connected
 */
export function ensureMongoConnected() {
  if (!db) throw new Error('MongoDB not connected')
}
