import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Request, Response } from 'express'
import { handleToken } from './token.js'
import { getAuthCode, getRefreshToken, setAuthCode, setRefreshToken, deleteRefreshToken } from '../db/redis.js'
import { generateJWT } from '../utils/jwt.js'
import logger from '../utils/logger.js'

vi.mock('../db/redis.js')
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
  auth_code: 'valid-code',
  address: 'address',
  publicKey: 'publicKey',
  pkce_challenge: 'challenge',
  pkce_challenge_method: 'S256',
  used: false,
}
const mockRefreshTokenDoc = {
  refresh_token: 'valid-refresh-token',
  address: 'address',
  publicKey: 'publicKey',
  used: false,
  revoked: false,
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
  mockReq = { body: {} }
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

  it('refresh_token: refresh_token/client_id不足は400エラー', async () => {
    mockReq.body = { grant_type: 'refresh_token', refresh_token: 'token' }
    await handleToken(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(400)
    expect(mockJson).toHaveBeenCalledWith({ error: 'Missing refresh_token or client_id' })
  })

  it('authorization_code: 有効な認可コードでトークン発行', async () => {
    // PKCEなしのテストケースに変更
    const mockAuthCodeDocNoPKCE = { ...mockAuthCodeDoc, pkce_challenge: undefined, pkce_challenge_method: undefined }
    mockReq.body = { grant_type: 'authorization_code', code: 'valid-code', client_id: 'client' }
    vi.mocked(getAuthCode).mockResolvedValue(mockAuthCodeDocNoPKCE)
    vi.mocked(setAuthCode).mockResolvedValue(undefined)
    vi.mocked(setRefreshToken).mockResolvedValue(undefined)
    await handleToken(mockReq as Request, mockRes as Response)
    expect(mockJson).toHaveBeenCalledWith({
      access_token: mockJWT,
      refresh_token: expect.any(String),
      expires_in: expect.any(Number),
    })
  })

  it('authorization_code: 認可コードが不正/使用済みは400エラー', async () => {
    mockReq.body = { grant_type: 'authorization_code', code: 'invalid', client_id: 'client', code_verifier: 'verifier' }
    vi.mocked(getAuthCode).mockResolvedValue(null)
    await handleToken(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(400)
    expect(mockJson).toHaveBeenCalledWith({ error: 'Invalid or used code' })

    vi.mocked(getAuthCode).mockResolvedValue({ ...mockAuthCodeDoc, used: true })
    await handleToken(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(400)
    expect(mockJson).toHaveBeenCalledWith({ error: 'Invalid or used code' })
  })

  it('authorization_code: PKCE code_verifier未指定は400エラー', async () => {
    mockReq.body = { grant_type: 'authorization_code', code: 'valid-code', client_id: 'client' }
    vi.mocked(getAuthCode).mockResolvedValue(mockAuthCodeDoc)
    await handleToken(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(400)
    expect(mockJson).toHaveBeenCalledWith({
      error: 'invalid_grant',
      error_description: 'PKCE code_verifier is required but was not supplied',
    })
  })

  it('authorization_code: PKCE method不正は400エラー', async () => {
    mockReq.body = { grant_type: 'authorization_code', code: 'valid-code', client_id: 'client', code_verifier: 'verifier' }
    vi.mocked(getAuthCode).mockResolvedValue({ ...mockAuthCodeDoc, pkce_challenge_method: 'plain' })
    await handleToken(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(400)
    expect(mockJson).toHaveBeenCalledWith({
      error: 'invalid_grant',
      error_description: 'Unsupported PKCE method: plain',
    })
  })

  it('authorization_code: PKCE検証失敗は400エラー', async () => {
    mockReq.body = { grant_type: 'authorization_code', code: 'valid-code', client_id: 'client', code_verifier: 'wrong' }
    vi.mocked(getAuthCode).mockResolvedValue(mockAuthCodeDoc)
    vi.mocked(setAuthCode).mockResolvedValue(undefined)
    vi.mocked(setRefreshToken).mockResolvedValue(undefined)
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
    mockReq.body = { grant_type: 'authorization_code', code: 'valid-code', client_id: 'client', code_verifier: 'verifier' }
    vi.mocked(getAuthCode).mockRejectedValue(new Error('DB error'))
    await handleToken(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(500)
    expect(mockJson).toHaveBeenCalledWith({ error: 'Database connection error' })
    expect(logger.error).toHaveBeenCalledWith('Database query failed: DB error')
  })

  it('refresh_token: 有効なリフレッシュトークンでトークン再発行', async () => {
    mockReq.body = { grant_type: 'refresh_token', refresh_token: 'valid-refresh-token', client_id: 'client' }
    vi.mocked(getRefreshToken).mockResolvedValue(mockRefreshTokenDoc)
    vi.mocked(deleteRefreshToken).mockResolvedValue(undefined)
    vi.mocked(setRefreshToken).mockResolvedValue(undefined)
    await handleToken(mockReq as Request, mockRes as Response)
    expect(mockJson).toHaveBeenCalledWith({
      access_token: mockJWT,
      refresh_token: expect.any(String),
      expires_in: expect.any(Number),
    })
  })

  it('refresh_token: 不正/使用済み/期限切れは400エラー', async () => {
    mockReq.body = { grant_type: 'refresh_token', refresh_token: 'invalid', client_id: 'client' }
    vi.mocked(getRefreshToken).mockResolvedValue(null)
    await handleToken(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(400)
    expect(mockJson).toHaveBeenCalledWith({ error: 'Invalid or used/expired refresh_token' })

    vi.mocked(getRefreshToken).mockResolvedValue({ ...mockRefreshTokenDoc, used: true })
    await handleToken(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(400)
    expect(mockJson).toHaveBeenCalledWith({ error: 'Invalid or used/expired refresh_token' })

    vi.mocked(getRefreshToken).mockResolvedValue({ ...mockRefreshTokenDoc, revoked: true })
    await handleToken(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(400)
    expect(mockJson).toHaveBeenCalledWith({ error: 'Invalid or used/expired refresh_token' })
  })

  it('refresh_token: DB取得エラーは500エラー', async () => {
    mockReq.body = { grant_type: 'refresh_token', refresh_token: 'valid-refresh-token', client_id: 'client' }
    vi.mocked(getRefreshToken).mockRejectedValue(new Error('DB error'))
    await handleToken(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(500)
    expect(mockJson).toHaveBeenCalledWith({ error: 'Database connection error' })
    expect(logger.error).toHaveBeenCalledWith('Database query failed: DB error')
  })
})
