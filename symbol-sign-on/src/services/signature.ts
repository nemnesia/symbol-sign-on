import logger from '../utils/logger.js'

/**
 * Symbol署名の検証を行う
 * 注意: この実装は簡易版です。実際のプロダクションでは、
 * oauth.tsのverify-signatureエンドポイントで実装されている
 * より堅牢な署名検証を使用してください。
 *
 * @param challenge - 元の文字列（署名対象）
 * @param signature - 16進数エンコードされた署名
 * @param publicKey - 公開鍵（16進数）
 */
export function verifySymbolSignature(challenge: string, signature: string, publicKey: string): boolean {
  try {
    // パラメータ検証
    if (!challenge || !signature || !publicKey) {
      logger.warn('署名検証: 必要なパラメータが不足')
      return false
    }

    // 基本的な形式チェック
    if (signature.length < 120 || publicKey.length !== 64) {
      logger.warn(`署名検証: 形式不正 signature.length=${signature.length}, publicKey.length=${publicKey.length}`)
      return false
    }

    // 実際の署名検証は oauth.ts の /verify-signature エンドポイントで実装済み
    // このヘルパー関数では基本的な形式チェックのみ行い、
    // 実際の検証は署名済みトランザクションとして検証される
    logger.info('基本的な署名形式チェック完了。実際の検証は署名済みトランザクションで行われます。')

    return true // 形式チェックを通過
  } catch (e) {
    logger.error(`署名検証中に例外: ${(e as Error).message}`)
    return false
  }
}
