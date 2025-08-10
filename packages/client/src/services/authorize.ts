/**
 * チャレンジコード発行エンドポイント
 * OAuth2認可リクエストを受け取り、チャレンジコードを発行する。
 * - 必須パラメータの検証（関数化）
 * - クライアントIDとリダイレクトURIの照合（関数化）
 * - Redisへチャレンジ情報保存
 * - 定数外部化、URL検証強化、レスポンス統一
 */
import { Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { Clients, setChallenge } from '../db/mongo.js'
import { ChallengeDocument } from '../types/mongo.types.js'
import logger from '../utils/logger.js'

// 定数定義
const CHALLENGE_EXPIRES_IN = 300 // 5分
const SUPPORTED_RESPONSE_TYPES = ['code'] as const

/**
 * /oauth/authorize の処理
 * チャレンジコードリクエストの処理
 *
 * リクエスト
 * - response_type: 'code'（固定）
 * - client_id: クライアントID
 * - redirect_uri: リダイレクトURI
 * @param req Expressリクエスト
 * @param res Expressレスポンス
 */
export async function handleAuthorize(req: Request, res: Response): Promise<void> {
  try {
    // 型安全なパラメータ検証
    const validationResult = validateAuthorizeParams(req.query)
    if (!validationResult.valid) {
      handleError(
        res,
        400,
        validationResult.errorCode,
        validationResult.message,
        `/oauth/authorize validation error: ${validationResult.message}`,
      )
      return
    }

    const { client_id, redirect_uri } = validationResult

    // クライアント検証
    const clientValidation = await validateClient(client_id, redirect_uri)
    if (!clientValidation.valid) {
      handleError(
        res,
        clientValidation.statusCode || 500,
        clientValidation.errorCode || 'server_error',
        clientValidation.message || 'Client validation failed',
        clientValidation.logMessage || 'Unknown client validation error',
      )
      return
    }

    // チャレンジコード生成（UUID）
    const challenge = uuidv4()

    try {
      // Mongoに保存するチャレンジ情報を構築
      const challengeData: Omit<ChallengeDocument, 'createdAt' | 'expiresAt'> = {
        challenge: challenge,
        client_id: client_id,
        redirect_uri: redirect_uri,
      }

      // Mongoにチャレンジ情報を保存
      await setChallenge(challenge, challengeData, CHALLENGE_EXPIRES_IN)
    } catch (err) {
      // Mongo保存エラー
      handleError(
        res,
        500,
        'server_error',
        'Database error',
        `/oauth/authorize Database error while inserting challenge: client_id=${client_id}, redirect_uri=${redirect_uri}, error=${(err as Error).stack || (err as Error).message}`,
      )
      return
    }

    // OAuth2準拠のJSONレスポンスを返却（PKCE用語統一）
    res.json({
      client_id: client_id,
      redirect_uri: redirect_uri,
      challenge: challenge,
    })
  } catch (err) {
    // 予期しないサーバーエラー
    handleError(
      res,
      500,
      'server_error',
      'Internal server error',
      `/oauth/authorize error: ${(err as Error).stack || (err as Error).message}`,
    )
  }
}

/**
 * 共通のエラーハンドリング関数
 * @param res Expressレスポンス
 * @param statusCode ステータスコード
 * @param error エラーコード
 * @param errorDescription エラー詳細
 * @param logMessage ログメッセージ
 */
function handleError(
  res: Response,
  statusCode: number,
  error: string,
  errorDescription: string,
  logMessage: string,
): void {
  logger.error(logMessage)
  res.status(statusCode).json({
    error,
    error_description: errorDescription,
  })
}

/**
 * 型安全なパラメータ検証関数
 * @param query Express Request query object
 * @returns 検証結果とパラメータ
 */
export function validateAuthorizeParams(
  query: Request['query'],
): { valid: true; client_id: string; redirect_uri: string } | { valid: false; errorCode: string; message: string } {
  const { response_type, client_id, redirect_uri } = query

  // 必須パラメータの存在チェック
  if (response_type == undefined || client_id == undefined || redirect_uri == undefined) {
    return {
      valid: false,
      errorCode: 'invalid_request',
      message: 'Missing required parameters: response_type, client_id, redirect_uri',
    }
  }

  // 配列パラメータのチェック
  if (Array.isArray(response_type) || Array.isArray(client_id) || Array.isArray(redirect_uri)) {
    return {
      valid: false,
      errorCode: 'invalid_request',
      message: 'Parameters must be single values, not arrays',
    }
  }

  // response_type の検証（定数使用）
  if (!SUPPORTED_RESPONSE_TYPES.includes(response_type as any)) {
    return {
      valid: false,
      errorCode: 'unsupported_response_type',
      message: "Only 'code' response_type is supported",
    }
  }

  // 型安全な文字列変換
  const clientId = String(client_id)
  const redirectUri = String(redirect_uri)

  // 基本的な形式チェック
  if (clientId.length === 0 || redirectUri.length === 0) {
    return {
      valid: false,
      errorCode: 'invalid_request',
      message: 'client_id and redirect_uri cannot be empty',
    }
  }

  // redirect_uri の強化されたURL形式チェック
  if (!isValidRedirectUri(redirectUri)) {
    return {
      valid: false,
      errorCode: 'invalid_request',
      message: 'redirect_uri must be a valid URL',
    }
  }

  return {
    valid: true,
    client_id: clientId,
    redirect_uri: redirectUri,
  }
}

/**
 * 強化されたURL検証関数
 * @param uri 検証するURL
 * @returns 有効かどうか
 */
function isValidRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri)

    // 本番環境ではHTTPSのみ許可
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
      return false
    }

    // localhost以外のHTTPを拒否（開発環境考慮）
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
      return false
    }

    // カスタムスキーム（モバイルアプリ等）も許可
    return true
  } catch {
    return false
  }
}

/**
 * クライアント検証関数
 * @param clientId クライアントID
 * @param redirectUri リダイレクトURI
 * @returns 検証結果
 */
async function validateClient(
  clientId: string,
  redirectUri: string,
): Promise<{
  valid: boolean
  statusCode?: number
  errorCode?: string
  message?: string
  logMessage?: string
}> {
  try {
    // クライアント情報をMongoDBから取得
    const client = await Clients.findOne({ client_id: clientId })

    // クライアントが存在しない、またはtrusted_redirect_uriが未登録の場合はエラー
    if (!client || !client.trusted_redirect_uri) {
      return {
        valid: false,
        statusCode: 400,
        errorCode: 'unauthorized_client',
        message: 'Client ID is not registered or has no trusted URI',
        logMessage: `/oauth/authorize client not found or has no trusted URI: client_id=${clientId}`,
      }
    }

    // redirect_uriが登録済みURIと完全一致するか検証（セキュリティ強化）
    if (!client.trusted_redirect_uri.includes(redirectUri)) {
      return {
        valid: false,
        statusCode: 400,
        errorCode: 'invalid_request',
        message: 'redirect_uri does not match any trusted URI',
        logMessage: `/oauth/authorize redirect_uri does not match any trusted URI: ${redirectUri}`,
      }
    }

    return { valid: true }
  } catch (err) {
    // DB取得エラー
    return {
      valid: false,
      statusCode: 500,
      errorCode: 'server_error',
      message: 'Failed to fetch client data',
      logMessage: `/oauth/authorize database error while fetching client: client_id=${clientId}, error=${(err as Error).stack || (err as Error).message}`,
    }
  }
}
