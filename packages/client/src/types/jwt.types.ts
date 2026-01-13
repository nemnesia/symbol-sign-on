/**
 * JWTペイロードの型定義
 */
export interface JWTPayload {
  /** ユーザーID */
  sub: string
  /** 公開鍵 */
  pub: string
  /** クライアントID */
  client_id: string
  /** 発行時間 */
  iat: number
  /** JWT ID */
  jwtId: string
  /** 有効期限 */
  type: 'access_token'
  /** リフレッシュトークンかどうか */
  refresh?: boolean
}
