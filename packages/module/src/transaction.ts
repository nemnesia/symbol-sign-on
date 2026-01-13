import { sha256 } from '@noble/hashes/sha2'
import { v4 as uuidv4 } from 'uuid'
import { base32ToHexAddress, publicKeyToAddress } from './utils/address'
import { base64Encode } from './utils/convert'

/**
 * ネットワークのネメシス署名者の公開鍵(バーンアドレスとして使用する)
 * TestnetとMainnetで異なるため、環境に応じて使用する
 */
const TESTNET_NEMESIS_SIGNER_PUBLIC_KEY = '76E94661562762111FF7E592B00398554973396D8A4B922F3E3D139892F7C35C'
const MAINNET_NEMESIS_SIGNER_PUBLIC_KEY = 'BE0B4CF546B7B4F4BBFCFF9F574FDA527C07A53D3FC76F8BB7DB746F8E8E0A9F'

/**
 * メッセージのJSON形式
 */
export type MessageJson = {
  client_id: string
  challenge: string
  state?: string
  pkce_challenge?: string
  pkce_challenge_method?: 'S256'
}

/**
 * ネットワークIDを取得する
 * @param network ネットワーク名
 * @returns ネットワークID
 */
const getNetworkId = (network: 'mainnet' | 'testnet'): number => {
  return network === 'mainnet' ? 104 : 152
}

/**
 * Stateを生成する
 * @returns State
 */
export const createState = () => {
  return uuidv4()
}

/**
 * PKCEを生成する
 * @returns PKCE
 */
export const createPkce = async () => {
  const codeVerifier = uuidv4()
  const hash = sha256.create()
  hash.update(new TextEncoder().encode(codeVerifier))
  const hashArray = hash.digest()
  const codeChallenge = base64Encode(hashArray).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return { codeVerifier, codeChallenge }
}

/**
 * メッセージJSONを生成する
 * @param clientId クライアントID
 * @param challenge チャレンジ
 * @param state ステート
 * @param pkceChallenge PKCEチャレンジ
 * @param pkceChallengeMethod PKCEチャレンジメソッド
 * @returns メッセージJSON
 */
export const createMessageJson = (
  clientId: string,
  challenge: string,
  state?: string,
  pkceChallenge?: string,
  pkceChallengeMethod: 'S256' = 'S256',
): MessageJson => {
  return {
    client_id: clientId,
    challenge,
    state,
    pkce_challenge: pkceChallenge,
    pkce_challenge_method: pkceChallengeMethod,
  }
}

/**
 * 転送トランザクションを作成する
 * @param networkName ネットワーク名
 * @param message メッセージ
 * @returns 転送トランザクションHEX
 */
export const createSignTx = (networkName: 'mainnet' | 'testnet', messageJson: MessageJson) => {
  const networkId = getNetworkId(networkName)

  const message = '\0' + JSON.stringify(messageJson)

  const len = 160 + message.length
  const sizeHex = len.toString(16).padStart(8, '0').toUpperCase()
  const size = sizeHex.match(/.{2}/g)?.reverse().join('')

  const verifiableEntityHeaderReserved_1 = '00000000'
  const signature = '0'.repeat(128)
  const signerPublicKey = '0'.repeat(64)
  const entityBodyReserved_1 = '00000000'
  const version = '01'
  const network = networkId.toString(16).padStart(2, '0').toUpperCase()
  const type = (16724).toString(16).padStart(4, '0').match(/.{2}/g)!.reverse().join('').toUpperCase()
  const fee = '0'.repeat(16)
  const deadline = '0'.repeat(16)

  const recipientPublicKey =
    networkName === 'testnet' ? TESTNET_NEMESIS_SIGNER_PUBLIC_KEY : MAINNET_NEMESIS_SIGNER_PUBLIC_KEY
  const recipientAddress = base32ToHexAddress(publicKeyToAddress(networkId, recipientPublicKey))

  const mosaicsCount = '00'
  const transferTransactionBodyReserved_1 = '00'
  const transferTransactionBodyReserved_2 = '00000000'

  const encodedMessage = new TextEncoder().encode(message)
  const messageSizeHex = encodedMessage.length.toString(16).padStart(4, '0').toUpperCase()
  const messageSize = messageSizeHex.match(/.{2}/g)!.reverse().join('')
  const messageHex = Array.from(encodedMessage, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()

  // 全体を結合
  const transaction =
    size +
    verifiableEntityHeaderReserved_1 +
    signature +
    signerPublicKey +
    entityBodyReserved_1 +
    version +
    network +
    type +
    fee +
    deadline +
    recipientAddress +
    messageSize +
    transferTransactionBodyReserved_1 +
    transferTransactionBodyReserved_2 +
    mosaicsCount +
    messageHex

  return transaction
}
