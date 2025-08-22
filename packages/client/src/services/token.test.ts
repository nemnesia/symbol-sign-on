import { Request, Response } from 'express'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  findAuthCode,
  findSessionByRefreshToken,
  insertSession,
  updateAuthCode,
  updateSession,
} from '../db/mongo.js'
import { generateJWT } from '../utils/jwt.js'
import logger from '../utils/logger.js'
import { handleToken } from './token.js'

vi.mock('../db/mongo.js')
vi.mock('../utils/jwt.js')
vi.mock('../utils/logger.js', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}))

const mockAuthCodeDoc = {
  client_id: 'test-client',
  auth_code: 'valid-code',
  symbol_address: 'address',
  symbol_public_key: 'publicKey',
  pkce_challenge: 'challenge',
  pkce_challenge_method: 'S256',
  used: false,
  created_at: new Date(),
  updated_at: new Date(),
  expires_at: new Date(Date.now() + 3600000),
}
const mockSessionDoc = {
  session_id: 'session-id',
  client_id: 'test-client',
  refresh_token: 'valid-refresh-token',
  access_token: 'access-token',
  symbol_address: 'address',
  symbol_public_key: 'publicKey',
  revoked: false,
  created_at: new Date(),
  updated_at: new Date(),
  expires_at: new Date(Date.now() + 3600000),
}

const mockJWT = 'mock-jwt-token'

