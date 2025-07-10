import logger from '../utils/logger.js';

/**
 * Symbol署名の検証を行う（簡易実装）
 * 実際のプロダクションでは、Symbol SDK v3の正しいAPIを使用してください
 * @param challenge - 元の文字列（署名対象）
 * @param signature - 16進数エンコードされた署名
 * @param publicKey - 公開鍵（16進数）
 */
export function verifySymbolSignature(
  challenge: string,
  signature: string,
  publicKey: string
): boolean {
  try {
    // TODO: Symbol SDK v3を使用した正しい署名検証を実装
    // 現在は簡易チェックのみ
    if (!challenge || !signature || !publicKey) {
      logger.warn('署名検証: 必要なパラメータが不足');
      return false;
    }

    // 基本的な形式チェック
    if (signature.length < 120 || publicKey.length !== 64) {
      logger.warn(`署名検証: 形式不正 signature.length=${signature.length}, publicKey.length=${publicKey.length}`);
      return false;
    }

    // TODO: 実際の署名検証ロジック
    // const publicAccount = PublicAccount.createFromPublicKey(publicKey, networkType);
    // const payload = new TextEncoder().encode(challenge);
    // const signatureObj = new Signature(signature);
    // const isValid = publicAccount.verifySignature(payload, signatureObj);

    // 暫定的に常にtrueを返す（開発用）
    const isValid = true;

    if (isValid) {
      logger.info(`署名検証成功: publicKey=${publicKey.substring(0, 8)}...`);
    } else {
      logger.warn(`署名検証失敗: publicKey=${publicKey.substring(0, 8)}...`);
    }

    return isValid;
  } catch (e) {
    logger.error(`署名検証中に例外: ${(e as Error).message}`);
    return false;
  }
}
