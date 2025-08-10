import { Request, Response } from 'express'
import { utils } from 'symbol-sdk'
import { SymbolFacade, SymbolTransactionFactory } from 'symbol-sdk/symbol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteChallenge, getChallenge, setAuthCode } from '../db/mongo.js'
import logger from '../utils/logger.js'
import { handleVerifySignature } from './verify-signature.js'

// 型定義 - ChallengeDocumentがない場合の暫定的な定義
interface ChallengeDocument {
  challenge: string
  client_id: string
  redirect_uri: string
}

// モック設定
vi.mock('../db/mongo.js')
vi.mock('../utils/logger.js', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}))
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-auth-code-uuid'),
}))

// Symbol SDK のモック - ファクトリー関数内で定義
vi.mock('symbol-sdk', () => ({
  utils: {
    hexToUint8: vi.fn(),
    uint8ToHex: vi.fn(),
  },
}))

vi.mock('symbol-sdk/symbol', () => ({
  models: {
    NetworkType: {
      valueToKey: vi.fn(() => 'TESTNET'),
    },
    TransactionType: {
      TRANSFER: 16724,
    },
  },
  SymbolFacade: vi.fn(),
  SymbolTransactionFactory: {
    deserialize: vi.fn(),
  },
}))

describe('handleVerifySignature', () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let mockJson: ReturnType<typeof vi.fn>
  let mockStatus: ReturnType<typeof vi.fn>
  let mockSend: ReturnType<typeof vi.fn>

  const mockChallengeDoc: ChallengeDocument = {
    challenge: 'test-challenge',
    client_id: 'test-client',
    redirect_uri: 'https://example.com/callback',
  }

  const mockTransaction = {
    network: { value: 152 },
    signature: 'mock-signature',
    signerPublicKey: 'mock-public-key',
    type: { value: 16724 }, // TRANSFER
    message: new Uint8Array([1, 2, 3]),
  }

  const mockFacade = {
    verifyTransaction: vi.fn(() => true),
    createPublicAccount: vi.fn(() => ({
      address: { toString: () => 'mock-address' },
    })),
  }

  beforeEach(() => {
    mockJson = vi.fn()
    mockStatus = vi.fn(() => ({ json: mockJson }))
    mockSend = vi.fn()

    mockReq = {
      body: {
        payload: 'valid-hex-payload',
      },
    }

    mockRes = {
      json: mockJson,
      status: mockStatus,
      send: mockSend,
    }

    // モックをリセット
    vi.clearAllMocks()

    // Symbol SDK モックの設定
    vi.mocked(SymbolTransactionFactory.deserialize).mockReturnValue(mockTransaction as any)
    vi.mocked(SymbolFacade).mockImplementation(() => mockFacade as any)

    // 正しいJSON文字列のHEXエンコード
    const jsonString = JSON.stringify({
      code_challenge: 'test-challenge',
      state: 'test-state',
      pkce_challenge: 'test-pkce',
      pkce_challenge_method: 'S256',
    })
    const jsonBytes = new TextEncoder().encode(jsonString)
    const hexString =
      '00' +
      Array.from(jsonBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')

    // hexToUint8は実際のJSONバイト配列を返すようにモック
    vi.mocked(utils.hexToUint8).mockImplementation((hex: string) => {
      if (hex === 'valid-hex-payload') {
        return new Uint8Array([1, 2, 3]) // トランザクション用のダミーデータ
      }
      // hex文字列からバイト配列に変換（00プレフィックスを除去）
      const cleanHex = hex.startsWith('00') ? hex.substring(2) : hex
      const bytes = []
      for (let i = 0; i < cleanHex.length; i += 2) {
        bytes.push(parseInt(cleanHex.substr(i, 2), 16))
      }
      return new Uint8Array(bytes)
    })

    vi.mocked(utils.uint8ToHex).mockReturnValue(hexString)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('正常系', () => {
    it('有効なペイロードで認可コードを正常に発行する', async () => {
      // redirect_uriがないChallengeDocを使用してJSONレスポンスをテスト
      const challengeDocWithoutRedirect = {
        challenge: 'test-challenge',
        client_id: 'test-client',
        redirect_uri: '', // 空のredirect_uri
      }

      // モックの設定
      vi.mocked(getChallenge).mockResolvedValue(challengeDocWithoutRedirect)
      vi.mocked(setAuthCode).mockResolvedValue(undefined)
      vi.mocked(deleteChallenge).mockResolvedValue(undefined)

      await handleVerifySignature(mockReq as Request, mockRes as Response)

      expect(mockJson).toHaveBeenCalledWith({
        code: 'test-auth-code-uuid',
        expires_in: 120,
      })
      expect(setAuthCode).toHaveBeenCalledWith(
        'oauth:auth_code:test-auth-code-uuid',
        {
          auth_code: 'test-auth-code-uuid',
          address: 'mock-address',
          publicKey: 'mock-public-key',
          pkce_challenge: 'test-pkce',
          pkce_challenge_method: 'S256',
          used: false,
        },
        120,
      )
      expect(deleteChallenge).toHaveBeenCalledWith('test-challenge')
    })

    it('redirect_uriがある場合はHTMLリダイレクトを返す', async () => {
      // モックの設定
      vi.mocked(getChallenge).mockResolvedValue(mockChallengeDoc)
      vi.mocked(setAuthCode).mockResolvedValue(undefined)
      vi.mocked(deleteChallenge).mockResolvedValue(undefined)

      await handleVerifySignature(mockReq as Request, mockRes as Response)

      expect(mockSend).toHaveBeenCalled()
      const htmlResponse = mockSend.mock.calls[0][0]
      expect(htmlResponse).toContain('https://example.com/callback?code=test-auth-code-uuid&amp;state=test-state')
      expect(htmlResponse).toContain('window.location.replace')
    })

    it('stateパラメータを正しくリダイレクトURLに含める', async () => {
      // モックの設定
      vi.mocked(getChallenge).mockResolvedValue(mockChallengeDoc)
      vi.mocked(setAuthCode).mockResolvedValue(undefined)
      vi.mocked(deleteChallenge).mockResolvedValue(undefined)

      await handleVerifySignature(mockReq as Request, mockRes as Response)

      expect(mockSend).toHaveBeenCalled()
      const htmlResponse = mockSend.mock.calls[0][0]
      expect(htmlResponse).toContain('state=test-state')
      expect(logger.debug).toHaveBeenCalledWith('Including state parameter in redirect (value omitted)')
    })
  })

  describe('バリデーション', () => {
    it('payloadが存在しない場合は400エラーを返す', async () => {
      mockReq.body = {}

      await handleVerifySignature(mockReq as Request, mockRes as Response)

      expect(mockStatus).toHaveBeenCalledWith(400)
      expect(mockJson).toHaveBeenCalledWith({ error: 'Missing payload' })
    })

    it('署名検証に失敗した場合は400エラーを返す', async () => {
      mockFacade.verifyTransaction.mockReturnValue(false)

      await handleVerifySignature(mockReq as Request, mockRes as Response)

      expect(mockStatus).toHaveBeenCalledWith(400)
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Failed to verify signature: Invalid transaction signature',
      })
      expect(logger.error).toHaveBeenCalledWith('Failed to verify signature: Invalid transaction signature')
    })

    it('トランザクションタイプがTRANSFER以外の場合は400エラーを返す', async () => {
      const mockNonTransferTx = {
        ...mockTransaction,
        type: { value: 16705 }, // 異なるトランザクションタイプ
      }
      vi.mocked(SymbolTransactionFactory.deserialize).mockReturnValue(mockNonTransferTx as any)

      await handleVerifySignature(mockReq as Request, mockRes as Response)

      expect(mockStatus).toHaveBeenCalledWith(400)
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Failed to verify signature: Unsupported transaction type',
      })
    })

    it('メッセージが空の場合は400エラーを返す', async () => {
      const mockEmptyMessageTx = {
        ...mockTransaction,
        message: new Uint8Array([]),
      }
      vi.mocked(SymbolTransactionFactory.deserialize).mockReturnValue(mockEmptyMessageTx as any)

      await handleVerifySignature(mockReq as Request, mockRes as Response)

      expect(mockStatus).toHaveBeenCalledWith(400)
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Failed to verify signature: Message is empty.',
      })
    })

    it('メッセージのJSONが無効な場合は400エラーを返す', async () => {
      const invalidHex =
        '00' +
        Array.from(new TextEncoder().encode('invalid-json'))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
      vi.mocked(utils.uint8ToHex).mockReturnValue(invalidHex)

      await handleVerifySignature(mockReq as Request, mockRes as Response)

      expect(mockStatus).toHaveBeenCalledWith(400)
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Failed to verify signature: Invalid JSON format in transaction message'),
        }),
      )
    })

    it('code_challengeが存在しない場合は400エラーを返す', async () => {
      const jsonString = JSON.stringify({
        state: 'test-state',
        // code_challengeを省略
      })
      const hexString =
        '00' +
        Array.from(new TextEncoder().encode(jsonString))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
      vi.mocked(utils.uint8ToHex).mockReturnValue(hexString)

      await handleVerifySignature(mockReq as Request, mockRes as Response)

      expect(mockStatus).toHaveBeenCalledWith(400)
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Failed to verify signature: Missing code_challenge in transaction message',
      })
    })

    it('チャレンジが存在しない場合は400エラーを返す', async () => {
      vi.mocked(getChallenge).mockResolvedValue(null)

      await handleVerifySignature(mockReq as Request, mockRes as Response)

      expect(mockStatus).toHaveBeenCalledWith(400)
      expect(mockJson).toHaveBeenCalledWith({ error: 'Invalid or expired challenge' })
    })
  })

  describe('エラーハンドリング', () => {
    it('Redis取得エラーの場合は500エラーを返す', async () => {
      vi.mocked(getChallenge).mockRejectedValue(new Error('Redis connection failed'))

      await handleVerifySignature(mockReq as Request, mockRes as Response)

      expect(mockStatus).toHaveBeenCalledWith(500)
      expect(mockJson).toHaveBeenCalledWith({ error: 'Redis connection error' })
      expect(logger.error).toHaveBeenCalledWith('Redis query failed: Redis connection failed')
    })

    it('認可コード保存エラーの場合は500エラーを返す', async () => {
      vi.mocked(getChallenge).mockResolvedValue(mockChallengeDoc)
      vi.mocked(setAuthCode).mockRejectedValue(new Error('Database save failed'))

      await handleVerifySignature(mockReq as Request, mockRes as Response)

      expect(mockStatus).toHaveBeenCalledWith(500)
      expect(mockJson).toHaveBeenCalledWith({ error: 'Database connection error' })
      expect(logger.error).toHaveBeenCalledWith('Failed to store auth code: Database save failed')
    })

    it('チャレンジ削除エラーは継続処理される', async () => {
      const challengeDocWithoutRedirect = {
        challenge: 'test-challenge',
        client_id: 'test-client',
        redirect_uri: '', // JSONレスポンス用
      }

      vi.mocked(getChallenge).mockResolvedValue(challengeDocWithoutRedirect)
      vi.mocked(setAuthCode).mockResolvedValue(undefined)
      vi.mocked(deleteChallenge).mockRejectedValue(new Error('Delete failed'))

      await handleVerifySignature(mockReq as Request, mockRes as Response)

      expect(logger.error).toHaveBeenCalledWith('Failed to delete challenge from Redis: Delete failed')
      // レスポンスは正常に返される
      expect(mockJson).toHaveBeenCalledWith({
        code: 'test-auth-code-uuid',
        expires_in: 120,
      })
    })

    it('無効なredirect_uriの場合はJSONレスポンスにフォールバックする', async () => {
      const invalidRedirectDoc = {
        ...mockChallengeDoc,
        redirect_uri: 'invalid-url',
      }
      vi.mocked(getChallenge).mockResolvedValue(invalidRedirectDoc)
      vi.mocked(setAuthCode).mockResolvedValue(undefined)
      vi.mocked(deleteChallenge).mockResolvedValue(undefined)

      await handleVerifySignature(mockReq as Request, mockRes as Response)

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid redirect_uri:'))
      expect(mockJson).toHaveBeenCalledWith({
        code: 'test-auth-code-uuid',
        expires_in: 120,
      })
    })

    it('予期しないエラーの場合は500エラーを返す', async () => {
      // beforeEachで設定されたモックをクリア
      vi.clearAllMocks()

      // payloadは有効だが、外側のtry-catchで例外を発生させる
      mockReq = {
        body: {
          payload: 'valid-hex-payload',
        },
      }

      // 全てのモックを正常に設定してから、最後のsetAuthCodeで例外を発生
      vi.mocked(SymbolTransactionFactory.deserialize).mockReturnValue(mockTransaction as any)
      vi.mocked(SymbolFacade).mockImplementation(() => mockFacade as any)
      const jsonString = JSON.stringify({
        code_challenge: 'test-challenge',
        state: 'test-state',
      })
      const hexString =
        '00' +
        Array.from(new TextEncoder().encode(jsonString))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
      vi.mocked(utils.uint8ToHex).mockReturnValue(hexString)

      vi.mocked(getChallenge).mockResolvedValue(mockChallengeDoc)
      vi.mocked(setAuthCode).mockRejectedValue(new Error('Unexpected error'))

      await handleVerifySignature(mockReq as Request, mockRes as Response)

      expect(mockStatus).toHaveBeenCalledWith(500)
      expect(mockJson).toHaveBeenCalledWith({ error: 'Database connection error' })
      expect(logger.error).toHaveBeenCalledWith('Failed to store auth code: Unexpected error')
    })
  })

  describe('XSS対策', () => {
    it('HTMLレスポンス内でURLが適切にエスケープされる', async () => {
      const xssChallengeDoc = {
        ...mockChallengeDoc,
        redirect_uri: 'https://example.com/callback?param=<script>alert("xss")</script>',
      }
      vi.mocked(getChallenge).mockResolvedValue(xssChallengeDoc)
      vi.mocked(setAuthCode).mockResolvedValue(undefined)

      await handleVerifySignature(mockReq as Request, mockRes as Response)

      expect(mockSend).toHaveBeenCalled()
      const htmlResponse = mockSend.mock.calls[0][0]
      // URLエンコードされた文字列が含まれることを確認（ブラウザのURL API）
      expect(htmlResponse).toContain('%3Cscript%3E')
      expect(htmlResponse).toContain('%22xss%22')
      // 生のスクリプトタグが含まれないことを確認
      expect(htmlResponse).not.toContain('<script>alert')
      expect(htmlResponse).not.toContain('"xss"')
    })
  })

  describe('オプショナルパラメータ処理', () => {
    it('stateパラメータが存在しない場合は含めない', async () => {
      const jsonString = JSON.stringify({
        code_challenge: 'test-challenge',
        // stateを省略
      })
      const hexString =
        '00' +
        Array.from(new TextEncoder().encode(jsonString))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
      vi.mocked(utils.uint8ToHex).mockReturnValue(hexString)
      vi.mocked(getChallenge).mockResolvedValue(mockChallengeDoc)
      vi.mocked(setAuthCode).mockResolvedValue(undefined)

      await handleVerifySignature(mockReq as Request, mockRes as Response)

      expect(mockSend).toHaveBeenCalled()
      const htmlResponse = mockSend.mock.calls[0][0]
      expect(htmlResponse).not.toContain('state=')
      expect(logger.debug).not.toHaveBeenCalledWith('Including state parameter in redirect (value omitted)')
    })

    it('pkce_challengeとpkce_challenge_methodが省略可能', async () => {
      const jsonString = JSON.stringify({
        code_challenge: 'test-challenge',
        state: 'test-state',
        // pkce関連を省略
      })
      const hexString =
        '00' +
        Array.from(new TextEncoder().encode(jsonString))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
      vi.mocked(utils.uint8ToHex).mockReturnValue(hexString)
      vi.mocked(getChallenge).mockResolvedValue(mockChallengeDoc)
      vi.mocked(setAuthCode).mockResolvedValue(undefined)

      await handleVerifySignature(mockReq as Request, mockRes as Response)

      expect(setAuthCode).toHaveBeenCalledWith(
        'oauth:auth_code:test-auth-code-uuid',
        expect.objectContaining({
          pkce_challenge: undefined,
          pkce_challenge_method: undefined,
        }),
        120,
      )
    })
  })
})
