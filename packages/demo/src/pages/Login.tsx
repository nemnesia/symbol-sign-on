import { useEffect, useState } from 'react'
import { createSignTx, getChallenge, isMobileDevice, verifySignature, type ChallengeRequest } from 'sso-module'
import { requestSign, requestSSS, setTransactionByPayload } from 'sss-module'
import symbolLogo from '../assets/Symbol_Logo_primary_light_BG.svg'

const SSO_BASE_URL = 'http://localhost:3510'

function Login() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  /**
   * 画面表示時
   */
  useEffect(() => {
    /**************************************
     * URLからパラメータを取得
     **************************************/

    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')

    // codeがない場合は終了
    if (code === null) {
      refreshToken()
      return
    }

    // stateが異なる場合は終了
    if (state !== null && state !== sessionStorage.getItem('sso_state')) {
      console.error('Invalid state')
      setErrorMessage('Invalid state')
      return
    }

    // アクセストークン取得
    accessToken(code)

    // URLパラメータ削除
    const url = new URL(window.location.href)
    url.searchParams.delete('code')
    url.searchParams.delete('state')
    window.history.replaceState({}, document.title, url.pathname + url.search)
    // セッションストレージ削除
    sessionStorage.removeItem('sso_state')
    sessionStorage.removeItem('sso_code_verifier')
  }, [])

  const accessToken = async (code: string) => {
    /**************************************
     * アクセストークン取得
     **************************************/

    const response = await fetch('http://localhost:3510/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: code,
        client_id: 'demoapp',
        code_verifier: sessionStorage.getItem('sso_code_verifier'),
      }),
    })

    if (response.status !== 200) {
      console.log(`Failed to fetch access token: ${response.statusText}`)
      setErrorMessage(`Failed to fetch access token: ${response.statusText}`)
      return
    }

    const responseJson = await response.json()

    // アクセストークン(メモリ保存)
    const accessToken = responseJson.access_token

    // リフレッシュトークン(HTTP Only Cookie保存)
    const refreshToken = responseJson.refresh_token
    // リフレッシュトークンをHTTP Only Cookieに保存する
    document.cookie = `refresh_token=${refreshToken}; HttpOnly; Path=/;`

    console.debug('アクセストークン:', accessToken)
    console.debug('リフレッシュトークン:', refreshToken)
  }

  const refreshToken = async () => {
    const response = await fetch('http://localhost:3510/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: 'demoapp',
      }),
    })

    if (response.status !== 200) {
      console.log(`Failed to refresh token: ${response.statusText}`)
      setErrorMessage(`Failed to refresh token: ${response.statusText}`)
      return
    }

    const responseJson = await response.json()

    // アクセストークン(メモリ保存)
    const accessToken = responseJson.access_token

    // リフレッシュトークン(HTTP Only Cookie保存)
    const newRefreshToken = responseJson.refresh_token
    // リフレッシュトークンをHTTP Only Cookieに保存する
    document.cookie = `refresh_token=${newRefreshToken}; HttpOnly; Path=/;`

    console.debug('[リ]アクセストークン:', accessToken)
    console.debug('[リ]リフレッシュトークン:', newRefreshToken)
  }

  const handleLogin = async () => {
    // エラーメッセージエリア初期化
    setErrorMessage(null)

    /**************************************
     * チャレンジ取得
     **************************************/

    // チャレンジ取得
    const challengeRequest: ChallengeRequest = {
      client_id: 'demoapp',
      redirect_uri: 'http://localhost:5173/login',
    }
    const challengeResponse = await getChallenge(challengeRequest, SSO_BASE_URL)

    // エラーがある場合はメッセージを表示
    if (challengeResponse.error) {
      console.error('Failed to get challenge')
      setErrorMessage(`App client is invalid: ${challengeResponse.error_description}`)
      return
    }
    const challenge = challengeResponse.challenge

    /**************************************
     * State生成
     **************************************/

    // State生成(認可コードと一緒に返ってくる値と比較する)
    const state = crypto.randomUUID()

    /**************************************
     * PKCE生成
     **************************************/

    // PKCEを生成(アクセストークンを取得するときに必要)
    const codeVerifier = crypto.randomUUID()
    const encoder = new TextEncoder()
    const data = encoder.encode(codeVerifier)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const codeChallenge = btoa(String.fromCharCode(...hashArray))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    /**************************************
     * Symbol 転送トランザクション作成
     **************************************/

    const messageJson = {
      challenge,
      state,
      pkce_challenge: codeChallenge,
      pkce_challenge_method: 'S256', // SHA-256のみ対応
    }
    const message = '\0' + JSON.stringify(messageJson)
    const unsignedTxHex = createSignTx('testnet', message)

    /**************************************
     * Symbol 転送トランザクション署名
     **************************************/

    // 署名
    let signedTxJson = undefined
    if (isMobileDevice()) {
      console.debug('モバイルデバイスでの処理を実行')
    } else {
      console.debug('デスクトップデバイスでの処理を実行')
      if (requestSSS()) {
        setTransactionByPayload(unsignedTxHex)
        signedTxJson = await requestSign()
        console.debug('署名されたトランザクション:', signedTxJson.payload)
      }
    }

    /**************************************
     * セッションストレージに保存
     **************************************/

    // StateとPKCEをセッションストレージに保存
    sessionStorage.setItem('sso_state', state)
    sessionStorage.setItem('sso_code_verifier', codeVerifier)

    /**************************************
     * 署名済みトランザクションを送信
     **************************************/

    try {
      verifySignature(signedTxJson.payload, SSO_BASE_URL)
    } catch (error) {
      console.error('Unexpected error: Failed to send:', error)
      setErrorMessage('Unexpected error: Failed to send')
      return
    }

    // end of method
  }

  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      <h1>Symbol Sign On</h1>
      <img src={symbolLogo} className="logo react" alt="Symbol logo" />
      {errorMessage && <div style={{ color: 'red', marginBottom: '20px' }}>{errorMessage}</div>}
      <button onClick={handleLogin} style={{ padding: '10px 20px', fontSize: '16px' }}>
        Symbol Sign
      </button>
    </div>
  )
}

export default Login
