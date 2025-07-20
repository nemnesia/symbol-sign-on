import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// MongoDBクライアントをモック
const mockDb = {
  collection: vi.fn(() => ({
    createIndex: vi.fn(),
    findOne: vi.fn(),
    insertOne: vi.fn(),
    updateOne: vi.fn(),
    deleteOne: vi.fn(),
  })),
  admin: vi.fn(() => ({
    ping: vi.fn(),
  }))
}

const mockClient = {
  connect: vi.fn(),
  db: vi.fn(() => mockDb),
  close: vi.fn(),
}

vi.mock('mongodb', () => ({
  MongoClient: vi.fn(() => mockClient)
}))

// 環境変数をモック
vi.mock('dotenv', () => ({
  config: vi.fn()
}))

describe('database connection', () => {
  beforeEach(() => {
    // 環境変数を設定
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'
    vi.clearAllMocks()
  })

  afterEach(() => {
    delete process.env.MONGODB_URI
  })

  it('should import database functions', async () => {
    const { connectToMongo, getDb, closeConnection } = await import('./database.js')

    expect(connectToMongo).toBeDefined()
    expect(typeof connectToMongo).toBe('function')
    expect(getDb).toBeDefined()
    expect(typeof getDb).toBe('function')
    expect(closeConnection).toBeDefined()
    expect(typeof closeConnection).toBe('function')
  })

  it('should establish connection to MongoDB', async () => {
    const { connectToMongo } = await import('./database.js')

    await connectToMongo()

    expect(mockClient.connect).toHaveBeenCalled()
    expect(mockClient.db).toHaveBeenCalled()
  })

  it('should throw error when MONGODB_URI is not set', async () => {
    delete process.env.MONGODB_URI

    const { connectToMongo } = await import('./database.js')

    await expect(connectToMongo()).rejects.toThrow('MONGODB_URI is not set')
  })

  it('should create collections with proper indexes', async () => {
    const { connectToMongo } = await import('./database.js')

    await connectToMongo()

    // コレクションが作成されることを確認
    expect(mockDb.collection).toHaveBeenCalledWith('challenges')
    expect(mockDb.collection).toHaveBeenCalledWith('auth_codes')
    expect(mockDb.collection).toHaveBeenCalledWith('tokens')
    expect(mockDb.collection).toHaveBeenCalledWith('clients')
  })

  it('should get database instance after connection', async () => {
    const { connectToMongo, getDb } = await import('./database.js')

    await connectToMongo()
    const db = getDb()

    expect(db).toBeDefined()
    expect(db).toBe(mockDb)
  })

  it('should close connection properly', async () => {
    const { connectToMongo, closeConnection } = await import('./database.js')

    await connectToMongo()
    await closeConnection()

    expect(mockClient.close).toHaveBeenCalled()
  })

  it('should handle connection errors gracefully', async () => {
    mockClient.connect.mockRejectedValueOnce(new Error('Connection failed'))

    const { connectToMongo } = await import('./database.js')

    await expect(connectToMongo()).rejects.toThrow('Connection failed')
  })
})
