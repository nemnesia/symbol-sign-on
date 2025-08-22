import { Request, Response } from 'express'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Clients, insertChallenge } from '../db/mongo.js'
import logger from '../utils/logger.js'
import { handleAuthorize, validateAuthorizeParams } from './authorize.js'

// モック設定
vi.mock('../db/mongo.js', () => ({
  Clients: {
    findOne: vi.fn(),
  },
  setChallenge: vi.fn(),
  insertChallenge: vi.fn(),
}))
vi.mock('../utils/logger.js', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}))
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-challenge-uuid'),
}))

describe('handleAuthorize', () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let mockJson: ReturnType<typeof vi.fn>
  let mockStatus: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockJson = vi.fn()
    mockStatus = vi.fn(() => ({ json: mockJson }))

    mockReq = {
      query: {},
    }

    mockRes = {
      json: mockJson,
      status: mockStatus,
    }

    // モックをリセット
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('パラメータ検証', () => {
    it('必須パラメータが不足している場合はエラーを返す', async () => {
      mockReq.query = {
        response_type: 'code',
        client_id: 'test-client',
        // redirect_uri が不足
      }

      await handleAuthorize(mockReq as Request, mockRes as Response)

      expect(mockStatus).toHaveBeenCalledWith(400)
      expect(mockJson).toHaveBeenCalledWith({
        error: 'invalid_request',
        error_description: 'Missing required parameters: response_type, client_id, redirect_uri',
      })
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          '/oauth/authorize validation error: Missing required parameters: response_type, client_id, redirect_uri',
        ),
      )
    })

    it('response_typeがcodeでない場合はエラーを返す', async () => {
      mockReq.query = {
        response_type: 'token',
        client_id: 'test-client',
        redirect_uri: 'http://localhost:3000/callback',
      }

      await handleAuthorize(mockReq as Request, mockRes as Response)

      expect(mockStatus).toHaveBeenCalledWith(400)
      expect(mockJson).toHaveBeenCalledWith({
        error: 'unsupported_response_type',
        error_description: "Only 'code' response_type is supported",
      })
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          "/oauth/authorize validation error: Only 'code' response_type is supported",
        ),
      )
    })

    it.each([
      {
        name: 'response_typeが配列の場合',
        query: {
          response_type: ['code', 'token'],
          client_id: 'test-client',
          redirect_uri: 'http://localhost:3000/callback',
        },
      },
      {
        name: 'client_idが配列の場合',
        query: {
          response_type: 'code',
          client_id: ['client1', 'client2'],
          redirect_uri: 'http://localhost:3000/callback',
        },
      },
      {
        name: 'redirect_uriが配列の場合',
        query: {
          response_type: 'code',
          client_id: 'test-client',
          redirect_uri: ['http://localhost:3000/callback', 'http://localhost:4000/callback'],
        },
      },
    ])('$name はエラーを返す', async ({ query }) => {
      mockReq.query = query

      await handleAuthorize(mockReq as Request, mockRes as Response)

      expect(mockStatus).toHaveBeenCalledWith(400)
      expect(mockJson).toHaveBeenCalledWith({
        error: 'invalid_request',
        error_description: 'Parameters must be single values, not arrays',
      })
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          '/oauth/authorize validation error: Parameters must be single values, not arrays',
        ),
      )
    })

    it.each([
      {
        name: 'client_idが空文字列の場合',
        query: {
          response_type: 'code',
          client_id: '',
          redirect_uri: 'http://localhost:3000/callback',
        },
      },
      {
        name: 'redirect_uriが空文字列の場合',
        query: {
          response_type: 'code',
          client_id: 'test-client',
          redirect_uri: '',
        },
      },
    ])('$name はエラーを返す', async ({ query }) => {
      mockReq.query = query

      await handleAuthorize(mockReq as Request, mockRes as Response)

      expect(mockStatus).toHaveBeenCalledWith(400)
      expect(mockJson).toHaveBeenCalledWith({
        error: 'invalid_request',
        error_description: 'client_id and redirect_uri cannot be empty',
      })
    })

    it('redirect_uriが無効なURL形式の場合はエラーを返す', async () => {
      mockReq.query = {
        response_type: 'code',
        client_id: 'test-client',
        redirect_uri: 'invalid-url',
      }

      await handleAuthorize(mockReq as Request, mockRes as Response)

      expect(mockStatus).toHaveBeenCalledWith(400)
      expect(mockJson).toHaveBeenCalledWith({
        error: 'invalid_request',
        error_description: 'redirect_uri must be a valid URL',
      })
    })
  })

  describe('クライアント検証', () => {
    beforeEach(() => {
      mockReq.query = {
        response_type: 'code',
        client_id: 'test-client',
        redirect_uri: 'http://localhost:3000/callback',
      }
    })

    it('クライアントが存在しない場合はエラーを返す', async () => {
      vi.mocked(Clients.findOne).mockResolvedValue(null)

      await handleAuthorize(mockReq as Request, mockRes as Response)

      expect(mockStatus).toHaveBeenCalledWith(400)
      expect(mockJson).toHaveBeenCalledWith({
        error: 'unauthorized_client',
        error_description: 'Client ID is not registered or has no trusted URI',
      })
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          '/oauth/authorize client not found or has no trusted URI: client_id=test-client',
        ),
      )
    })

    it('クライアントのtrusted_redirect_urisが未設定の場合はエラーを返す', async () => {
      vi.mocked(Clients.findOne).mockResolvedValue({
        client_id: 'test-client',
        trusted_redirect_uri: undefined,
      } as any)

      await handleAuthorize(mockReq as Request, mockRes as Response)

      expect(mockStatus).toHaveBeenCalledWith(400)
      expect(mockJson).toHaveBeenCalledWith({
        error: 'unauthorized_client',
        error_description: 'Client ID is not registered or has no trusted URI',
      })
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          '/oauth/authorize client not found or has no trusted URI: client_id=test-client',
        ),
      )
    })

    it('redirect_uriが登録されていない場合はエラーを返す', async () => {
      vi.mocked(Clients.findOne).mockResolvedValue({
        client_id: 'test-client',
        trusted_redirect_uri: ['http://localhost:4000/callback'],
      } as any)

      await handleAuthorize(mockReq as Request, mockRes as Response)

      expect(mockStatus).toHaveBeenCalledWith(400)
      expect(mockJson).toHaveBeenCalledWith({
        error: 'invalid_request',
        error_description: 'redirect_uri does not match any trusted URI',
      })
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          '/oauth/authorize redirect_uri does not match any trusted URI: http://localhost:3000/callback',
        ),
      )
    })

    it('データベースエラーが発生した場合は500エラーを返す', async () => {
      const dbError = new Error('Database connection failed')
      dbError.stack = 'Error: Database connection failed\n    at test line'
      vi.mocked(Clients.findOne).mockRejectedValue(dbError)

      await handleAuthorize(mockReq as Request, mockRes as Response)

      expect(mockStatus).toHaveBeenCalledWith(500)
      expect(mockJson).toHaveBeenCalledWith({
        error: 'server_error',
        error_description: 'Failed to fetch client data',
      })
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          '/oauth/authorize database error while fetching client: client_id=test-client, error=Error: Database connection failed',
        ),
      )
    })
  })

  describe('チャレンジコード生成と保存', () => {
    beforeEach(() => {
      mockReq.query = {
        response_type: 'code',
        client_id: 'test-client',
        redirect_uri: 'http://localhost:3000/callback',
      }

      vi.mocked(Clients.findOne).mockResolvedValue({
        client_id: 'test-client',
        trusted_redirect_uri: ['http://localhost:3000/callback'],
      } as any)
    })

    it('正常にチャレンジコードを生成して保存する', async () => {
      vi.mocked(insertChallenge).mockResolvedValue(undefined)

      await handleAuthorize(mockReq as Request, mockRes as Response)

      expect(insertChallenge).toHaveBeenCalledWith(
        {
          challenge: 'test-challenge-uuid',
          client_id: 'test-client',
        },
        300,
      )

      expect(mockJson).toHaveBeenCalledWith({
        client_id: 'test-client',
        redirect_uri: 'http://localhost:3000/callback',
        challenge: 'test-challenge-uuid',
        app_name: 'Unknown App',
      })
    })

    it('データベースエラーが発生した場合は500エラーを返す', async () => {
      const dbError = new Error('Database connection failed')
      dbError.stack = 'Error: Database connection failed\n    at mongo client'
      vi.mocked(insertChallenge).mockRejectedValue(dbError)

      await handleAuthorize(mockReq as Request, mockRes as Response)

      expect(mockStatus).toHaveBeenCalledWith(500)
      expect(mockJson).toHaveBeenCalledWith({
        error: 'server_error',
        error_description: 'Database error',
      })
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('/oauth/authorize Database error while inserting challenge'),
      )
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error: Database connection failed'),
      )
    })

    it('チャレンジの有効期限が正しく設定される（定数使用）', async () => {
      const mockDate = new Date('2025-08-02T12:00:00Z')
      vi.useFakeTimers()
      vi.setSystemTime(mockDate)

      vi.mocked(insertChallenge).mockResolvedValue(undefined)

      await handleAuthorize(mockReq as Request, mockRes as Response)

      // 定数 CHALLENGE_EXPIRES_IN (300秒) が使用されていることを確認
      expect(insertChallenge).toHaveBeenCalledWith(
        expect.objectContaining({
          challenge: 'test-challenge-uuid',
          client_id: 'test-client',
        }),
        300, // CHALLENGE_EXPIRES_IN の値
      )

      vi.useRealTimers()
    })
  })

  describe('予期しないエラー処理', () => {
    it('予期しないエラーが発生した場合は500エラーを返す', async () => {
      const unexpectedError = new Error('Unexpected error')
      unexpectedError.stack = 'Error: Unexpected error\n    at unexpected location'

      // query プロパティでエラーを投げるようにする
      Object.defineProperty(mockReq, 'query', {
        get: () => {
          throw unexpectedError
        },
        configurable: true,
      })

      await handleAuthorize(mockReq as Request, mockRes as Response)

      expect(mockStatus).toHaveBeenCalledWith(500)
      expect(mockJson).toHaveBeenCalledWith({
        error: 'server_error',
        error_description: 'Internal server error',
      })
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('/oauth/authorize error: Error: Unexpected error'),
      )
    })
  })

  describe('成功ケース', () => {
    it('すべての検証が通った場合は正常にレスポンスを返す', async () => {
      mockReq.query = {
        response_type: 'code',
        client_id: 'valid-client',
        redirect_uri: 'https://example.com/callback',
      }

      vi.mocked(Clients.findOne).mockResolvedValue({
        client_id: 'valid-client',
        trusted_redirect_uri: ['https://example.com/callback'],
      } as any)

      vi.mocked(insertChallenge).mockResolvedValue(undefined)

      await handleAuthorize(mockReq as Request, mockRes as Response)

      expect(mockRes.json).toHaveBeenCalledWith({
        client_id: 'valid-client',
        redirect_uri: 'https://example.com/callback',
        challenge: 'test-challenge-uuid',
        app_name: 'Unknown App',
      })
      expect(mockRes.status).not.toHaveBeenCalled()
    })
  })

  describe('エッジケース', () => {
    it('数値型のパラメータが正しく文字列に変換される', async () => {
      mockReq.query = {
        response_type: 'code',
        client_id: '123' as any, // 数値として受け取ったが文字列として扱われる
        redirect_uri: 'http://localhost:3000/callback',
      }

      vi.mocked(Clients.findOne).mockResolvedValue({
        client_id: '123',
        trusted_redirect_uri: ['http://localhost:3000/callback'],
      } as any)

      vi.mocked(insertChallenge).mockResolvedValue(undefined)

      await handleAuthorize(mockReq as Request, mockRes as Response)

      expect(Clients.findOne).toHaveBeenCalledWith({
        client_id: '123', // 文字列に変換されている
      })
      expect(mockRes.json).toHaveBeenCalledWith({
        client_id: '123',
        redirect_uri: 'http://localhost:3000/callback',
        challenge: 'test-challenge-uuid',
        app_name: 'Unknown App',
      })
    })

    it('URLのプロトコルが異なる場合もURLとして認識される', async () => {
      mockReq.query = {
        response_type: 'code',
        client_id: 'test-client',
        redirect_uri: 'custom://app/callback',
      }

      vi.mocked(Clients.findOne).mockResolvedValue({
        client_id: 'test-client',
        trusted_redirect_uri: ['custom://app/callback'],
      } as any)

      vi.mocked(insertChallenge).mockResolvedValue(undefined)

      await handleAuthorize(mockReq as Request, mockRes as Response)

      expect(mockRes.json).toHaveBeenCalledWith({
        client_id: 'test-client',
        redirect_uri: 'custom://app/callback',
        challenge: 'test-challenge-uuid',
        app_name: 'Unknown App',
      })
    })
  })
})

