/**
 * チャレンジリクエストの型定義
 */
export type ChallengeRequest = {
  client_id: string
  redirect_uri: string
}

/**
 * チャレンジレスポンスの型定義
 */
export type ChallengeResponse = {
  client_id: string
  redirect_uri: string
  app_name?: string
  challenge?: string
  error?: string
  error_description?: string
}

/**
 * アプリクライアントのチェックを行う
 * @param params チャレンジリクエスト
 * @param baseUrl サーバベースURL
 * @returns チェックアプリクライアントレスポンスまたはエラー
 */
export const checkAppClient = async (params: ChallengeRequest, baseUrl?: string): Promise<ChallengeResponse> => {
  const param = new URLSearchParams({
    response_type: 'code',
    client_id: params.client_id,
    redirect_uri: params.redirect_uri,
  })

  const res = await fetch(`${baseUrl}/oauth/check?${param.toString()}`)

  const data = await res.json()
  if (data.error) {
    // エラー
    return {
      client_id: data.client_id,
      redirect_uri: data.redirect_uri,
      error: data.error,
      error_description: data.error_description,
    }
  }

  return {
    client_id: params.client_id,
    redirect_uri: params.redirect_uri,
    app_name: data.app_name,
  }
}

/**
 * チャレンジを取得する
 * @param params チャレンジリクエスト
 * @param baseUrl サーバベースURL
 * @returns チャレンジレスポンスまたはエラー
 */
export const getChallenge = async (params: ChallengeRequest, baseUrl?: string): Promise<ChallengeResponse> => {
  const urlParams = new URLSearchParams({
    response_type: 'code',
    client_id: params.client_id,
    redirect_uri: params.redirect_uri,
  })
  const res = await fetch(`${baseUrl}/oauth/authorize?${urlParams.toString()}`)

  const data = await res.json()
  if (data.error) {
    // エラー
    return {
      client_id: data.client_id,
      redirect_uri: data.redirect_uri,
      error: data.error,
      error_description: data.error_description,
    }
  }

  return {
    client_id: data.client_id,
    redirect_uri: data.redirect_uri,
    app_name: data.app_name,
    challenge: data.challenge,
  }
}

/**
 * 署名検証を行う
 * @param signedTx 署名済みトランザクション
 * @param baseUrl サーバベースURL
 */
export const verifySignature = async (signedTx: string, baseUrl?: string) => {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = `${baseUrl}/oauth/verify-signature`
  form.style.display = 'none'

  const payloadInput = document.createElement('input')
  payloadInput.type = 'hidden'
  payloadInput.name = 'payload'
  payloadInput.value = signedTx

  form.appendChild(payloadInput)
  document.body.appendChild(form)

  form.submit()
}
