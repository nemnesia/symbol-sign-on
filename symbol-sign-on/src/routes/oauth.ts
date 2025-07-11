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

const router = Router()

// GET /oauth/authorize
router.get('/authorize', async (req, res) => {
  try {
    const { response_type, client_id, redirect_uri } = req.query
    logger.debug(`/oauth/authorize query: ${JSON.stringify(req.query)}`)

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
      await Challenges.insertOne({
        challenge,
        client_id: client_id as string,
        redirect_uri: redirect_uri as string,
        expires_at: expiresAt,
        createdAt: new Date(),
      })
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

// PUT /oauth/verify-signature
router.put('/verify-signature', async (req, res) => {
  try {
    const { payload } = req.body
    logger.debug(`/oauth/verify-signature payload: ${payload}`)
    if (!payload) {
      return res.status(400).json({ error: 'Missing payload' })
    }

    // 署名済みトランザクションの検証
    const tx = SymbolTransactionFactory.deserialize(utils.hexToUint8(payload))
    logger.debug(JSON.stringify(tx.toJson(), null, 2))
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
    logger.info(`Challenge extracted: ${challenge}`)

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
    const expiresIn = 300 // 5分
    try {
      await AuthCodes.insertOne({
        code,
        address: address!,
        publicKey: publicKey!,
        expires_at: new Date(Date.now() + expiresIn * 1000),
        used: false,
        createdAt: new Date(),
      })
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

        // ポップアップからのリクエストの場合はpostMessageで親ウィンドウに結果を送信
        const referer = req.get('Referer')
        console.debug(`Referer: ${referer}`)
        const isPopup =
          req.query.popup === 'true' ||
          req.headers['x-requested-with'] === 'popup' ||
          (referer && referer.includes('oauth_popup')) ||
          (referer && referer.includes('authorize'))

        console.debug(`isPopup: ${isPopup}`)
        console.debug(`popup query: ${req.query.popup}`)
        console.debug(`x-requested-with: ${req.headers['x-requested-with']}`)
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
      if (window.opener) {
        // POSTメッセージで認可コードを送信
        window.opener.postMessage({
          type: 'oauth_success',
          code: '${code}',
          redirect_uri: '${challengeDoc.redirect_uri}',
          method: 'POST'  // POSTメソッドを明示
        }, '${new URL(challengeDoc.redirect_uri).origin}');
        setTimeout(() => window.close(), 500);
      } else {
        window.location.href = '${redirectUrl.toString()}';
      }
    } catch (error) {
      console.error('Error sending message to parent:', error);
      window.location.href = '${redirectUrl.toString()}';
    }
  </script>
  <p>認可が完了しました。ウィンドウを閉じています...</p>
</body>
</html>`
          return res.send(popupResponse)
        } else {
          return res.redirect(redirectUrl.toString())
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

// POST /oauth/token
router.post('/token', async (req, res) => {
  try {
    const { grant_type, code, client_id, refresh_token } = req.body
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
      // JWT生成（ダミー）
      const accessToken = 'FAKE_JWT_' + code
      const refreshToken = uuidv4()
      const expiresIn = 3600
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
      // 新しいJWT/リフレッシュトークン発行（ダミー）
      const accessToken = 'FAKE_JWT_' + refresh_token
      const newRefreshToken = uuidv4()
      const expiresIn = 3600
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

// GET /oauth/userinfo
router.get('/userinfo', async (req, res) => {
  try {
    const auth = req.headers['authorization']
    if (!auth || !auth.startsWith('Bearer ')) {
      return res
        .status(401)
        .json({ error: 'Missing or invalid Authorization header' })
    }
    const _token = auth.replace('Bearer ', '').trim()
    // TODO: JWT検証（現状はダミー）
    // ダミー: トークン末尾からアドレス・公開鍵・ネットワークを生成
    const address = 'FAKE_ADDRESS'
    const publicKey = 'FAKE_PUBLIC_KEY'
    const network = 'testnet'
    res.json({ address, publicKey, network })
  } catch (err) {
    logger.error(`/oauth/userinfo error: ${(err as Error).message}`)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /oauth/logout
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
