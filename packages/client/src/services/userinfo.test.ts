import { Request, Response } from 'express'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyAndRevokeJWT } from '../utils/jwt.js'
import logger from '../utils/logger.js'
import { handleUserinfo } from './userinfo.js'

vi.mock('../utils/jwt.js')
vi.mock('../utils/logger.js', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}))

describe('handleUserinfo', () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let mockJson: ReturnType<typeof vi.fn>
  let mockStatus: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockJson = vi.fn()
    mockStatus = vi.fn(() => ({ json: mockJson }))
    mockReq = { headers: {} }
    mockRes = { json: mockJson, status: mockStatus }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('有効なJWTでユーザー情報を返す', async () => {
    mockReq.headers = { authorization: 'Bearer valid-token' }
    vi.mocked(verifyAndRevokeJWT as any).mockResolvedValue({ sub: 'address', pub: 'publicKey' })
    await handleUserinfo(mockReq as Request, mockRes as Response)
    expect(mockJson).toHaveBeenCalledWith({ address: 'address', publicKey: 'publicKey', network: 'testnet' })
  })

  it('Authorizationヘッダー未指定は401エラー', async () => {
    mockReq.headers = {}
    await handleUserinfo(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(401)
    expect(mockJson).toHaveBeenCalledWith({ error: 'Missing or invalid Authorization header' })
  })

  it('AuthorizationヘッダーがBearerでない場合は401エラー', async () => {
    mockReq.headers = { authorization: 'Basic abc' }
    await handleUserinfo(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(401)
    expect(mockJson).toHaveBeenCalledWith({ error: 'Missing or invalid Authorization header' })
  })

  it('JWTが失効・不正なら401エラー', async () => {
    mockReq.headers = { authorization: 'Bearer invalid-token' }
    vi.mocked(verifyAndRevokeJWT).mockResolvedValue(null)
    await handleUserinfo(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(401)
    expect(mockJson).toHaveBeenCalledWith({
      error: 'invalid_token',
      error_description: 'The access token is invalid or has expired',
    })
  })

  it('JWT検証中に例外発生なら500エラー', async () => {
    mockReq.headers = { authorization: 'Bearer valid-token' }
    vi.mocked(verifyAndRevokeJWT).mockRejectedValue(new Error('JWT error'))
    await handleUserinfo(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(500)
    expect(mockJson).toHaveBeenCalledWith({ error: 'Internal server error' })
    expect(logger.error).toHaveBeenCalledWith('/oauth/userinfo error: JWT error')
  })
})
