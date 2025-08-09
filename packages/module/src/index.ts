import {createSingTx} from "./transaction"

export type ChallengeResponse = {
  client_id: string
  redirect_uri: string
  challenge: string
}
export type SignatureResponse = { payload: string }
export type VerificationResponse = { code: string }

const TESTNET_NEMESIS_SIGNER_PUBLIC_KEY = '76E94661562762111FF7E592B00398554973396D8A4B922F3E3D139892F7C35C'
const MAINNET_NEMESIS_SIGNER_PUBLIC_KEY = 'BE0B4CF546B7B4F4BBFCFF9F574FDA527C07A53D3FC76F8BB7DB746F8E8E0A9F'

export default class SymbolSignOnSDK {
  constructor(private baseUrl: string = '') {}

  async getChallenge(params: {
    client_id: string
    redirect_uri: string
    state?: string
    code_challenge?: string
    code_challenge_method?: string
  }): Promise<ChallengeResponse> {
    const urlParams = new URLSearchParams({
      response_type: 'code',
      client_id: params.client_id,
      redirect_uri: params.redirect_uri,
      state: params.state ?? '',
      code_challenge: params.code_challenge ?? '',
      code_challenge_method: params.code_challenge_method ?? '',
    })
    const res = await fetch(`${this.baseUrl}/oauth/authorize?${urlParams.toString()}`)
    const data = await res.json()
    if (data.error) throw new Error(data.error_description || data.error)
    return {
      client_id: data.client_id,
      redirect_uri: data.redirect_uri,
      challenge: data.challenge,
    }
  }

  // デバイス判定
  isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  }

  createTransaction(signerPublickKey: string, networkName: 'mainnet' | 'testnet' = 'testnet') {
    const message = '\0message'
    const transferTx = createSingTx(networkName, message)
    console.log('Transfer Transaction:', transferTx)
    return transferTx
  }

  // async signChallenge(
  //   challenge: string,
  //   networkType: number,
  // ): Promise<SignatureResponse> {
  //   // SSSModule, SymbolSignTxはwindowグローバルにある前提
  //   if (!window.SSSModule || !window.SymbolSignTx)
  //     throw new Error("SSSModule or SymbolSignTx not found");
  //   const signTx = window.SymbolSignTx.createSingTx(
  //     networkType,
  //     "\0" + challenge,
  //   );
  //   await window.SSSModule.requestSSS();
  //   window.SSSModule.setTransactionByPayload(signTx);
  //   const signedTx = await window.SSSModule.requestSign();
  //   return { payload: signedTx.payload };
  // }

  // async verifySignature(payload: string, isPopup: boolean = false): Promise<VerificationResponse> {
  //   const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  //   if (isPopup) headers['x-requested-with'] = 'popup';
  //   const res = await fetch(`${this.baseUrl}/oauth/verify-signature`, {
  //     method: 'PUT',
  //     headers,
  //     body: JSON.stringify({ payload }),
  //   });
  //   if (!res.ok) {
  //     const errorData = await res.json();
  //     throw new Error(errorData.error || '検証に失敗しました');
  //   }
  //   const data = await res.json();
  //   if (!data.code) throw new Error('認証コードが見つかりません');
  //   return { code: data.code };
  // }
}
