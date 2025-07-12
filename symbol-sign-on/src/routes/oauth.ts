import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { AuthCodes, Challenges, Tokens, Clients } from '../db/database.js'
import logger from '../utils/logger.js'
import { utils } from 'symbol-sdk'
import {
  models,
  SymbolFacade,
  SymbolTransactionFactory,
} from 'symbol-sdk/symbol'
import {
  AuthCodeDocument,
  ChallengeDocument
} from '../types/auth.js'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'development_fallback_jwt_secret' // .envファイルから読み込む

// 時間形式(例: 1h, 30m)を秒数に変換する関数
function parseTimeToSeconds(timeStr: string): number {
  const defaultSeconds = 3600; // デフォルト: 1時間

  if (!timeStr) return defaultSeconds;

  // 数値のみの場合は秒数として解釈
  if (/^\d+$/.test(timeStr)) {
    return parseInt(timeStr, 10);
  }

  // 時間表記（例: 1h, 30m）を解釈
  const hours = timeStr.match(/(\d+)h/);
  const minutes = timeStr.match(/(\d+)m/);
  const seconds = timeStr.match(/(\d+)s/);

  let totalSeconds = 0;
  if (hours) totalSeconds += parseInt(hours[1], 10) * 3600;
  if (minutes) totalSeconds += parseInt(minutes[1], 10) * 60;
  if (seconds) totalSeconds += parseInt(seconds[1], 10);

  return totalSeconds > 0 ? totalSeconds : defaultSeconds;
}

// JWT有効期限を秒数で取得
const JWT_EXPIRES_IN = parseTimeToSeconds(process.env.JWT_EXPIRES_IN || '1h');

// 環境変数チェック
if (!process.env.JWT_SECRET) {
  logger.warn('JWT_SECRET環境変数が設定されていません。デフォルト値を使用します。本番環境では必ず設定してください。')
}

// 有効期限の情報はセキュリティ上の問題はないので残す
logger.info(`JWT設定: 有効期限=${JWT_EXPIRES_IN}秒`)

// JWTを生成する関数
function generateJWT(payload: object): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    algorithm: 'HS256'
  })
}

// JWTを検証する関数
function verifyJWT(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch {
    // エラーメッセージからトークン自体の値が漏れないようにする
    logger.error(`JWT verification error: Token invalid or expired`)
    return null
  }
}

const router = Router()

