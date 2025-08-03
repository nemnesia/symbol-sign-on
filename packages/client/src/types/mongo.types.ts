/**
 * 許可されているクライアントのドキュメント定義
 * MongoDBのクライアントコレクションに対応
 */
export interface ClientDocument {
  client_id: string
  trusted_redirect_uris: string[]
  createdAt: Date
}