describe('validateAuthorizeParams', () => {
  describe('成功ケース', () => {
    it('有効なパラメータの場合は成功を返す', () => {
      const query = {
        response_type: 'code',
        client_id: 'test-client',
        redirect_uri: 'https://example.com/callback',
      }

      const result = validateAuthorizeParams(query)

      expect(result).toEqual({
        valid: true,
        client_id: 'test-client',
        redirect_uri: 'https://example.com/callback',
      })
    })

    it('HTTPSのURLは本番環境で有効', () => {
      process.env.NODE_ENV = 'production'

      const query = {
        response_type: 'code',
        client_id: 'test-client',
        redirect_uri: 'https://example.com/callback',
      }

      const result = validateAuthorizeParams(query)

      expect(result.valid).toBe(true)

      delete process.env.NODE_ENV
    })

    it('localhostのHTTPは開発環境で有効', () => {
      const query = {
        response_type: 'code',
        client_id: 'test-client',
        redirect_uri: 'http://localhost:3000/callback',
      }

      const result = validateAuthorizeParams(query)

      expect(result.valid).toBe(true)
    })

    it('カスタムスキームは有効', () => {
      const query = {
        response_type: 'code',
        client_id: 'test-client',
        redirect_uri: 'myapp://callback',
      }

      const result = validateAuthorizeParams(query)

      expect(result.valid).toBe(true)
    })
  })

  describe('エラーケース', () => {
    it('本番環境でHTTPは無効', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const query = {
        response_type: 'code',
        client_id: 'test-client',
        redirect_uri: 'http://example.com/callback',
      }

      const result = validateAuthorizeParams(query)

      expect(result).toEqual({
        valid: false,
        errorCode: 'invalid_request',
        message: 'redirect_uri must be a valid URL',
      })

      process.env.NODE_ENV = originalEnv
    })

    it('localhost以外のHTTPは無効', () => {
      const query = {
        response_type: 'code',
        client_id: 'test-client',
        redirect_uri: 'http://example.com/callback',
      }

      const result = validateAuthorizeParams(query)

      expect(result).toEqual({
        valid: false,
        errorCode: 'invalid_request',
        message: 'redirect_uri must be a valid URL',
      })
    })

    it('127.0.0.1のHTTPは開発環境で許可される', () => {
      const query = {
        response_type: 'code',
        client_id: 'test-client',
        redirect_uri: 'http://127.0.0.1:3000/callback',
      }

      const result = validateAuthorizeParams(query)

      expect(result.valid).toBe(true)
    })
  })
})
