import { Request, Response } from 'express'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findRefreshToken, insertRefreshToken } from '../db/mongo.js'
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

  const mockRefreshTokenDoc = {
    refresh_token: 'valid-refresh-token',
    address: 'address',
    publicKey: 'publicKey',
    used: false,
    revoked: false,
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
    vi.mocked(findRefreshToken).mockResolvedValue(mockRefreshTokenDoc)
    vi.mocked(insertRefreshToken).mockResolvedValue(undefined)
    await handleLogout(mockReq as Request, mockRes as Response)
    expect(mockJson).toHaveBeenCalledWith({ status: 'ok', message: 'refresh token revoked' })
    expect(insertRefreshToken).toHaveBeenCalled()
  })

  it('refresh_token未指定は400エラー', async () => {
    mockReq.body = {}
    await handleLogout(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(400)
    expect(mockJson).toHaveBeenCalledWith({ error: 'Missing refresh_token' })
  })

  it('refresh_tokenが存在しない場合は400エラー', async () => {
    vi.mocked(findRefreshToken).mockResolvedValue(null)
    await handleLogout(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(400)
    expect(mockJson).toHaveBeenCalledWith({ error: 'Invalid refresh_token' })
  })

  it('used/revokedなrefresh_tokenは400エラー', async () => {
    vi.mocked(findRefreshToken).mockResolvedValue({ ...mockRefreshTokenDoc, used: true })
    await handleLogout(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(400)
    expect(mockJson).toHaveBeenCalledWith({ error: 'Refresh token already used or revoked' })

    vi.mocked(findRefreshToken).mockResolvedValue({ ...mockRefreshTokenDoc, revoked: true })
    await handleLogout(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(400)
    expect(mockJson).toHaveBeenCalledWith({ error: 'Refresh token already used or revoked' })
  })

  it('DB取得エラーは500エラー', async () => {
    vi.mocked(findRefreshToken).mockRejectedValue(new Error('DB error'))
    await handleLogout(mockReq as Request, mockRes as Response)
    expect(mockStatus).toHaveBeenCalledWith(500)
    expect(mockJson).toHaveBeenCalledWith({ error: 'Database connection error' })
    expect(logger.error).toHaveBeenCalledWith('Database query failed: DB error')
  })

  it('DB保存エラーでも正常レスポンス', async () => {
    vi.mocked(findRefreshToken).mockResolvedValue(mockRefreshTokenDoc)
    vi.mocked(insertRefreshToken).mockRejectedValue(new Error('Save error'))
    await handleLogout(mockReq as Request, mockRes as Response)
    expect(mockJson).toHaveBeenCalledWith({ status: 'ok', message: 'refresh token revoked' })
    expect(logger.error).toHaveBeenCalledWith('Failed to revoke token: Save error')
  })
})
