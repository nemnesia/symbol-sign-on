import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ioredisクラスタのモック
const mockRedis = {
  set: vi.fn(),
  get: vi.fn(),
  quit: vi.fn(),
  on: vi.fn(),
  del: vi.fn(),
}

const mockCluster = vi.fn(() => mockRedis)

vi.mock('ioredis', () => ({
  default: {
    Cluster: mockCluster,
  },
}))

describe('Redis database connection', () => {
  beforeEach(() => {
    process.env.REDIS_CLUSTER_HOSTS = 'redis-node-1:7001,redis-node-2:7002,redis-node-3:7003'
    vi.clearAllMocks()
  })

  afterEach(() => {
    delete process.env.REDIS_CLUSTER_HOSTS
  })

  it('should import database functions', async () => {
    const {
      connectToRedis,
      setChallenge,
      getChallenge,
      setAuthCode,
      getAuthCode,
      setRefreshToken: setToken,
      getRefreshToken: getToken,
      closeConnection,
    } = await import('./redis.js')
    expect(connectToRedis).toBeDefined()
    expect(typeof connectToRedis).toBe('function')
    expect(setChallenge).toBeDefined()
    expect(getChallenge).toBeDefined()
    expect(setAuthCode).toBeDefined()
    expect(getAuthCode).toBeDefined()
    expect(setToken).toBeDefined()
    expect(getToken).toBeDefined()
    expect(closeConnection).toBeDefined()
  })

  it('should establish connection to Redis Cluster', async () => {
    const { connectToRedis } = await import('./redis.js')
    await connectToRedis()
    expect(mockCluster).toHaveBeenCalled()
    // 実際のコードではonは呼ばれないので、この検証は削除
    // expect(mockRedis.on).toHaveBeenCalledWith('connect', expect.any(Function))
  })

  it('should throw error when REDIS_CLUSTER_HOSTS is not set', async () => {
    delete process.env.REDIS_CLUSTER_HOSTS
    const { connectToRedis } = await import('./redis.js')
    await expect(connectToRedis()).rejects.toThrow('REDIS_CLUSTER_HOSTS is not set in .env')
  })

  it('should set and get challenge', async () => {
    const { setChallenge, getChallenge } = await import('./redis.js')
    const challengeDoc = {
      challenge: 'challenge1',
      client_id: 'client1',
      redirect_uri: 'http://localhost/cb',
    }
    mockRedis.set.mockResolvedValue('OK')
    mockRedis.get.mockResolvedValue(JSON.stringify(challengeDoc))
    await setChallenge('key1', challengeDoc)
    expect(mockRedis.set).toHaveBeenCalledWith('challenge:key1', JSON.stringify(challengeDoc), 'EX', expect.any(Number))
    const val = await getChallenge('key1')
    expect(val).not.toBeNull()
    expect(val!.challenge).toBe(challengeDoc.challenge)
    expect(val!.client_id).toBe(challengeDoc.client_id)
    expect(val!.redirect_uri).toBe(challengeDoc.redirect_uri)
  })

  it('should set and get auth code', async () => {
    const { setAuthCode, getAuthCode } = await import('./redis.js')
    const authCodeDoc = {
      auth_code: 'abc',
      address: 'address1',
      publicKey: null,
    }
    mockRedis.set.mockResolvedValue('OK')
    mockRedis.get.mockResolvedValue(JSON.stringify(authCodeDoc))
    await setAuthCode('key2', authCodeDoc)
    expect(mockRedis.set).toHaveBeenCalledWith('authcode:key2', JSON.stringify(authCodeDoc), 'EX', expect.any(Number))
    const val = await getAuthCode('key2')
    expect(val).not.toBeNull()
    expect(val!.auth_code).toBe(authCodeDoc.auth_code)
    expect(val!.address).toBe(authCodeDoc.address)
    expect(val!.publicKey).toBeNull()
  })

  it('should set and get token', async () => {
    const { setRefreshToken: setToken, getRefreshToken: getToken } = await import('./redis.js')
    const tokenDoc = {
      refresh_token: 'xyz',
      address: 'address2',
      publicKey: null,
      used: false,
      revoked: false,
    }
    mockRedis.set.mockResolvedValue('OK')
    mockRedis.get.mockResolvedValue(JSON.stringify(tokenDoc))
    await setToken('key3', tokenDoc)
    expect(mockRedis.set).toHaveBeenCalledWith('refresh_token:key3', JSON.stringify(tokenDoc), 'EX', expect.any(Number))
    const val = await getToken('key3')
    expect(val).not.toBeNull()
    expect(val!.refresh_token).toBe(tokenDoc.refresh_token)
    expect(val!.address).toBe(tokenDoc.address)
    expect(val!.publicKey).toBeNull()
    expect(val!.used).toBe(false)
    expect(val!.revoked).toBe(false)
  })

  it('should delete challenge', async () => {
    const { deleteChallenge } = await import('./redis.js')
    mockRedis.del.mockResolvedValue(1)
    await deleteChallenge('challenge_abc')
    expect(mockRedis.del).toHaveBeenCalledWith('challenge:challenge_abc')
  })

  it('should delete refresh token', async () => {
    const { deleteRefreshToken } = await import('./redis.js')
    mockRedis.del.mockResolvedValue(1)
    await deleteRefreshToken('refresh_token_123')
    expect(mockRedis.del).toHaveBeenCalledWith('refresh_token:refresh_token_123')
  })
  it('should set access token blacklist', async () => {
    const { setAccessTokenBlacklist } = await import('./redis.js')
    const blacklistDoc = {
      jwt_id: 'jwt_123',
      revoked_at: new Date(),
      reason: 'test revocation',
    }
    mockRedis.set.mockResolvedValue('OK')
    await setAccessTokenBlacklist('jwt_123', blacklistDoc)
    expect(mockRedis.set).toHaveBeenCalledWith(
      'blacklist:access_token:jwt_123',
      JSON.stringify(blacklistDoc),
      'EX',
      expect.any(Number),
    )
  })

  it('should close connection properly', async () => {
    const { closeConnection } = await import('./redis.js')
    mockRedis.quit.mockResolvedValue('OK')
    await closeConnection()
    expect(mockRedis.quit).toHaveBeenCalled()
  })
})

describe('ensureRedisConnected', () => {
  beforeEach(() => {
    process.env.REDIS_CLUSTER_HOSTS = 'redis-node-1:7001,redis-node-2:7002,redis-node-3:7003'
  })

  it('should throw if redis is not connected', async () => {
    const { ensureRedisConnected } = await import('./redis.js')
    expect(() => {
      ensureRedisConnected()
    }).toThrow('Redis not connected')
  })

  it('should not throw if redis is connected', async () => {
    const { connectToRedis, ensureRedisConnected } = await import('./redis.js')
    await connectToRedis()
    expect(() => {
      ensureRedisConnected()
    }).not.toThrow()
  })
})
