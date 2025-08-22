import { Request, Response } from 'express'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findSessionByRefreshToken, updateSession } from '../db/mongo.js'
import logger from '../utils/logger.js'
import { handleLogout } from './logout.js'

vi.mock('../db/mongo.js')
vi.mock('../utils/logger.js', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}))

describe('handleLogout', () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let mockJson: ReturnType<typeof vi.fn>
  let mockStatus: ReturnType<typeof vi.fn>

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

  beforeEach(() => {
    mockJson = vi.fn()
    mockStatus = vi.fn(() => ({ json: mockJson }))
    mockReq = { body: { refresh_token: 'valid-refresh-token' } }
    mockRes = { json: mockJson, status: mockStatus }
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('正常にrefresh_tokenを取り消しできる', async () => {
    vi.mocked(findSessionByRefreshToken).mockResolvedValue(mockSessionDoc)
    vi.mocked(updateSession).mockResolvedValue(undefined)
    await handleLogout(mockReq as Request, mockRes as Response)
    expect(mockJson).toHaveBeenCalledWith({ status: 'ok', message: 'session revoked' })
    expect(updateSession).toHaveBeenCalledWith('session-id', {
      revoked: true,
      revoked_at: expect.any(Date),
    })
  })

  it('refresh_token未指定は400エラー', async () => {
    mockReq.body = {}
    await handleLogout(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(400)
    expect(mockJson).toHaveBeenCalledWith({ error: 'Missing refresh_token' })
  })

  it('refresh_tokenが存在しない場合は400エラー', async () => {
    vi.mocked(findSessionByRefreshToken).mockResolvedValue(null)
    await handleLogout(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(400)
    expect(mockJson).toHaveBeenCalledWith({ error: 'Invalid refresh_token' })
  })

  it('revokedなセッションは400エラー', async () => {
    vi.mocked(findSessionByRefreshToken).mockResolvedValue({ ...mockSessionDoc, revoked: true })
    await handleLogout(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(400)
    expect(mockJson).toHaveBeenCalledWith({ error: 'Session already revoked' })
  })

  it('DB取得エラーは500エラー', async () => {
    vi.mocked(findSessionByRefreshToken).mockRejectedValue(new Error('DB error'))
    await handleLogout(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(500)
    expect(mockJson).toHaveBeenCalledWith({ error: 'Database connection error' })
    expect(logger.error).toHaveBeenCalledWith('Database query failed: DB error')
  })

  it('DB保存エラーでも正常レスポンス', async () => {
    vi.mocked(findSessionByRefreshToken).mockResolvedValue(mockSessionDoc)
    vi.mocked(updateSession).mockRejectedValue(new Error('Save error'))
    await handleLogout(mockReq as Request, mockRes as Response)
    expect(mockJson).toHaveBeenCalledWith({ status: 'ok', message: 'session revoked' })
    expect(logger.error).toHaveBeenCalledWith('Failed to revoke session: Save error')
  })
})
