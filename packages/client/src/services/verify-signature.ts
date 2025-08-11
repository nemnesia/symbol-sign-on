/**
 * 署名検証・認可コード発行エンドポイント
 * Symbolトランザクションの署名を検証し、認可コードを発行する。
 * - Symbolトランザクション署名検証
 * - チャレンジ有効性確認
 * - 認可コード発行・保存
 * - OAuth2準拠のリダイレクト処理
 */
import { Request, Response } from 'express'
import { utils } from 'symbol-sdk'
import { models, SymbolFacade, SymbolTransactionFactory } from 'symbol-sdk/symbol'
import { v4 as uuidv4 } from 'uuid'
import { deleteChallenge, findChallenge, insertAuthCode } from '../db/mongo.js'
import { AuthCodeDocument, ChallengeDocument } from '../types/mongo.types.js'
import logger from '../utils/logger.js'
import { parseTimeToSeconds } from '../utils/time.js'

/**
 * 認可コードの有効期限（秒）
 */
const AUTHCODE_EXPIRATION = parseTimeToSeconds(process.env.AUTHCODE_EXPIRATION || '2m')

/**
 * Symbolネットワークタイプ
 */
const SYMBOL_NETWORK_TYPE = process.env.SYMBOL_NETWORK_TYPE || 'testnet'

// 型定義
interface SignatureParams {
  publicKey: string
  address: string
  challenge: string
  state?: string
  pkce_challenge?: string
  pkce_challenge_method?: string
}

/**
 * /oauth/verify-signature の処理
 * 署名済みトランザクションの検証と認可コード発行
 * @param req Expressリクエスト
 * @param res Expressレスポンス
 */
