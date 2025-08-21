/**
 * タイムスタンプのドキュメント定義
 */
export interface TimestampDocument {
  /** 有効期限 */
  expires_at: Date
  /** 作成日時 */
  created_at: Date
  /** 更新日時 */
  updated_at: Date
}

/**
 * 許可されているクライアントのドキュメント定義
 * 許可済のWebアプリケーションやモバイルアプリケーションの情報を保持します。
 */
export interface ClientDocument extends TimestampDocument {
  /** クライアントID */
  client_id: string
  /** リダイレクトURL */
  trusted_redirect_uri: string
  /** アプリケーション名 */
  app_name: string
}

/**
 * チャレンジドキュメント定義
 * 認可リクエストにおけるユーザーへ渡したチャレンジ情報を保持します。
 */
export interface ChallengeDocument extends TimestampDocument {
  /** クライアントID */
  client_id: string
  /** チャレンジ */
  challenge: string
}

/**
 * 認可コードドキュメント定義
 * 認可リクエストにおけるユーザーから受け取った認可コード情報を保持します。
 */
export interface AuthCodeDocument extends TimestampDocument {
  /** クライアントID */
  client_id: string
  /** 認可コード */
  auth_code: string
  /** PKCEチャレンジ */
  pkce_challenge?: string
  /** PKCEチャレンジメソッド */
  pkce_challenge_method?: string
  /** Symbolアドレス */
  symbol_address: string
  /** Symbol公開鍵 */
  symbol_public_key: string
  /** 使用済みフラグ */
  used: boolean
  /** 使用日時 */
  used_at?: Date
}

/**
 * セッションドキュメント定義
 */
export interface SessionDocument extends TimestampDocument {
  /** セッションID */
  session_id: string
  /** クライアントID */
  client_id: string
  /** リフレッシュトークン */
  refresh_token: string
  /** アクセストークン */
  access_token: string
  /** Symbolアドレス */
  symbol_address: string
  /** Symbol公開鍵 */
  symbol_public_key: string
  /** 無効化フラグ */
  revoked: boolean
  /** 無効化日時 */
  revoked_at?: Date
}

/**
 * アクセストークンブラックリストドキュメント定義
 */
export interface AccessTokenBlacklistDocument extends TimestampDocument {
  /** クライアントID */
  client_id: string
  /** アクセストークン */
  access_token?: string
  /** 無効化日時 */
  revoked_at: Date
  /** 無効化理由（任意） */
  reason?: string
}
