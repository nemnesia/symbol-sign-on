import { beforeEach, describe, expect, it, vi } from 'vitest'

// モック用
const mockConnect = vi.fn()
const mockCollection = vi.fn(() => ({
  createIndex: vi.fn().mockResolvedValue('index'),
}))
const mockDb = vi.fn(() => ({
  collection: mockCollection,
}))
const mockClose = vi.fn()

vi.mock('mongodb', () => ({
  MongoClient: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    db: mockDb,
    close: mockClose,
  })),
  Db: vi.fn(),
  Collection: vi.fn(),
}))

describe('mongo.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.MONGODB_URI
  })

  it('should throw error if MONGODB_URI is not set', async () => {
    const { connectToMongo } = await import('./mongo.js')
    await expect(connectToMongo()).rejects.toThrow('MONGODB_URI is not set in .env')
  })

  it('should connect and initialize collection/index', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'
    const mongo = await import('./mongo.js')
    await mongo.connectToMongo()
    // connectToMongo実行後にClientsを取得
    const { Clients } = await import('./mongo.js')
    expect(mockConnect).toHaveBeenCalled()
    expect(mockDb().collection).toHaveBeenCalledWith('clients')
    expect(Clients.createIndex).toHaveBeenCalledWith({ client_id: 1 }, { unique: true })
  })

  it('should close connection and reset client/db', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'
    const { connectToMongo, closeConnection, getDb } = await import('./mongo.js')
    await connectToMongo()
    await closeConnection()
    expect(mockClose).toHaveBeenCalled()
    expect(getDb()).toBeNull()
  })

  it('should warn if index creation fails', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'
    // createIndexを失敗させる
    const errorMsg = 'index error!'
    mockCollection.mockImplementationOnce(() => ({
      createIndex: vi.fn().mockRejectedValue(new Error(errorMsg)),
    }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mongo = await import('./mongo.js')
    await mongo.connectToMongo()
    expect(warnSpy).toHaveBeenCalledWith('Failed to create index for clients:', errorMsg)
    warnSpy.mockRestore()
  })
})
