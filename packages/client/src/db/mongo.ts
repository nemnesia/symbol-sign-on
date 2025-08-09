import { Collection, Db, MongoClient } from 'mongodb'
import { ClientDocument } from '../types/mongo.types.js'

let client: MongoClient | null = null
let db: Db | null = null

// 型安全なコレクション定義
export let Clients: Collection<ClientDocument>

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

  // Clients コレクションのインデックス作成
  try {
    await Clients.createIndex({ client_id: 1 }, { unique: true })
  } catch (error) {
    console.warn('Failed to create index for clients:', (error as Error).message)
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
    console.log('Disconnected from MongoDB')
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
