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

  it('全てのインデックス作成に失敗した場合、警告を出力する', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'
    const errorMsg1 = 'index error 1!'
    const errorMsg2 = 'index error 2!'
    const errorMsg3 = 'index error 3!'
    const errorMsg4 = 'index error 4!'
    const errorMsg5 = 'index error 5!'

    // モックを設定
    mockCollection
      .mockImplementationOnce(() => ({
        createIndex: vi.fn().mockRejectedValue(new Error(errorMsg1)),
        find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }))
      .mockImplementationOnce(() => ({
        createIndex: vi.fn().mockRejectedValue(new Error(errorMsg2)),
        find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }))
      .mockImplementationOnce(() => ({
        createIndex: vi.fn().mockRejectedValue(new Error(errorMsg3)),
        find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }))
      .mockImplementationOnce(() => ({
        createIndex: vi.fn().mockRejectedValue(new Error(errorMsg4)),
        find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }))
      .mockImplementationOnce(() => ({
        createIndex: vi.fn().mockRejectedValue(new Error(errorMsg5)),
        find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }))

    // warnスパイを設定（モジュール読み込み前に）
    const logger = await import('../utils/logger.js')
    const warnSpy = vi.spyOn(logger.default, 'warn')

    // モジュールを読み込んで実行
    const { connectToMongo } = await import('./mongo.js')
    await connectToMongo()

    // 警告が出力されたことを確認
    expect(warnSpy).toHaveBeenCalledWith('Failed to create index for clients:', errorMsg1)
    expect(warnSpy).toHaveBeenCalledWith('Failed to create index for challenges:', errorMsg2)
    expect(warnSpy).toHaveBeenCalledWith('Failed to create index for authcodes:', errorMsg3)
    expect(warnSpy).toHaveBeenCalledWith('Failed to create index for sessions:', errorMsg4)
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to create index for access_token_blacklist:',
      errorMsg5,
    )

    // スパイをリセット
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
      { client_id: 1, challenge: 1 },
      { unique: true },
    )
    expect(mockChallengesCollection.createIndex).toHaveBeenCalledWith(
      { expires_at: 1 },
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
      { client_id: 1, auth_code: 1 },
      { unique: true },
    )
    expect(mockAuthCodesCollection.createIndex).toHaveBeenCalledWith(
      { expires_at: 1 },
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

    const challengeDoc = {
      client_id: 'client123',
      challenge: 'test-challenge',
    }

    await insertChallenge(challengeDoc)

    // 実際の関数呼び出しパラメータを検証（expires_at、created_at、updated_atは含めない）
    const insertOneCall = mockChallengesCollection.insertOne.mock.calls[0][0]
    expect(insertOneCall.challenge).toBe('test-challenge')
    expect(insertOneCall.client_id).toBe('client123')
    expect(insertOneCall.created_at).toEqual(now)
    expect(insertOneCall.updated_at).toEqual(now)
    expect(insertOneCall.expires_at instanceof Date).toBe(true)

    vi.useRealTimers()
  })

  it('データ操作関数をテストする - findChallenge', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'

    const mockChallengeDoc = {
      challenge: 'test-challenge',
      client_id: 'client123',
      code_verifier: 'verifier123',
      created_at: new Date(),
      updated_at: new Date(),
      expires_at: new Date(Date.now() + 180000),
    }

    const mockChallengesCollection = {
      createIndex: vi.fn().mockResolvedValue('index'),
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      findOne: vi.fn().mockResolvedValue(mockChallengeDoc),
    }

    mockCollection.mockImplementation(() => mockChallengesCollection)

    const { connectToMongo, findChallenge } = await import('./mongo.js')
    await connectToMongo()

    const result = await findChallenge('client123', 'test-challenge')

    expect(mockChallengesCollection.findOne).toHaveBeenCalledWith({ client_id: 'client123', challenge: 'test-challenge' })
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

    await deleteChallenge('client123', 'test-challenge')

    expect(mockChallengesCollection.deleteOne).toHaveBeenCalledWith({ client_id: 'client123', challenge: 'test-challenge' })
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

    const authCodeDoc = {
      client_id: 'client123',
      auth_code: 'test-auth-code',
      symbol_address: 'NAAAA...',
      symbol_public_key: 'publicKey123',
      used: false,
    }

    await insertAuthCode(authCodeDoc)

    // 実際の関数呼び出しパラメータを検証（expires_at、created_at、updated_atは含めない）
    const insertOneCall = mockAuthCodesCollection.insertOne.mock.calls[0][0]
    expect(insertOneCall.auth_code).toBe('test-auth-code')
    expect(insertOneCall.symbol_address).toBe('NAAAA...')
    expect(insertOneCall.symbol_public_key).toBe('publicKey123')
    expect(insertOneCall.used).toBe(false)
    expect(insertOneCall.created_at).toEqual(now)
    expect(insertOneCall.updated_at).toEqual(now)
    expect(insertOneCall.expires_at instanceof Date).toBe(true)

    vi.useRealTimers()
  })

  it('データ操作関数をテストする - findAuthCode', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'

    const mockAuthCodeDoc = {
      auth_code: 'test-auth-code',
      client_id: 'client123',
      symbol_address: 'NAAAA...',
      symbol_public_key: 'publicKey123',
      used: false,
      created_at: new Date(),
      updated_at: new Date(),
      expires_at: new Date(Date.now() + 300000),
    }

    const mockAuthCodesCollection = {
      createIndex: vi.fn().mockResolvedValue('index'),
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      findOne: vi.fn().mockResolvedValue(mockAuthCodeDoc),
    }

    mockCollection.mockImplementation(() => mockAuthCodesCollection)

    const { connectToMongo, findAuthCode } = await import('./mongo.js')
    await connectToMongo()

    const result = await findAuthCode('client123', 'test-auth-code')

    expect(mockAuthCodesCollection.findOne).toHaveBeenCalledWith({ client_id: 'client123', auth_code: 'test-auth-code' })
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

    await updateAuthCode('client123', 'test-auth-code', updateFields)

    expect(mockAuthCodesCollection.updateOne).toHaveBeenCalledWith(
      { client_id: 'client123', auth_code: 'test-auth-code' },
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

    const clientId = 'client123'
    const authCode = 'non-existent-auth-code'
    await expect(updateAuthCode(clientId, authCode, { used: true })).rejects.toThrow(
      `AuthCode not found: ${authCode}`,
    )
  })

  it('データ操作関数をテストする - insertSession (旧リフレッシュトークン)', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'

    const mockSessionsCollection = {
      createIndex: vi.fn().mockResolvedValue('index'),
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      insertOne: vi.fn().mockResolvedValue({ acknowledged: true, insertedId: 'id' }),
    }

    mockCollection.mockImplementation(() => mockSessionsCollection)

    const { connectToMongo, insertSession } = await import('./mongo.js')
    await connectToMongo()

    const now = new Date()
    vi.setSystemTime(now)

    const sessionDoc = {
      session_id: 'test-session-id',
      client_id: 'client123',
      refresh_token: 'test-refresh-token',
      access_token: 'test-access-token',
      symbol_address: 'NAAAA...',
      symbol_public_key: 'publicKey123',
      revoked: false,
    }

    await insertSession(sessionDoc)

    expect(mockSessionsCollection.insertOne).toHaveBeenCalledWith({
      ...sessionDoc,
      created_at: now,
      updated_at: now,
      expires_at: expect.any(Date),
    })

    vi.useRealTimers()
  })

  it('データ操作関数をテストする - findSessionByRefreshToken (旧findRefreshToken)', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'

    const mockSessionDoc = {
      session_id: 'test-session-id',
      client_id: 'client123',
      refresh_token: 'test-refresh-token',
      access_token: 'test-access-token',
      symbol_address: 'NAAAA...',
      symbol_public_key: 'publicKey123',
      revoked: false,
      created_at: new Date(),
      updated_at: new Date(),
      expires_at: new Date(Date.now() + 2592000000),
    }

    const mockSessionsCollection = {
      createIndex: vi.fn().mockResolvedValue('index'),
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      findOne: vi.fn().mockResolvedValue(mockSessionDoc),
    }

    mockCollection.mockImplementation(() => mockSessionsCollection)

    const { connectToMongo, findSessionByRefreshToken } = await import('./mongo.js')
    await connectToMongo()

    const result = await findSessionByRefreshToken('test-refresh-token')

    expect(mockSessionsCollection.findOne).toHaveBeenCalledWith({
      refresh_token: 'test-refresh-token',
    })
    expect(result).toEqual(mockSessionDoc)
  })

  it('データ操作関数をテストする - updateSession (旧deleteRefreshToken相当)', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'

    const mockSessionsCollection = {
      createIndex: vi.fn().mockResolvedValue('index'),
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      updateOne: vi.fn().mockResolvedValue({ acknowledged: true, matchedCount: 1, modifiedCount: 1 }),
    }

    mockCollection.mockImplementation(() => mockSessionsCollection)

    const { connectToMongo, updateSession } = await import('./mongo.js')
    await connectToMongo()

    await updateSession('test-session-id', { revoked: true, revoked_at: new Date() })

    expect(mockSessionsCollection.updateOne).toHaveBeenCalledWith(
      { session_id: 'test-session-id' },
      { $set: { revoked: true, revoked_at: expect.any(Date) } },
    )
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

    const blacklistDoc = {
      client_id: 'client123',
      access_token: 'test-access-token',
      revoked_at: now,
    }

    await insertAccessTokenBlacklist(blacklistDoc)

    // 実際の関数呼び出しパラメータを検証（expires_at、created_at、updated_atは含めない）
    const insertOneCall = mockAccessTokenBlacklistCollection.insertOne.mock.calls[0][0]
    expect(insertOneCall.client_id).toBe('client123')
    expect(insertOneCall.access_token).toBe('test-access-token')
    expect(insertOneCall.revoked_at).toEqual(now)
    expect(insertOneCall.created_at).toEqual(now)
    expect(insertOneCall.updated_at).toEqual(now)
    expect(insertOneCall.expires_at instanceof Date).toBe(true)

    vi.useRealTimers()
  })

  it('データ操作関数をテストする - findAccessTokenBlacklistByClientIdAndAccessToken', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'

    const mockBlacklistDoc = {
      client_id: 'client123',
      access_token: 'test-access-token',
      revoked_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
      expires_at: new Date(Date.now() + 3600000),
    }

    const mockAccessTokenBlacklistCollection = {
      createIndex: vi.fn().mockResolvedValue('index'),
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      findOne: vi.fn().mockResolvedValue(mockBlacklistDoc),
    }

    mockCollection.mockImplementation(() => mockAccessTokenBlacklistCollection)

    const { connectToMongo, findAccessTokenBlacklistByClientIdAndAccessToken } = await import('./mongo.js')
    await connectToMongo()

    const result = await findAccessTokenBlacklistByClientIdAndAccessToken('client123', 'test-access-token')

    expect(mockAccessTokenBlacklistCollection.findOne).toHaveBeenCalledWith({
      client_id: 'client123',
      access_token: 'test-access-token',
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

  it('データ操作関数をテストする（文字配列） - getAllowedOriginsFromMongo', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'

    const mockClients = [
      {
        client_id: 'client1',
        trusted_redirect_uri: ['https://example.com/callback', 'https://example.com/callback2'],
        app_name: 'Test App 1',
        createdAt: new Date(),
      },
      {
        client_id: 'client2',
        trusted_redirect_uri: 123,
        app_name: 'Test App 2',
        createdAt: new Date(),
      },
      {
        client_id: 'client3',
        trusted_redirect_uri: 'http;abc.com/callback',
        app_name: 'Test App 3',
        createdAt: new Date(),
      },
      {
        client_id: 'client4',
        trusted_redirect_uri: ['https://example2.com/callback', 'https://example.com3/callback2'],
        app_name: 'Test App 4',
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
    expect(result).toHaveLength(3)
  })

  it('getAllowedOriginsFromMongo - Clientsが初期化されていない場合', async () => {
    process.env.MONGODB_URI = ''

    const { getAllowedOriginsFromMongo } = await import('./mongo.js')

    const result = await getAllowedOriginsFromMongo()
    expect(result).toEqual([])
  })
})