export async function handleVerifySignature(req: Request, res: Response): Promise<void> {
  // プリフライトリクエスト（OPTIONS）の処理
  if (req.method === 'OPTIONS') {
    // チャレンジからredirect_uriを取得してCORS設定
    try {
      const { payload } = req.body
      if (payload) {
        const signatureParams = verifySignature(payload)
        const challengeDoc = await findChallenge(signatureParams.challenge)
        if (challengeDoc?.redirect_uri) {
          const redirectUrl = new URL(challengeDoc.redirect_uri)
          const allowedOrigin = `${redirectUrl.protocol}//${redirectUrl.host}`

          const requestOrigin = req.headers.origin
          if (requestOrigin === allowedOrigin) {
            res.setHeader('Access-Control-Allow-Origin', requestOrigin)
            res.setHeader('Access-Control-Allow-Credentials', 'true')
          }
        }
      }
    } catch {
      // エラーの場合はデフォルトのCORS設定
      logger.debug('CORS preflight: using default settings due to error')
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
    res.status(204).end()
    return
  }

  try {
    const { payload } = req.body

    // payloadチェック
    if (!payload) {
      res.status(400).json({ error: 'Missing payload' })
      return
    }

    // トランザクションを検証（メッセージからパラメータを抽出）
    let signatureParams: SignatureParams
    try {
      signatureParams = verifySignature(payload)
    } catch (error) {
      logger.error(`Failed to verify signature: ${(error as Error).message}`)
      res.status(400).json({ error: `Failed to verify signature: ${(error as Error).message}` })
      return
    }

    // チャレンジ有効性チェック
    let challengeDoc: ChallengeDocument | null
    try {
      challengeDoc = await findChallenge(signatureParams.challenge)
    } catch (dbError) {
      logger.error(`Database query failed: ${(dbError as Error).message}`)
      res.status(500).json({ error: 'Database connection error' })
      return
    }

    if (!challengeDoc) {
      res.status(400).json({ error: 'Invalid or expired challenge' })
      return
    }

    // リダイレクトURLからオリジンを取得してCORS設定
    if (challengeDoc.redirect_uri) {
      try {
        const redirectUrl = new URL(challengeDoc.redirect_uri)
        const allowedOrigin = `${redirectUrl.protocol}//${redirectUrl.host}`

        const requestOrigin = req.headers.origin
        if (requestOrigin === allowedOrigin) {
          res.setHeader('Access-Control-Allow-Origin', requestOrigin)
          res.setHeader('Access-Control-Allow-Credentials', 'true')
        }
      } catch (corsError) {
        logger.debug(`CORS setup failed: ${(corsError as Error).message}`)
      }
    }

    // 認可コード発行
    const authCode = uuidv4()
    try {
      // 型定義に合わせて作成
      const authCodeData: Omit<AuthCodeDocument, 'createdAt' | 'expiresAt'> = {
        auth_code: authCode,
        address: signatureParams.address,
        publicKey: signatureParams.publicKey,
        pkce_challenge: signatureParams.pkce_challenge,
        pkce_challenge_method: signatureParams.pkce_challenge_method,
        used: false,
      }
      await insertAuthCode(authCode, authCodeData, AUTHCODE_EXPIRATION)
    } catch (dbError) {
      logger.error(`Failed to store auth code: ${(dbError as Error).message}`)
      res.status(500).json({ error: 'Database connection error' })
      return
    }

    // チャレンジを削除
    try {
      await deleteChallenge(signatureParams.challenge)
    } catch (dbError) {
      logger.error(`Failed to delete challenge from database: ${(dbError as Error).message}`)
      // チャレンジ削除失敗は致命的ではないので続行
    }

    // OAuth2準拠: 認可コードをredirect_uriに返す
    if (challengeDoc.redirect_uri) {
      try {
        const redirectUrl = new URL(challengeDoc.redirect_uri)
        redirectUrl.searchParams.set('code', authCode)

        // stateパラメータがある場合は引き継ぐ（CSRF対策）
        if (signatureParams.state) {
          redirectUrl.searchParams.set('state', signatureParams.state)
          logger.debug(`Including state parameter in redirect (value omitted)`)
        }

        // ポップアップ対応は廃止。通常リダイレクトのみ。
        const safeRedirectUrl = redirectUrl.toString()

        // HTTPリダイレクト（302）でサーバー側リダイレクトを実行
        res.redirect(302, safeRedirectUrl)
        return
      } catch (redirectError) {
        logger.error(`Invalid redirect_uri: ${(redirectError as Error).message}`)
        // redirect_uriが無効な場合はJSONレスポンスにフォールバック
      }
    }

    // フォールバック: JSONレスポンス（OAuth2準拠ではないが、APIクライアント用）
    res.json({ code: authCode, expires_in: AUTHCODE_EXPIRATION })
  } catch (err) {
    logger.error(`/oauth/verify-signature error: ${(err as Error).message}`)
    res.status(500).json({ error: 'Internal server error' })
  }
}

/**
 * Symbolトランザクションの署名検証
 * @param payload 署名済みトランザクションのペイロード
 * @returns 署名検証に成功した場合のトランザクション情報
 * @throws Error 署名検証に失敗した場合や、チャレンジが無効な場合
 */
function verifySignature(payload: string): SignatureParams {
  // トランザクションのデシリアライズ
  const tx = SymbolTransactionFactory.deserialize(utils.hexToUint8(payload))
  // ネットワーク名を取得
  const networkName = models.NetworkType.valueToKey(tx.network.value)
  if (networkName.toLowerCase() !== SYMBOL_NETWORK_TYPE.toLowerCase()) {
    throw new Error(`Unsupported network: ${networkName}`)
  }
  // SymbolFacadeを使用して署名を検証
  const facade = new SymbolFacade(networkName.toLowerCase())
  const isSignatureValid = facade.verifyTransaction(tx, tx.signature)
  if (!isSignatureValid) {
    throw new Error('Invalid transaction signature')
  }

  // トランザクションから公開鍵とアドレスを取得
  const publicKey = tx.signerPublicKey.toString()
  const address = facade.createPublicAccount(tx.signerPublicKey).address.toString()

  let challenge = ''
  let state: string | undefined = undefined
  let pkce_challenge: string | undefined = undefined
  let pkce_challenge_method: string | undefined = undefined
  if (tx.type.value === models.TransactionType.TRANSFER.value) {
    const transferTx = tx as models.TransferTransactionV1
    if (transferTx.message && transferTx.message.length > 0) {
      const messageHex = utils.uint8ToHex(transferTx.message)
      // メッセージからnull文字で始まるチャレンジを抽出
      if (messageHex.startsWith('00')) {
        const messageBytes = utils.hexToUint8(messageHex.substring(2))
        const messageText = new TextDecoder().decode(messageBytes)

        let messageJson: any
        try {
          messageJson = JSON.parse(messageText)
        } catch (parseError) {
          throw new Error(`Invalid JSON format in transaction message: ${(parseError as Error).message}`)
        }

        // 必須フィールドの検証
        if (!messageJson.challenge) {
          throw new Error('Missing challenge in transaction message')
        }

        challenge = messageJson.challenge
        state = messageJson.state || undefined
        pkce_challenge = messageJson.pkce_challenge
        pkce_challenge_method = messageJson.pkce_challenge_method
      } else {
        throw new Error('Challenge not found in payload')
      }
    } else {
      throw new Error('Message is empty.')
    }
  } else {
    throw new Error('Unsupported transaction type')
  }

  return {
    publicKey,
    address,
    challenge,
    state,
    pkce_challenge,
    pkce_challenge_method,
  }
}
