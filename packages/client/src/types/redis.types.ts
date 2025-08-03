/**
 * チャレンジドキュメント定義
 * Redisのチャレンジキーに対応
 */
export interface ChallengeDocument {
  challenge: string
  client_id: string
  redirect_uri: string
}

/**
 * 認可コードドキュメント定義
 * Redisの認可コードキーに対応
 */
export interface AuthCodeDocument {
  auth_code: string
  address: string
  publicKey: string | null
  used?: boolean
  used_at?: Date
  pkce_challenge?: string
  pkce_challenge_method?: string
}

/**
 * リフレッシュトークンドキュメント定義
 * Redisのリフレッシュトークンキーに対応
 */
export interface RefreshTokenDocument {
  refresh_token: string
  address: string
  publicKey: string | null
  used: boolean
  used_at?: Date
  revoked: boolean
  revoked_at?: Date
}

/**
 * アクセストークンブラックリスト用ドキュメント定義
 * Redisのブラックリストキーに対応
 */
export interface AccessTokenBlacklistDocument {
  jwt_id: string // JWT ID（アクセストークン）
  revoked_at: Date // 無効化日時
  exp?: number // 有効期限（UNIX秒）
  reason?: string // 無効化理由（任意）
}