beforeEach(() => {
  vi.mocked(generateJWT).mockReturnValue(mockJWT)
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('handleToken', () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let mockJson: ReturnType<typeof vi.fn>
  let mockStatus: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(generateJWT).mockReturnValue(mockJWT)
    mockJson = vi.fn()
    mockStatus = vi.fn(() => ({ json: mockJson }))
    mockReq = { body: {}, cookies: {} }
    mockRes = { json: mockJson, status: mockStatus }
  })

  it('grant_type未指定は400エラー', async () => {
    await handleToken(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(400)
    expect(mockJson).toHaveBeenCalledWith({ error: 'Missing grant_type' })
  })

  it('不正なgrant_typeは400エラー', async () => {
    mockReq.body = { grant_type: 'invalid' }
    await handleToken(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(400)
    expect(mockJson).toHaveBeenCalledWith({ error: 'Unsupported grant_type' })
  })

  it('authorization_code: code/client_id不足は400エラー', async () => {
    mockReq.body = { grant_type: 'authorization_code', code: 'code' }
    await handleToken(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(400)
    expect(mockJson).toHaveBeenCalledWith({ error: 'Missing code or client_id' })
  })

  it('refresh_token: refresh_token/client_id不足は401エラー', async () => {
    mockReq.body = { grant_type: 'refresh_token', client_id: 'client-id' }
    mockReq.cookies = {}
    await handleToken(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(401)
    expect(mockJson).toHaveBeenCalledWith({
      error: 'Unauthorized',
      error_description: 'Refresh token is missing',
    })
  })

  it('authorization_code: 有効な認可コードでトークン発行', async () => {
    const mockAuthCodeDocNoPKCE = {
      ...mockAuthCodeDoc,
      pkce_challenge: undefined,
      pkce_challenge_method: undefined,
    }

    mockReq.body = { grant_type: 'authorization_code', code: 'valid-code', client_id: 'test-client' }
    vi.mocked(findAuthCode).mockResolvedValue(mockAuthCodeDocNoPKCE)
    vi.mocked(updateAuthCode).mockResolvedValue(undefined)
    vi.mocked(insertSession).mockResolvedValue(undefined)
    mockRes.cookie = vi.fn().mockReturnValue(mockRes)

    await handleToken(mockReq as Request, mockRes as Response)

    expect(mockJson).toHaveBeenCalledWith({
      access_token: mockJWT,
      refresh_token: expect.any(String),
      expires_in: expect.any(Number),
    })
    expect(mockRes.cookie).toHaveBeenCalledWith(
      'refresh_token',
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        path: '/',
      })
    )
  })

  it('authorization_code: 認可コードが不正/使用済みは400エラー', async () => {
    mockReq.body = {
      grant_type: 'authorization_code',
      code: 'invalid',
      client_id: 'test-client',
      code_verifier: 'verifier',
    }
    vi.mocked(findAuthCode).mockResolvedValue(null)
    await handleToken(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(400)
    expect(mockJson).toHaveBeenCalledWith({ error: 'Invalid or used code' })

    vi.mocked(findAuthCode).mockResolvedValue({
      ...mockAuthCodeDoc,
      used: true,
    })
    await handleToken(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(400)
    expect(mockJson).toHaveBeenCalledWith({ error: 'Invalid or used code' })
  })

  it('authorization_code: PKCE code_verifier未指定は400エラー', async () => {
    mockReq.body = { grant_type: 'authorization_code', code: 'valid-code', client_id: 'test-client' }
    vi.mocked(findAuthCode).mockResolvedValue(mockAuthCodeDoc)
    await handleToken(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(400)
    expect(mockJson).toHaveBeenCalledWith({
      error: 'invalid_grant',
      error_description: 'PKCE code_verifier is required but was not supplied',
    })
  })

  it('authorization_code: PKCE method不正は400エラー', async () => {
    mockReq.body = {
      grant_type: 'authorization_code',
      code: 'valid-code',
      client_id: 'test-client',
      code_verifier: 'verifier',
    }
    vi.mocked(findAuthCode).mockResolvedValue({
      ...mockAuthCodeDoc,
      pkce_challenge_method: 'plain',
    })
    await handleToken(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(400)
    expect(mockJson).toHaveBeenCalledWith({
      error: 'invalid_grant',
      error_description: 'Unsupported PKCE method: plain',
    })
  })

  it('authorization_code: PKCE検証失敗は400エラー', async () => {
    mockReq.body = {
      grant_type: 'authorization_code',
      code: 'valid-code',
      client_id: 'test-client',
      code_verifier: 'wrong',
    }
    vi.mocked(findAuthCode).mockResolvedValue(mockAuthCodeDoc)
    vi.mocked(insertSession).mockResolvedValue(undefined)
    // PKCE S256 challenge計算を失敗させる
    const { calculatePKCEChallenge } = await import('./token.js')
    vi.spyOn({ calculatePKCEChallenge }, 'calculatePKCEChallenge').mockReturnValue('not-match')
    await handleToken(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(400)
    expect(mockJson).toHaveBeenCalledWith({
      error: 'invalid_grant',
      error_description: 'code_verifier does not match code_challenge',
    })
  })

  it('authorization_code: DB取得エラーは500エラー', async () => {
    mockReq.body = {
      grant_type: 'authorization_code',
      code: 'valid-code',
      client_id: 'client',
      code_verifier: 'verifier',
    }
    vi.mocked(findAuthCode).mockRejectedValue(new Error('DB error'))
    await handleToken(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(500)
    expect(mockJson).toHaveBeenCalledWith({ error: 'Database connection error' })
    expect(logger.error).toHaveBeenCalledWith('Database query failed: DB error')
  })

  it('refresh_token: 有効なリフレッシュトークンでトークン再発行', async () => {
    mockReq.body = { grant_type: 'refresh_token', client_id: 'test-client' }
    mockReq.cookies = { refresh_token: 'valid-refresh-token' }
    vi.mocked(findSessionByRefreshToken).mockResolvedValue(mockSessionDoc)
    vi.mocked(updateSession).mockResolvedValue(undefined)
    vi.mocked(insertSession).mockResolvedValue(undefined)
    mockRes.cookie = vi.fn().mockReturnValue(mockRes)

    await handleToken(mockReq as Request, mockRes as Response)
    expect(mockJson).toHaveBeenCalledWith({
      access_token: mockJWT,
      refresh_token: expect.any(String),
      expires_in: expect.any(Number),
    })
    expect(mockRes.cookie).toHaveBeenCalledWith(
      'refresh_token',
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        path: '/',
      })
    )
  })

  it('refresh_token: 不正/使用済み/期限切れは400エラー', async () => {
    mockReq.body = { grant_type: 'refresh_token', client_id: 'test-client' }
    mockReq.cookies = { refresh_token: 'invalid' }
    vi.mocked(findSessionByRefreshToken).mockResolvedValue(null)
    await handleToken(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(400)
    expect(mockJson).toHaveBeenCalledWith({ error: 'Invalid or revoked session' })

    vi.mocked(findSessionByRefreshToken).mockResolvedValue({
      ...mockSessionDoc,
      revoked: true,
    })
    await handleToken(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(400)
    expect(mockJson).toHaveBeenCalledWith({ error: 'Invalid or revoked session' })
  })

  it('refresh_token: DB取得エラーは500エラー', async () => {
    mockReq.body = { grant_type: 'refresh_token', client_id: 'test-client' }
    mockReq.cookies = { refresh_token: 'valid-refresh-token' }
    vi.mocked(findSessionByRefreshToken).mockRejectedValue(new Error('DB error'))
    await handleToken(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(500)
    expect(mockJson).toHaveBeenCalledWith({ error: 'Database connection error' })
    expect(logger.error).toHaveBeenCalledWith('Database query failed: DB error')
  })
})
