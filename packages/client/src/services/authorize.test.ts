import { Request, Response } from 'express'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Clients } from '../db/mongo.js'
import { insertChallenge } from '../db/mongo.js'
import logger from '../utils/logger.js'
import { handleAuthorize, validateAuthorizeParams } from './authorize.js'

// モック設定
vi.mock('../db/mongo.js', () => ({
  Clients: {
    findOne: vi.fn(),
  },
  setChallenge: vi.fn(),
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
        expect.stringContaining("/oauth/authorize validation error: Only 'code' response_type is supported"),
      )
    })

    it('response_typeが配列の場合はエラーを返す', async () => {
      mockReq.query = {
        response_type: ['code', 'token'],
        client_id: 'test-client',
        redirect_uri: 'http://localhost:3000/callback',
      }

      await handleAuthorize(mockReq as Request, mockRes as Response)

      expect(mockStatus).toHaveBeenCalledWith(400)
      expect(mockJson).toHaveBeenCalledWith({
        error: 'invalid_request',
        error_description: 'Parameters must be single values, not arrays',
      })
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('/oauth/authorize validation error: Parameters must be single values, not arrays'),
      )
    })

    it('client_idが配列の場合はエラーを返す', async () => {
      mockReq.query = {
        response_type: 'code',
        client_id: ['client1', 'client2'],
        redirect_uri: 'http://localhost:3000/callback',
      }

      await handleAuthorize(mockReq as Request, mockRes as Response)

      expect(mockStatus).toHaveBeenCalledWith(400)
      expect(mockJson).toHaveBeenCalledWith({
        error: 'invalid_request',
        error_description: 'Parameters must be single values, not arrays',
      })
    })

    it('redirect_uriが配列の場合はエラーを返す', async () => {
      mockReq.query = {
        response_type: 'code',
        client_id: 'test-client',
        redirect_uri: ['http://localhost:3000/callback', 'http://localhost:4000/callback'],
      }

      await handleAuthorize(mockReq as Request, mockRes as Response)

      expect(mockStatus).toHaveBeenCalledWith(400)
      expect(mockJson).toHaveBeenCalledWith({
        error: 'invalid_request',
        error_description: 'Parameters must be single values, not arrays',
      })
    })

    it('client_idが空文字列の場合はエラーを返す', async () => {
      mockReq.query = {
        response_type: 'code',
        client_id: '',
        redirect_uri: 'http://localhost:3000/callback',
      }

      await handleAuthorize(mockReq as Request, mockRes as Response)

      expect(mockStatus).toHaveBeenCalledWith(400)
      expect(mockJson).toHaveBeenCalledWith({
        error: 'invalid_request',
        error_description: 'client_id and redirect_uri cannot be empty',
      })
    })

    it('redirect_uriが空文字列の場合はエラーを返す', async () => {
      mockReq.query = {
        response_type: 'code',
        client_id: 'test-client',
        redirect_uri: '',
      }

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
        expect.stringContaining('/oauth/authorize client not found or has no trusted URI: client_id=test-client'),
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
        expect.stringContaining('/oauth/authorize client not found or has no trusted URI: client_id=test-client'),
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

    it('スタックトレースがないエラーの場合はメッセージのみログに出力される', async () => {
      const dbError = new Error('Database connection failed')
      // スタックトレースを削除
      delete dbError.stack
      vi.mocked(Clients.findOne).mockRejectedValue(dbError)

      await handleAuthorize(mockReq as Request, mockRes as Response)

      expect(mockStatus).toHaveBeenCalledWith(500)
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('error=Database connection failed'))
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
        'test-challenge-uuid',
        {
          challenge: 'test-challenge-uuid',
          client_id: 'test-client',
          redirect_uri: 'http://localhost:3000/callback',
        },
        300,
      )

      expect(mockJson).toHaveBeenCalledWith({
        client_id: 'test-client',
        redirect_uri: 'http://localhost:3000/callback',
        challenge: 'test-challenge-uuid',
      })
    })

    it('Redisエラーが発生した場合は500エラーを返す', async () => {
      const redisError = new Error('Redis connection failed')
      redisError.stack = 'Error: Redis connection failed\n    at redis client'
      vi.mocked(insertChallenge).mockRejectedValue(redisError)

      await handleAuthorize(mockReq as Request, mockRes as Response)

      expect(mockStatus).toHaveBeenCalledWith(500)
      expect(mockJson).toHaveBeenCalledWith({
        error: 'server_error',
        error_description: 'Database error',
      })
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('/oauth/authorize Database error while inserting challenge'),
      )
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error: Redis connection failed'))
    })

    it('Redisエラーでスタックトレースがない場合はメッセージのみログに出力される', async () => {
      const redisError = new Error('Redis connection failed')
      // スタックトレースを削除
      delete redisError.stack
      vi.mocked(insertChallenge).mockRejectedValue(redisError)

      await handleAuthorize(mockReq as Request, mockRes as Response)

      expect(mockStatus).toHaveBeenCalledWith(500)
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('error=Redis connection failed'))
    })

    it('チャレンジの有効期限が正しく設定される（定数使用）', async () => {
      const mockDate = new Date('2025-08-02T12:00:00Z')
      vi.useFakeTimers()
      vi.setSystemTime(mockDate)

      vi.mocked(insertChallenge).mockResolvedValue(undefined)

      await handleAuthorize(mockReq as Request, mockRes as Response)

      // 定数 CHALLENGE_EXPIRES_IN (300秒) が使用されていることを確認
      expect(insertChallenge).toHaveBeenCalledWith(
        'test-challenge-uuid',
        expect.objectContaining({
          challenge: 'test-challenge-uuid',
          client_id: 'test-client',
          redirect_uri: 'http://localhost:3000/callback',
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

    it('予期しないエラーでスタックトレースがない場合はメッセージのみログに出力される', async () => {
      const unexpectedError = new Error('Unexpected error')
      // スタックトレースを削除
      delete unexpectedError.stack

      // query プロパティでエラーを投げるようにする
      Object.defineProperty(mockReq, 'query', {
        get: () => {
          throw unexpectedError
        },
        configurable: true,
      })

      await handleAuthorize(mockReq as Request, mockRes as Response)

      expect(mockStatus).toHaveBeenCalledWith(500)
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('/oauth/authorize error: Unexpected error'))
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
      })
    })
  })

  describe('ログ出力', () => {
    it('エラー時に適切なログが出力される', async () => {
      mockReq.query = {
        response_type: 'invalid',
        client_id: 'test-client',
        redirect_uri: 'http://localhost:3000/callback',
      }

      await handleAuthorize(mockReq as Request, mockRes as Response)

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("/oauth/authorize validation error: Only 'code' response_type is supported"),
      )
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

    it('無効なURL形式は拒否', () => {
      const query = {
        response_type: 'code',
        client_id: 'test-client',
        redirect_uri: 'invalid-url',
      }

      const result = validateAuthorizeParams(query)

      expect(result).toEqual({
        valid: false,
        errorCode: 'invalid_request',
        message: 'redirect_uri must be a valid URL',
      })
    })

    it('必須パラメータが不足している場合はエラーを返す', () => {
      const query = {
        response_type: 'code',
        client_id: 'test-client',
        // redirect_uri が不足
      }

      const result = validateAuthorizeParams(query)

      expect(result).toEqual({
        valid: false,
        errorCode: 'invalid_request',
        message: 'Missing required parameters: response_type, client_id, redirect_uri',
      })
    })

    it('配列パラメータは拒否される', () => {
      const query = {
        response_type: ['code'],
        client_id: 'test-client',
        redirect_uri: 'https://example.com/callback',
      }

      const result = validateAuthorizeParams(query)

      expect(result).toEqual({
        valid: false,
        errorCode: 'invalid_request',
        message: 'Parameters must be single values, not arrays',
      })
    })

    it('unsupported response_type は拒否される', () => {
      const query = {
        response_type: 'token',
        client_id: 'test-client',
        redirect_uri: 'https://example.com/callback',
      }

      const result = validateAuthorizeParams(query)

      expect(result).toEqual({
        valid: false,
        errorCode: 'unsupported_response_type',
        message: "Only 'code' response_type is supported",
      })
    })

    it('空文字列パラメータは拒否される', () => {
      const query = {
        response_type: 'code',
        client_id: '',
        redirect_uri: 'https://example.com/callback',
      }

      const result = validateAuthorizeParams(query)

      expect(result).toEqual({
        valid: false,
        errorCode: 'invalid_request',
        message: 'client_id and redirect_uri cannot be empty',
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
