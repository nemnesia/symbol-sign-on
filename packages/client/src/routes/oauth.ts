/**
 * OAuth2ルーティング
 * このファイルはOAuth2のエンドポイントを定義します。
 * 各エンドポイントはサービス層の関数を呼び出して処理を行います。
 */
import { Router } from 'express'
import { handleAuthorize } from '../services/authorize.js'
import { handleCheck } from '../services/check.js'
import { handleLogout } from '../services/logout.js'
import { handleToken } from '../services/token.js'
import { handleUserinfo } from '../services/userinfo.js'
import { handleVerifySignature } from '../services/verify-signature.js'

/**
 * routerインスタンスの作成
 */
const router = Router()

router.get('/check', handleCheck)

/**
 * OAuth2認可エンドポイント
 */
router.get('/authorize', handleAuthorize)

/**
 * 署名検証エンドポイント
 */
router.post('/verify-signature', handleVerifySignature)

/**
 * トークンエンドポイント
 */
router.post('/token', handleToken)

/**
 * ユーザー情報エンドポイント
 */
router.get('/userinfo', handleUserinfo)

/**
 * ログアウトエンドポイント
 */
router.post('/logout', handleLogout)

export default router