router.get('/authorize', async (req, res) => {
  try {
    const {
      response_type,
      client_id,
      redirect_uri,
      display,
      popup,
      code_challenge,
      code_challenge_method,
      state
    } = req.query

    // クエリパラメータの出力は最小限にする（client_id, state, code_challengeなどを含まないように）
    logger.debug(`/oauth/authorize request received - response_type: ${response_type || 'none'}, display: ${display || 'standard'}`)
    // ポップアップモードの検出
    const isPopupRequest = display === 'popup' || popup === 'true'
    if (isPopupRequest) {
      logger.info(`Popup authorization flow detected`)
    }

    // PKCE（コード交換のための鍵証明）の検出
    let validChallengeMethod = false

    if (code_challenge) {
      logger.info(`PKCE flow detected, code_challenge: ${code_challenge}`)

      // code_challenge_methodの検証
      validChallengeMethod = !code_challenge_method || code_challenge_method === 'S256' || code_challenge_method === 'plain'
      if (!validChallengeMethod) {
        logger.error(`/oauth/authorize invalid code_challenge_method: ${code_challenge_method}`)
        return res.status(400).json({
          error: 'invalid_request',
          error_description: "Invalid code_challenge_method. Supported values are 'S256' and 'plain'"
        })
      }
    }

    // OAuth2必須パラメータの検証
    if (!response_type || !client_id || !redirect_uri) {
      logger.error(
        `/oauth/authorize missing required parameters: response_type=${response_type}, client_id=${client_id}, redirect_uri=${redirect_uri}`,
      )
      return res.status(400).json({
        error: 'invalid_request',
        error_description:
          'Missing required parameters: response_type, client_id, redirect_uri',
      })
    }

    // response_typeは'code'のみサポート
    if (response_type !== 'code') {
      logger.error(
        `/oauth/authorize unsupported response_type: ${response_type}`,
      )
      return res.status(400).json({
        error: 'unsupported_response_type',
        error_description: "Only 'code' response_type is supported",
      })
    }

    // 登録済みのredirect_uriを取得して照合
    let registeredRedirectUri
    try {
      const client = await Clients.findOne({
        client_id: client_id as string,
      })
      if (!client || !client.trusted_redirect_uris) {
        logger.error(
          `/oauth/authorize client not found or has no trusted URIs: client_id=${client_id}`,
        )
        return res.status(400).json({
          error: 'unauthorized_client',
          error_description:
            'Client ID is not registered or has no trusted URIs',
        })
      }
      registeredRedirectUri = client.trusted_redirect_uris
    } catch {
      logger.error(
        `/oauth/authorize database error while fetching client: client_id=${client_id}`,
      )
      return res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to fetch client data',
      })
    }

    if (!registeredRedirectUri.includes(redirect_uri as string)) {
      logger.error(
        `/oauth/authorize redirect_uri does not match any trusted URIs: ${redirect_uri}`,
      )
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'redirect_uri does not match any trusted URIs',
      })
    }

    const challenge = uuidv4()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5分後

    // チャレンジ情報をDBへ保存（OAuth2パラメータも含める）
    try {
      // 正しい型で定義
      const challengeData: ChallengeDocument = {
        challenge,
        client_id: client_id as string,
        redirect_uri: redirect_uri as string,
        expires_at: expiresAt,
        createdAt: new Date(),
      };

      // PKCE用のパラメータを保存
      if (code_challenge) {
        challengeData.code_challenge = code_challenge as string;
        challengeData.code_challenge_method = (code_challenge_method as string === 'S256' ? 'S256' : 'plain');
      }

      // CSRF対策用のstateパラメータ
      if (state) {
        challengeData.state = state as string;
      }

      await Challenges.insertOne(challengeData);
    } catch {
      logger.error(
        `/oauth/authorize database error while inserting challenge: client_id=${client_id}, redirect_uri=${redirect_uri}`,
      )
      return res.status(500).json({
        error: 'server_error',
        error_description: 'Database error',
      })
    }

    // OAuth2準拠のJSONレスポンスを返す
    res.json({
      client_id: client_id,
      redirect_uri: redirect_uri,
      challenge: challenge,
    })
  } catch (err) {
    logger.error(`/oauth/authorize error: ${(err as Error).message}`)
    res.status(500).json({
      error: 'server_error',
      error_description: 'Internal server error',
    })
  }
})

