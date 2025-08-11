import { beforeEach, describe, expect, it, vi } from 'vitest'

// モック用
const mockConnect = vi.fn()
const mockCollection = vi.fn(() => ({
  createIndex: vi.fn().mockResolvedValue('index'),
  find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
}))
const mockDb = vi.fn(() => ({
  collection: mockCollection,
}))
const mockClose = vi.fn()

// モジュールをモック
vi.mock('mongodb', () => ({
  MongoClient: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    db: mockDb,
    close: mockClose,
  })),
  Db: vi.fn(),
  Collection: vi.fn(),
}))

describe('mongo.tsのテスト', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.MONGODB_URI
    vi.resetModules()
  })

  it('MONGODB_URIが設定されていない場合、エラーをスローする', async () => {
    process.env.MONGODB_URI = ''
    const { connectToMongo } = await import('./mongo.js')
    await expect(connectToMongo()).rejects.toThrow('MONGODB_URI is not set in .env')
  })

  it('接続してコレクションとインデックスを初期化する', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'
    const mongo = await import('./mongo.js')
    await mongo.connectToMongo()
    const { Clients } = await import('./mongo.js')
    expect(mockConnect).toHaveBeenCalled()
    expect(mockDb().collection).toHaveBeenCalledWith('clients')
    expect(Clients.createIndex).toHaveBeenCalledWith({ client_id: 1 }, { unique: true })
  })

  it('データベースインスタンスを取得する', async () => {
    const { getDb } = await import('./mongo.js')
    expect(getDb()).toBeNull()
  })

  it('接続を閉じてclientとdbをリセットする', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'
    const { connectToMongo, closeConnection, getDb } = await import('./mongo.js')
    await connectToMongo()
    await closeConnection()
    expect(mockClose).toHaveBeenCalled()
    expect(getDb()).toBeNull()
  })

  it('インデックス作成に失敗した場合、警告を出力する', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'
    const errorMsg = 'index error!'

    // モックを設定
    mockCollection.mockImplementationOnce(() => ({
      createIndex: vi.fn().mockRejectedValue(new Error(errorMsg)),
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
    }))

    // warnスパイを設定（モジュール読み込み前に）
    const logger = await import('../utils/logger.js')
    const warnSpy = vi.spyOn(logger.default, 'warn')

    // モジュールを読み込んで実行
    const { connectToMongo } = await import('./mongo.js')
    await connectToMongo()

    // 警告が出力されたことを確認
    expect(warnSpy).toHaveBeenCalledWith('Failed to create index for clients:', errorMsg)
    warnSpy.mockRestore()
  })

  it('Challengesコレクションのインデックス作成をテストする', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'

    const mockChallengesCollection = {
      createIndex: vi.fn().mockResolvedValue('index'),
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
    }

    // 最初の呼び出しはClientsコレクション、2回目はChallengesコレクション用
    mockCollection
      .mockImplementationOnce(() => ({
        createIndex: vi.fn().mockResolvedValue('index'),
        find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }))
      .mockImplementationOnce(() => mockChallengesCollection)

    const { connectToMongo } = await import('./mongo.js')
    await connectToMongo()

    expect(mockDb().collection).toHaveBeenCalledWith('challenges')
    expect(mockChallengesCollection.createIndex).toHaveBeenCalledWith(
      { challenge: 1 },
      { unique: true },
    )
    expect(mockChallengesCollection.createIndex).toHaveBeenCalledWith(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 },
    )
  })

  it('AuthCodesコレクションのインデックス作成をテストする', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'

    const mockAuthCodesCollection = {
      createIndex: vi.fn().mockResolvedValue('index'),
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
    }

    // 各コレクション用のモック
    mockCollection
      .mockImplementationOnce(() => ({
        createIndex: vi.fn().mockResolvedValue('index'),
        find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }))
      .mockImplementationOnce(() => ({
        createIndex: vi.fn().mockResolvedValue('index'),
        find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }))
      .mockImplementationOnce(() => mockAuthCodesCollection)

    const { connectToMongo } = await import('./mongo.js')
    await connectToMongo()

    expect(mockDb().collection).toHaveBeenCalledWith('authcodes')
    expect(mockAuthCodesCollection.createIndex).toHaveBeenCalledWith(
      { auth_code: 1 },
      { unique: true },
    )
    expect(mockAuthCodesCollection.createIndex).toHaveBeenCalledWith(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 },
    )
  })

  it('データ操作関数をテストする - insertChallenge', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'

    const mockChallengesCollection = {
      createIndex: vi.fn().mockResolvedValue('index'),
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      insertOne: vi.fn().mockResolvedValue({ acknowledged: true, insertedId: 'id' }),
    }

    // connectToMongoは先に呼び出されたとみなす
    mockCollection.mockImplementation(() => mockChallengesCollection)

    const { connectToMongo, insertChallenge } = await import('./mongo.js')
    await connectToMongo()

    const now = new Date()
    vi.setSystemTime(now)

    const challengeKey = 'test-challenge'
    const challengeDoc = {
      challenge: challengeKey, // challengeプロパティを追加
      client_id: 'client123',
      redirect_uri: 'https://example.com/callback',
    }

    await insertChallenge(challengeKey, challengeDoc)

    // 実際の関数呼び出しパラメータを検証（expiresAtは含めない）
    const insertOneCall = mockChallengesCollection.insertOne.mock.calls[0][0]
    expect(insertOneCall.challenge).toBe(challengeKey)
    expect(insertOneCall.client_id).toBe('client123')
    expect(insertOneCall.redirect_uri).toBe('https://example.com/callback')
    expect(insertOneCall.createdAt).toEqual(now)
    expect(insertOneCall.expiresAt instanceof Date).toBe(true)

    vi.useRealTimers()
  })

  it('データ操作関数をテストする - findChallenge', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'

    const mockChallengeDoc = {
      challenge: 'test-challenge',
      client_id: 'client123',
      code_verifier: 'verifier123',
      redirect_uri: 'https://example.com/callback',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 180000),
    }

    const mockChallengesCollection = {
      createIndex: vi.fn().mockResolvedValue('index'),
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      findOne: vi.fn().mockResolvedValue(mockChallengeDoc),
    }

    mockCollection.mockImplementation(() => mockChallengesCollection)

    const { connectToMongo, findChallenge } = await import('./mongo.js')
    await connectToMongo()

    const result = await findChallenge('test-challenge')

    expect(mockChallengesCollection.findOne).toHaveBeenCalledWith({ challenge: 'test-challenge' })
    expect(result).toEqual(mockChallengeDoc)
  })

  it('データ操作関数をテストする - deleteChallenge', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'

    const mockChallengesCollection = {
      createIndex: vi.fn().mockResolvedValue('index'),
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      deleteOne: vi.fn().mockResolvedValue({ acknowledged: true, deletedCount: 1 }),
    }

    mockCollection.mockImplementation(() => mockChallengesCollection)

    const { connectToMongo, deleteChallenge } = await import('./mongo.js')
    await connectToMongo()

    await deleteChallenge('test-challenge')

    expect(mockChallengesCollection.deleteOne).toHaveBeenCalledWith({ challenge: 'test-challenge' })
  })

  it('ensureMongoConnectedをテストする - 接続されていない場合', async () => {
    const { ensureMongoConnected } = await import('./mongo.js')

    expect(() => ensureMongoConnected()).toThrow('MongoDB not connected')
  })

  it('ensureMongoConnectedをテストする - 接続されている場合', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'
    const { connectToMongo, ensureMongoConnected } = await import('./mongo.js')
    await connectToMongo()

    expect(() => ensureMongoConnected()).not.toThrow()
  })

  it('データ操作関数をテストする - insertAuthCode', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'

    const mockAuthCodesCollection = {
      createIndex: vi.fn().mockResolvedValue('index'),
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      insertOne: vi.fn().mockResolvedValue({ acknowledged: true, insertedId: 'id' }),
    }

    mockCollection.mockImplementation(() => mockAuthCodesCollection)

    const { connectToMongo, insertAuthCode } = await import('./mongo.js')
    await connectToMongo()

    const now = new Date()
    vi.setSystemTime(now)

    const authCodeValue = 'test-auth-code'
    const authCodeDoc = {
      auth_code: authCodeValue,
      address: 'NAAAA...',
      publicKey: 'publicKey123',
      used: false,
    }

    await insertAuthCode(authCodeValue, authCodeDoc)

    // 実際の関数呼び出しパラメータを検証（expiresAtは含めない）
    const insertOneCall = mockAuthCodesCollection.insertOne.mock.calls[0][0]
    expect(insertOneCall.auth_code).toBe(authCodeValue)
    expect(insertOneCall.address).toBe('NAAAA...')
    expect(insertOneCall.publicKey).toBe('publicKey123')
    expect(insertOneCall.used).toBe(false)
    expect(insertOneCall.createdAt).toEqual(now)
    expect(insertOneCall.expiresAt instanceof Date).toBe(true)

    vi.useRealTimers()
  })

  it('データ操作関数をテストする - findAuthCode', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'

    const mockAuthCodeDoc = {
      auth_code: 'test-auth-code',
      address: 'NAAAA...',
      publicKey: 'publicKey123',
      used: false,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 300000),
    }

    const mockAuthCodesCollection = {
      createIndex: vi.fn().mockResolvedValue('index'),
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      findOne: vi.fn().mockResolvedValue(mockAuthCodeDoc),
    }

    mockCollection.mockImplementation(() => mockAuthCodesCollection)

    const { connectToMongo, findAuthCode } = await import('./mongo.js')
    await connectToMongo()

    const result = await findAuthCode('test-auth-code')

    expect(mockAuthCodesCollection.findOne).toHaveBeenCalledWith({ auth_code: 'test-auth-code' })
    expect(result).toEqual(mockAuthCodeDoc)
  })

  it('データ操作関数をテストする - updateAuthCode', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'

    const mockAuthCodesCollection = {
      createIndex: vi.fn().mockResolvedValue('index'),
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      updateOne: vi
        .fn()
        .mockResolvedValue({ acknowledged: true, matchedCount: 1, modifiedCount: 1 }),
    }

    mockCollection.mockImplementation(() => mockAuthCodesCollection)

    const { connectToMongo, updateAuthCode } = await import('./mongo.js')
    await connectToMongo()

    const updateFields = {
      used: true,
      used_at: new Date(),
    }

    await updateAuthCode('test-auth-code', updateFields)

    expect(mockAuthCodesCollection.updateOne).toHaveBeenCalledWith(
      { auth_code: 'test-auth-code' },
      { $set: updateFields },
    )
  })

  it('updateAuthCode - 認可コードが見つからない場合エラーをスローする', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'

    const mockAuthCodesCollection = {
      createIndex: vi.fn().mockResolvedValue('index'),
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      updateOne: vi
        .fn()
        .mockResolvedValue({ acknowledged: true, matchedCount: 0, modifiedCount: 0 }),
    }

    mockCollection.mockImplementation(() => mockAuthCodesCollection)

    const { connectToMongo, updateAuthCode } = await import('./mongo.js')
    await connectToMongo()

    const authCode = 'non-existent-auth-code'
    await expect(updateAuthCode(authCode, { used: true })).rejects.toThrow(
      `AuthCode not found: ${authCode}`,
    )
  })

  it('データ操作関数をテストする - insertRefreshToken', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'

    const mockRefreshTokensCollection = {
      createIndex: vi.fn().mockResolvedValue('index'),
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      insertOne: vi.fn().mockResolvedValue({ acknowledged: true, insertedId: 'id' }),
    }

    mockCollection.mockImplementation(() => mockRefreshTokensCollection)

    const { connectToMongo, insertRefreshToken } = await import('./mongo.js')
    await connectToMongo()

    const now = new Date()
    vi.setSystemTime(now)

    const refreshTokenValue = 'test-refresh-token'
    const refreshTokenDoc = {
      refresh_token: refreshTokenValue,
      address: 'NAAAA...',
      publicKey: 'publicKey123',
      used: false,
      revoked: false,
    }

    await insertRefreshToken(refreshTokenValue, refreshTokenDoc)

    expect(mockRefreshTokensCollection.insertOne).toHaveBeenCalledWith({
      ...refreshTokenDoc,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 2592000000), // デフォルト30日
    })

    vi.useRealTimers()
  })

  it('データ操作関数をテストする - findRefreshToken', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'

    const mockRefreshTokenDoc = {
      refresh_token: 'test-refresh-token',
      address: 'NAAAA...',
      publicKey: 'publicKey123',
      used: false,
      revoked: false,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 2592000000),
    }

    const mockRefreshTokensCollection = {
      createIndex: vi.fn().mockResolvedValue('index'),
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      findOne: vi.fn().mockResolvedValue(mockRefreshTokenDoc),
    }

    mockCollection.mockImplementation(() => mockRefreshTokensCollection)

    const { connectToMongo, findRefreshToken } = await import('./mongo.js')
    await connectToMongo()

    const result = await findRefreshToken('test-refresh-token')

    expect(mockRefreshTokensCollection.findOne).toHaveBeenCalledWith({
      refresh_token: 'test-refresh-token',
    })
    expect(result).toEqual(mockRefreshTokenDoc)
  })

  it('データ操作関数をテストする - deleteRefreshToken', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'

    const mockRefreshTokensCollection = {
      createIndex: vi.fn().mockResolvedValue('index'),
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      deleteOne: vi.fn().mockResolvedValue({ acknowledged: true, deletedCount: 1 }),
    }

    mockCollection.mockImplementation(() => mockRefreshTokensCollection)

    const { connectToMongo, deleteRefreshToken } = await import('./mongo.js')
    await connectToMongo()

    await deleteRefreshToken('test-refresh-token')

    expect(mockRefreshTokensCollection.deleteOne).toHaveBeenCalledWith({
      refresh_token: 'test-refresh-token',
    })
  })

  it('データ操作関数をテストする - insertAccessTokenBlacklist', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'

    const mockAccessTokenBlacklistCollection = {
      createIndex: vi.fn().mockResolvedValue('index'),
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      insertOne: vi.fn().mockResolvedValue({ acknowledged: true, insertedId: 'id' }),
    }

    mockCollection.mockImplementation(() => mockAccessTokenBlacklistCollection)

    const { connectToMongo, insertAccessTokenBlacklist } = await import('./mongo.js')
    await connectToMongo()

    const now = new Date()
    vi.setSystemTime(now)

    const jwtId = 'test-jwt-id'
    const blacklistDoc = {
      jwt_id: jwtId,
      revoked_at: now,
    }

    await insertAccessTokenBlacklist(jwtId, blacklistDoc)

    // 実際の関数呼び出しパラメータを検証（expiresAtは含めない）
    const insertOneCall = mockAccessTokenBlacklistCollection.insertOne.mock.calls[0][0]
    expect(insertOneCall.jwt_id).toBe(jwtId)
    expect(insertOneCall.revoked_at).toEqual(now)
    expect(insertOneCall.createdAt).toEqual(now)
    expect(insertOneCall.expiresAt instanceof Date).toBe(true)

    vi.useRealTimers()
  })

  it('データ操作関数をテストする - findAccessTokenBlacklist', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'

    const mockBlacklistDoc = {
      jwt_id: 'test-jwt-id',
      revoked_at: new Date(),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
    }

    const mockAccessTokenBlacklistCollection = {
      createIndex: vi.fn().mockResolvedValue('index'),
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      findOne: vi.fn().mockResolvedValue(mockBlacklistDoc),
    }

    mockCollection.mockImplementation(() => mockAccessTokenBlacklistCollection)

    const { connectToMongo, findAccessTokenBlacklist } = await import('./mongo.js')
    await connectToMongo()

    const result = await findAccessTokenBlacklist('test-jwt-id')

    expect(mockAccessTokenBlacklistCollection.findOne).toHaveBeenCalledWith({
      jwt_id: 'test-jwt-id',
    })
    expect(result).toEqual(mockBlacklistDoc)
  })

  it('データ操作関数をテストする - getAllowedOriginsFromMongo', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'

    const mockClients = [
      {
        client_id: 'client1',
        trusted_redirect_uri: 'https://example.com/callback',
        app_name: 'Test App 1',
        createdAt: new Date(),
      },
      {
        client_id: 'client2',
        trusted_redirect_uri: 'https://another-app.com/callback',
        app_name: 'Test App 2',
        createdAt: new Date(),
      },
    ]

    const mockClientCollection = {
      createIndex: vi.fn().mockResolvedValue('index'),
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(mockClients) }),
    }

    mockCollection.mockImplementation(() => mockClientCollection)

    const { connectToMongo, getAllowedOriginsFromMongo } = await import('./mongo.js')
    await connectToMongo()

    const result = await getAllowedOriginsFromMongo()

    expect(mockClientCollection.find).toHaveBeenCalledWith({})
    // この関数はこのテストが実際に実行されるまで正確な戻り値は検証できませんが、
    // findが呼び出されたことを検証できます
    expect(result).toHaveLength(2)
  })

  it('getAllowedOriginsFromMongo - Clientsが初期化されていない場合', async () => {
    process.env.MONGODB_URI = ''

    const { getAllowedOriginsFromMongo } = await import('./mongo.js')

    const result = await getAllowedOriginsFromMongo()
    expect(result).toEqual([])
  })
})
