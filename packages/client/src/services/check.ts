import { Request, Response } from 'express'
import { Clients } from '../db/mongo.js'
import logger from '../utils/logger.js'

// 定数定義
const SUPPORTED_RESPONSE_TYPES = ['code'] as const

/**
 * /oauth/check の検証ハンドラー
 * クライアントIDとリダイレクトURIの検証を行い、アプリケーション名を返す。
 *
 * @param req Express Requestオブジェクト
 * @param res Express Responseオブジェクト
 */
export async function handleCheck(req: Request, res: Response): Promise<void> {
  try {
    // パラメータ検証
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
        clientValidation.statusCode!,
        clientValidation.errorCode!,
        clientValidation.message!,
        clientValidation.logMessage!,
      )
      return
    }

    const { valid, appName } = clientValidation

    res.json({ valid, app_name: appName })
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
  // 開発者向けの詳細なログを記録
  logger.error(logMessage)

  // ユーザー向けには簡潔なエラーメッセージを返す
  const userFriendlyMessage =
    statusCode >= 500 ? 'An unexpected error occurred. Please try again later.' : errorDescription

  res.status(statusCode).json({
    error,
    error_description: userFriendlyMessage,
  })
}

/**
 * パラメータ検証関数
 * @param query Express Request query object
 * @returns 検証結果とパラメータ
 */
export function validateAuthorizeParams(
  query: Request['query'],
):
  | { valid: true; client_id: string; redirect_uri: string }
  | { valid: false; errorCode: string; message: string } {
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
    // TODO: カスタムスキームの検証ロジックを実装
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
  appName?: string
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

    return { valid: true, appName: client.app_name || 'Unknown App' }
  } catch (err) {
    // MongoDBエラー
    let errorMessage = 'Failed to fetch client data'
    if (err instanceof Error) {
      if (err.name === 'MongoNetworkError') {
        errorMessage = 'MongoDB connection error'
      } else if (err.name === 'MongoNetworkTimeoutError') {
        errorMessage = 'MongoDB operation timed out'
      }
    }

    return {
      valid: false,
      statusCode: 500,
      errorCode: 'server_error',
      message: errorMessage,
      logMessage: `/oauth/authorize database error while fetching client: client_id=${clientId}, error=${(err as Error).stack || (err as Error).message}`,
    }
  }
}
