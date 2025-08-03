/**
 * JWTペイロードの型定義
 */
export interface JWTPayload {
  sub: string
  pub: string
  client_id: string
  iat: number
  jwtId: string
  type: 'access_token'
  refresh?: boolean
}
