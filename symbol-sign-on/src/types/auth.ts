/**
 * OAuth2認証で使用する型定義
 */

/**
 * クライアントドキュメントの型
 */
export interface ClientDocument {
  client_id: string
  trusted_redirect_uris: string[]
  createdAt: Date
}

/**
 * チャレンジドキュメントの型
 */
export interface ChallengeDocument {
  challenge: string
  publicKey?: string | null
  client_id?: string
  redirect_uri?: string
  expires_at?: Date
  createdAt: Date
}

/**
 * 認可コードドキュメントの型
 */
export interface AuthCodeDocument {
  code: string
  address: string
  publicKey?: string | null
  expires_at?: Date
  used?: boolean
  used_at?: Date
  createdAt: Date
}

/**
 * トークンドキュメントの型
 */
export interface TokenDocument {
  refresh_token: string
  address: string
  publicKey?: string | null
  expires_at: Date
  issued_at: Date
  used?: boolean
  used_at?: Date
  revoked?: boolean
  revoked_at?: Date
  createdAt: Date
}
