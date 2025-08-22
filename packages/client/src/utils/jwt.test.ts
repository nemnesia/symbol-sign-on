import jwt from 'jsonwebtoken'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as mongo from '../db/mongo.js'
import logger from '../utils/logger.js'
import { generateJWT, verifyAndRevokeJWT } from './jwt.js'

vi.mock('../db/mongo.js')
vi.mock('../utils/logger.js', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}))

describe('JWTユーティリティ', () => {
  const address = 'test-address'
  const publicKey = 'test-publicKey'
  const clientId = 'test-clientId'
  let token: string

  beforeEach(() => {
    vi.clearAllMocks()
    token = generateJWT(address, publicKey, clientId)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('generateJWTで正しいJWTが生成される', () => {
    const decoded = jwt.decode(token) as any
    expect(decoded.sub).toBe(address)
    expect(decoded.pub).toBe(publicKey)
    expect(decoded.client_id).toBe(clientId)
    expect(decoded.type).toBe('access_token')
    expect(decoded.jwtId).toBeDefined()
  })

  it('verifyAndRevokeJWTで有効なJWTは正しくデコードされる', async () => {
    const result = await verifyAndRevokeJWT(token)
    expect(result).not.toBeNull()
    expect(result?.sub).toBe(address)
    expect(result?.pub).toBe(publicKey)
    expect(result?.client_id).toBe(clientId)
  })

  it('verifyAndRevokeJWTで無効なJWTはnullを返しブラックリスト追加される', async () => {
    const invalidToken = 'invalid.jwt.token'
    const insertAccessTokenBlacklist = vi.spyOn(mongo, 'insertAccessTokenBlacklist')
    const result = await verifyAndRevokeJWT(invalidToken)
    expect(result).toBeNull()
    expect(insertAccessTokenBlacklist).toHaveBeenCalledWith(
      expect.objectContaining({
        access_token: invalidToken,
        client_id: 'unknown',
        revoked_at: expect.any(Date),
      }),
    )
    expect(logger.error).toHaveBeenCalledWith('JWT verification error: Token invalid or expired')
    expect(logger.info).toHaveBeenCalledWith(`JWT ${invalidToken} added to blacklist`)
  })
})