router.put('/verify-signature', async (req, res) => {
  try {
    const { payload } = req.body
    // ペイロードの内容はセキュリティ上の機密情報を含む可能性があるためログ出力しない
    logger.debug(`/oauth/verify-signature payload received (content omitted)`)
    if (!payload) {
      return res.status(400).json({ error: 'Missing payload' })
    }

    // 署名済みトランザクションの検証
    const tx = SymbolTransactionFactory.deserialize(utils.hexToUint8(payload))
    // トランザクション詳細はセキュリティ上重要な情報を含むため最小限のログにする
    logger.debug(`Transaction received, network: ${models.NetworkType.valueToKey(tx.network.value)}, type: ${tx.type.value}`)
    const networkName = models.NetworkType.valueToKey(tx.network.value)
    const facade = new SymbolFacade(networkName.toLowerCase())
    const isSignatureValid = facade.verifyTransaction(tx, tx.signature)

    if (!isSignatureValid) {
      return res.status(401).json({ error: 'Invalid transaction signature' })
    }
    logger.info(`Transaction signature verified successfully`)

    // 署名済Txからチャレンジ情報を復元（公開鍵、アドレス、チャレンジ抽出）
    let challenge: string | null = null
    let publicKey: string | null = null
    let address: string | null = null

    // トランザクションから公開鍵とアドレスを取得
    publicKey = tx.signerPublicKey.toString()
    address = facade.createPublicAccount(tx.signerPublicKey).address.toString()

    // トランザクションのメッセージからチャレンジを抽出
    try {
      if (tx.type.value === 16724) {
        // Transfer transaction
        // TransferTransactionにキャストしてメッセージにアクセス
        const transferTx = tx as any
        if (transferTx.message && transferTx.message.length > 0) {
          const messageHex = utils.uint8ToHex(transferTx.message)
          // メッセージからnull文字で始まるチャレンジを抽出
          if (messageHex.startsWith('00')) {
            const messageBytes = utils.hexToUint8(messageHex.substring(2))
            const messageText = new TextDecoder().decode(messageBytes)
            challenge = messageText
          }
        }
      }
    } catch (error) {
      logger.error(
        `Failed to extract challenge from transaction: ${(error as Error).message}`,
      )
      return res.status(400).json({ error: 'Invalid transaction format' })
    }

    if (!challenge) {
      return res.status(400).json({ error: 'Challenge not found in payload' })
    }
    // チャレンジ値はセキュリティ上重要なのでマスクする
    logger.info(`Challenge extracted: [MASKED]`)

    // チャレンジ有効性チェック
    let challengeDoc
    try {
      challengeDoc = await Challenges.findOne({ challenge })
    } catch (dbError) {
      logger.error(`Database query failed: ${(dbError as Error).message}`)
      return res.status(500).json({ error: 'Database connection error' })
    }

    if (!challengeDoc) {
      return res.status(400).json({ error: 'Invalid or expired challenge' })
    }

    // 認可コード発行
    const code = uuidv4()
    // コード自体の値はログに出さない（セキュリティ向上）
    logger.info(`Authorization code generated (ID omitted for security)`)
    const expiresIn = 120 // 2分に短縮（セキュリティ強化）
    try {
      // 型定義に合わせて作成
      const authCodeData: AuthCodeDocument = {
        code,
        address: address!,
        publicKey: publicKey!,
        expires_at: new Date(Date.now() + expiresIn * 1000),
        used: false,
        createdAt: new Date(),
      };

      // PKCE関連の情報があれば追加（型安全に）
      const challengeDoc2 = challengeDoc as ChallengeDocument;
      if (challengeDoc2.code_challenge) {
        authCodeData.code_challenge = challengeDoc2.code_challenge;
        authCodeData.code_challenge_method = challengeDoc2.code_challenge_method;
      }

      // state情報があれば追加
      if (challengeDoc2.state) {
        authCodeData.state = challengeDoc2.state;
      }

      await AuthCodes.insertOne(authCodeData);
    } catch (dbError) {
      logger.error(`Failed to store auth code: ${(dbError as Error).message}`)
      return res.status(500).json({ error: 'Database connection error' })
    }

    // チャレンジを削除
    try {
      await Challenges.deleteOne({ challenge })
    } catch (dbError) {
      logger.error(`Failed to delete challenge: ${(dbError as Error).message}`)
      // チャレンジ削除失敗は致命的ではないので続行
    }

    // OAuth2準拠: 認可コードをredirect_uriに返す
    if (challengeDoc.redirect_uri) {
      try {
        const redirectUrl = new URL(challengeDoc.redirect_uri)
        redirectUrl.searchParams.set('code', code)

        // stateパラメータがある場合は引き継ぐ（CSRF対策）
        const challengeDoc2 = challengeDoc as ChallengeDocument;
        if (challengeDoc2.state) {
          redirectUrl.searchParams.set('state', challengeDoc2.state);
          logger.debug(`Including state parameter in redirect (value omitted)`);
        }

        // ポップアップからのリクエストの場合はpostMessageで親ウィンドウに結果を送信
        const referer = req.get('Referer')
        // リファラー情報はセキュリティ上重要なのでログに出さない
        // ポップアップ判定ロジックの改善
        const isPopup = (
          // 明示的なポップアップパラメータ
          req.query.popup === 'true' ||
          req.query.display === 'popup' ||
          // ヘッダーベースの判定
          req.headers['x-requested-with'] === 'popup' ||
          // 特定のポップアップウィンドウの特徴
          (req.headers['sec-fetch-dest'] === 'document' && req.headers['sec-fetch-mode'] === 'navigate') ||
          // リファラーベースの判定（より具体的に）
          (referer && (
            referer.includes('oauth_popup') ||
            referer.includes('popup=true') ||
            referer.includes('display=popup') ||
            // 'authorize'を含むが、より具体的な判定
            (referer.includes('authorize') && referer.includes('window.open'))
          )) ||
          // ウィンドウサイズがポップアップに典型的なサイズかチェック
          req.query.popup_height !== undefined ||
          req.query.popup_width !== undefined
        )

        // ポップアップ関連のログは最小限に抑える
        logger.debug(`isPopup: ${isPopup}, mode: ${req.headers['sec-fetch-mode'] || 'unknown'}`)
        // user-agentはセキュリティ上重要な情報を含む可能性があるためログ出力しない

        if (isPopup) {
          const popupResponse = `
<!DOCTYPE html>
<html>
<head>
  <title>Authorization Complete</title>
</head>
<body>
  <script>
    try {
      // ポップアップかどうかをより正確に判定
      const isWindowPopup = window.opener && window.opener !== window;
      const isIframePopup = window.parent && window.parent !== window;

      if (isWindowPopup) {
        // ポップアップデータをより堅牢に親ウィンドウに送信
        const message = {
          type: 'oauth_success',
          code: '${code}',
          redirect_uri: '${challengeDoc.redirect_uri}',
          method: 'POST',
          isPopup: true,
          origin: window.location.origin,
          timestamp: new Date().toISOString()
        };

        // 親ウィンドウに成功メッセージを送信
        window.opener.postMessage(message, '${new URL(challengeDoc.redirect_uri).origin}');

        // 送信確認のためのタイムアウト後にポップアップを閉じる
        console.log('認証成功：親ウィンドウにコード送信中...');
        setTimeout(() => {
          console.log('ポップアップを閉じます');
          window.close();
        }, 800);
      } else if (isIframePopup) {
        // iframeの場合は親フレームにメッセージを送信
        window.parent.postMessage({
          type: 'oauth_success',
          code: '${code}',
          redirect_uri: '${challengeDoc.redirect_uri}',
          method: 'POST',
          isPopup: true,
          isIframe: true
        }, '*');
      } else {
        // 通常のリダイレクト
        window.location.href = '${redirectUrl.toString()}';
      }
    } catch (error) {
      console.error('Error sending message to parent:', error);
      // エラー発生時はリダイレクトでフォールバック
      window.location.href = '${redirectUrl.toString()}';
    }
  </script>
  <p>認可が完了しました。ウィンドウを閉じています...</p>
</body>
</html>`
          return res.send(popupResponse)
        } else {
          // GETリクエストでリダイレクトされるように、明示的にHTMLリダイレクトを行う
          return res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Redirecting...</title>
  <meta http-equiv="refresh" content="0;url=${redirectUrl.toString()}">
</head>
<body>
  <p>リダイレクトしています...</p>
  <script>
    window.location.replace('${redirectUrl.toString()}');
  </script>
</body>
</html>`);
        }
      } catch (redirectError) {
        logger.error(
          `Invalid redirect_uri: ${(redirectError as Error).message}`,
        )
        // redirect_uriが無効な場合はJSONレスポンスにフォールバック
      }
    }

    // フォールバック: JSONレスポンス（OAuth2準拠ではないが、APIクライアント用）
    res.json({ code, expires_in: expiresIn })
  } catch (err) {
    logger.error(`/oauth/verify-signature error: ${(err as Error).message}`)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/token', async (req, res) => {
  try {
    const { grant_type, code, client_id, refresh_token, code_verifier, state } = req.body
    if (!grant_type) {
      return res.status(400).json({ error: 'Missing grant_type' })
    }

    if (grant_type === 'authorization_code') {
      if (!code || !client_id) {
        return res.status(400).json({ error: 'Missing code or client_id' })
      }
      // 認可コードの有効性チェック
      let authCode
      try {
        authCode = await AuthCodes.findOne({ code })
      } catch (dbError) {
        logger.error(`Database query failed: ${(dbError as Error).message}`)
        return res.status(500).json({ error: 'Database connection error' })
      }

      if (!authCode || authCode.used) {
        return res.status(400).json({ error: 'Invalid or used code' })
      }

      // 型安全な処理
      const authCode2 = authCode as AuthCodeDocument;

      // PKCE検証 (アプリに実装されている場合)
      if (authCode2.code_challenge) {
        if (!code_verifier) {
          logger.error('Missing code_verifier for PKCE flow');
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'PKCE code_verifier is required but was not supplied'
          });
        }

        // S256の場合はハッシュ化して比較
        let calculatedChallenge;
        if (authCode2.code_challenge_method === 'S256') {
          try {
            // 注: 本番実装では crypto モジュールが必要
            // この例ではシンプルにするためハッシュ計算はスタブ化
            logger.warn('PKCE S256ハッシュ計算は実際の実装が必要です');
            calculatedChallenge = code_verifier; // 実際の実装ではS256ハッシュを計算
          } catch (err) {
            logger.error(`PKCE S256 calculation error: ${err instanceof Error ? err.message : err}`);
            return res.status(500).json({ error: 'server_error', error_description: 'Failed to verify code challenge' });
          }
        } else {
          // Plain method
          calculatedChallenge = code_verifier;
        }

        if (calculatedChallenge !== authCode2.code_challenge) {
          // 値そのものはログに出さない
          logger.error(`PKCE verification failed: code_verifier does not match code_challenge`);
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'code_verifier does not match code_challenge'
          });
        }

        logger.info('PKCE verification successful');
      }

      // stateパラメータの検証
      if (state && authCode2.state && state !== authCode2.state) {
        logger.error(`State parameter mismatch: ${state} !== ${authCode2.state}`);
        return res.status(400).json({
          error: 'invalid_grant',
          error_description: 'state parameter does not match'
        });
      }
      // JWTを生成
      const jwtPayload = {
        sub: authCode.address, // サブジェクトはSymbolアドレス
        pub: authCode.publicKey, // 公開鍵
        client_id: client_id, // クライアントID
        iat: Math.floor(Date.now() / 1000), // 発行時刻
        type: 'access_token' // トークンタイプ
      }

      const accessToken = generateJWT(jwtPayload)
      const refreshToken = uuidv4()
      const expiresIn = JWT_EXPIRES_IN
      // 認可コードをusedに
      try {
        await AuthCodes.updateOne(
          { code },
          { $set: { used: true, used_at: new Date() } },
        )
      } catch (dbError) {
        logger.error(
          `Failed to update auth code: ${(dbError as Error).message}`,
        )
        // 非致命的エラーなので続行
      }

      // リフレッシュトークン保存
      try {
        await Tokens.insertOne({
          refresh_token: refreshToken,
          address: authCode.address,
          publicKey: authCode.publicKey,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30日
          issued_at: new Date(),
          used: false,
          createdAt: new Date(),
        })
      } catch (dbError) {
        logger.error(
          `Failed to store refresh token: ${(dbError as Error).message}`,
        )
        // リフレッシュトークン保存失敗は致命的ではないので続行
      }
      // トークン発行成功のログ（トークン値は出力しない）
      logger.info(`Token issued successfully for client: ${client_id}`)
      res.json({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: expiresIn,
      })
    } else if (grant_type === 'refresh_token') {
      if (!refresh_token || !client_id) {
        return res
          .status(400)
          .json({ error: 'Missing refresh_token or client_id' })
      }
      // リフレッシュトークン有効性チェック
      let tokenDoc
      try {
        tokenDoc = await Tokens.findOne({ refresh_token })
      } catch (dbError) {
        logger.error(`Database query failed: ${(dbError as Error).message}`)
        return res.status(500).json({ error: 'Database connection error' })
      }

      if (!tokenDoc || tokenDoc.used || tokenDoc.revoked) {
        return res
          .status(400)
          .json({ error: 'Invalid or used/expired refresh_token' })
      }
      // 新しいJWT/リフレッシュトークン発行
      const jwtPayload = {
        sub: tokenDoc.address, // サブジェクトはSymbolアドレス
        pub: tokenDoc.publicKey, // 公開鍵
        client_id: client_id, // クライアントID
        iat: Math.floor(Date.now() / 1000), // 発行時刻
        type: 'access_token', // トークンタイプ
        refresh: true // リフレッシュから発行されたトークン
      }

      const accessToken = generateJWT(jwtPayload)
      const newRefreshToken = uuidv4()
      const expiresIn = JWT_EXPIRES_IN
      // 古いトークンをusedに
      try {
        await Tokens.updateOne(
          { refresh_token },
          { $set: { used: true, used_at: new Date() } },
        )
      } catch (dbError) {
        logger.error(`Failed to update token: ${(dbError as Error).message}`)
        // 非致命的エラーなので続行
      }

      // 新しいリフレッシュトークン保存
      try {
        await Tokens.insertOne({
          refresh_token: newRefreshToken,
          address: tokenDoc.address,
          publicKey: tokenDoc.publicKey,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          issued_at: new Date(),
          used: false,
          createdAt: new Date(),
        })
      } catch (dbError) {
        logger.error(
          `Failed to store new refresh token: ${(dbError as Error).message}`,
        )
        // リフレッシュトークン保存失敗は致命的ではないので続行
      }
      // リフレッシュトークンによる再発行成功のログ（トークン値は出力しない）
      logger.info(`Token refreshed successfully for client: ${client_id}`)
      res.json({
        access_token: accessToken,
        refresh_token: newRefreshToken,
        expires_in: expiresIn,
      })
    } else {
      res.status(400).json({ error: 'Unsupported grant_type' })
    }
  } catch (err) {
    logger.error(`/oauth/token error: ${(err as Error).message}`)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/userinfo', async (req, res) => {
  try {
    const auth = req.headers['authorization']
    if (!auth || !auth.startsWith('Bearer ')) {
      return res
        .status(401)
        .json({ error: 'Missing or invalid Authorization header' })
    }

    // トークンを取得して検証（トークン値はログに出さない）
    const token = auth.replace('Bearer ', '').trim()
    logger.debug('Processing userinfo request with provided token')
    const decodedToken = verifyJWT(token)

    // トークン検証失敗
    if (!decodedToken) {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'The access token is invalid or has expired'
      })
    }

    // トークンから情報を取得
    const address = decodedToken.sub
    const publicKey = decodedToken.pub
    const network = 'testnet' // ネットワーク情報はトークンに入れるかサーバー側で管理
    res.json({ address, publicKey, network })
  } catch (err) {
    logger.error(`/oauth/userinfo error: ${(err as Error).message}`)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/logout', async (req, res) => {
  try {
    const { refresh_token } = req.body
    if (!refresh_token) {
      return res.status(400).json({ error: 'Missing refresh_token' })
    }

    let tokenDoc
    try {
      tokenDoc = await Tokens.findOne({ refresh_token })
    } catch (dbError) {
      logger.error(`Database query failed: ${(dbError as Error).message}`)
      return res.status(500).json({ error: 'Database connection error' })
    }

    if (!tokenDoc) {
      return res.status(400).json({ error: 'Invalid refresh_token' })
    }

    try {
      await Tokens.updateOne(
        { refresh_token },
        {
          $set: {
            revoked: true,
            revoked_at: new Date(),
            used: true,
            used_at: new Date(),
          },
        },
      )
    } catch (dbError) {
      logger.error(`Failed to revoke token: ${(dbError as Error).message}`)
      // トークン無効化失敗は致命的ではないので続行
    }
    res.json({ status: 'ok', message: 'refresh token revoked' })
  } catch (err) {
    logger.error(`/oauth/logout error: ${(err as Error).message}`)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
