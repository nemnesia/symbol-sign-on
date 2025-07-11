import { MongoClient, Db, Collection } from 'mongodb';
import { ChallengeDocument, AuthCodeDocument, TokenDocument, ClientDocument } from '../types/auth.js';

let client: MongoClient;
let db: Db;

// 型安全なコレクション定義
export let Challenges: Collection<ChallengeDocument>;
export let AuthCodes: Collection<AuthCodeDocument>;
export let Tokens: Collection<TokenDocument>;
export let Clients: Collection<ClientDocument>;

/**
 * MongoDBに接続し、各コレクションを初期化
 */
export async function connectToMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set in .env');
  }

  client = new MongoClient(uri);
  await client.connect();
  db = client.db();

  console.log('Connected to MongoDB');

  // コレクション初期化
  Challenges = db.collection('challenges');
  AuthCodes = db.collection('auth_codes');
  Tokens = db.collection('tokens');
  Clients = db.collection('clients');

  // TTLインデックス（challengeは5分で無効化）
  try {
    await Challenges.createIndex({ createdAt: 1 }, { expireAfterSeconds: 300 });
  } catch (error) {
    console.warn('Failed to create TTL index for challenges:', (error as Error).message);
  }

  // 認可コードは10分で失効
  try {
    await AuthCodes.createIndex({ createdAt: 1 }, { expireAfterSeconds: 600 });
  } catch (error) {
    console.warn('Failed to create TTL index for auth codes:', (error as Error).message);
  }

  // アクセストークンは1日で失効（必要に応じて調整可）
  try {
    await Tokens.createIndex({ createdAt: 1 }, { expireAfterSeconds: 86400 });
  } catch (error) {
    console.warn('Failed to create TTL index for tokens:', (error as Error).message);
  }

  // Clients コレクションのインデックス作成
  try {
    await Clients.createIndex({ client_id: 1 }, { unique: true });
  } catch (error) {
    console.warn('Failed to create index for clients:', (error as Error).message);
  }
}

/**
 * データベースインスタンスを取得
 */
export function getDb(): Db | null {
  return db || null;
}

/**
 * データベース接続を閉じる
 */
export async function closeConnection() {
  if (client) {
    await client.close();
    console.log('Disconnected from MongoDB');
  }
}
