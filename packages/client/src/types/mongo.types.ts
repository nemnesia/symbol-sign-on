/**
 * 許可されているクライアントのドキュメント定義
 * MongoDBのクライアントコレクションに対応
 */
export interface ClientDocument {
  client_id: string
  trusted_redirect_uri: string
  createdAt: Date
}

/**
 * チャレンジドキュメント定義
 * MongoDBのチャレンジコレクションに対応
 */
export interface ChallengeDocument {
  challenge: string
  client_id: string
  redirect_uri: string
  createdAt: Date
  expiresAt: Date
}

/**
 * 認可コードドキュメント定義
 * MongoDBの認可コードコレクションに対応
 */
export interface AuthCodeDocument {
  auth_code: string
  address: string
  publicKey: string | null
  used?: boolean
  used_at?: Date
  pkce_challenge?: string
  pkce_challenge_method?: string
  createdAt: Date
  expiresAt: Date
}

/**
 * リフレッシュトークンドキュメント定義
 * MongoDBのリフレッシュトークンコレクションに対応
 */
export interface RefreshTokenDocument {
  refresh_token: string
  address: string
  publicKey: string | null
  used: boolean
  used_at?: Date
  revoked: boolean
  revoked_at?: Date
  createdAt: Date
  expiresAt: Date
}

/**
 * アクセストークンブラックリスト用ドキュメント定義
 * MongoDBのブラックリストコレクションに対応
 */
export interface AccessTokenBlacklistDocument {
  jwt_id: string // JWT ID（アクセストークン）
  revoked_at: Date // 無効化日時
  exp?: number // 有効期限（UNIX秒）
  reason?: string // 無効化理由（任意）
  createdAt: Date
  expiresAt: Date
}
