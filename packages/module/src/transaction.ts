import { base32ToHexAddress, publicKeyToAddress } from './address'

const TESTNET_NEMESIS_SIGNER_PUBLIC_KEY = '76E94661562762111FF7E592B00398554973396D8A4B922F3E3D139892F7C35C'
const MAINNET_NEMESIS_SIGNER_PUBLIC_KEY = 'BE0B4CF546B7B4F4BBFCFF9F574FDA527C07A53D3FC76F8BB7DB746F8E8E0A9F'

const getNetworkId = (network: 'mainnet' | 'testnet'): number => {
  return network === 'mainnet' ? 104 : 152
}

export const createSingTx = (networkName: 'mainnet' | 'testnet', message: string) => {
  const networkId = getNetworkId(networkName)

  const size = (() => {
    const len = 160 + message.length
    const buf = new Uint8Array(4)
    buf[0] = len & 0xff
    buf[1] = (len >> 8) & 0xff
    buf[2] = (len >> 16) & 0xff
    buf[3] = (len >> 24) & 0xff
    return Array.from(buf)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  })()
  const verifiableEntityHeaderReserved_1 = '00000000'
  const signature =
    '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'

  // 署名者の公開鍵はダミー（実際の署名者はSSS/aLiceが入れてくれる）
  const signerPublicKey = '0000000000000000000000000000000000000000000000000000000000000000'

  const entityBodyReserved_1 = '00000000'
  const version = '01'
  const network = networkId.toString(16).padStart(2, '0').toUpperCase()
  const type = '5441' // TransferTransactionV1
  const fee = '0000000000000000'
  const deadline = '0000000000000000'

  // 受取人はネメシス署名者（バーンアドレス相当）
  const recipientPublicKey =
    networkName === 'testnet' ? TESTNET_NEMESIS_SIGNER_PUBLIC_KEY : MAINNET_NEMESIS_SIGNER_PUBLIC_KEY
  const recipientAddress = base32ToHexAddress(publicKeyToAddress(networkId, recipientPublicKey))

  const messageSize = (() => {
    const len = message.length
    const buf = new Uint8Array(2)
    buf[0] = len & 0xff
    buf[1] = (len >> 8) & 0xff
    return Array.from(buf)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  })()
  const mosaicsCount = '00'
  const transferTransactionBodyReserved_1 = '00'
  const transferTransactionBodyReserved_2 = '00000000'

  // メッセージを16進数に変換
  const messageHex = Array.from(new TextEncoder().encode(message), (byte) => byte.toString(16).padStart(2, '0'))
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
