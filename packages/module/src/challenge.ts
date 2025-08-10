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
  challenge: string
}

/**
 * チャレンジエラーの型定義
 */
export type ChallengeError = {
  error: string
  error_description?: string
}

/**
 * チャレンジを取得する
 * @param params パラメータ(client_id, redirect_uri)
 * @param baseUrl サーバベースURL
 * @returns チャレンジレスポンスまたはエラー
 */
export const getChallenge = async (
  params: ChallengeRequest,
  baseUrl?: string,
): Promise<ChallengeResponse | ChallengeError> => {
  const urlParams = new URLSearchParams({
    response_type: 'code',
    client_id: params.client_id,
    redirect_uri: params.redirect_uri,
  })
  const res = await fetch(`${baseUrl}/oauth/authorize?${urlParams.toString()}`)
  const data = await res.json()
  return data
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
