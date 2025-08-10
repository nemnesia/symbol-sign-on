import { base32ToHexAddress, publicKeyToAddress } from './address'

export const createSingTx = (networkNumber: number, message: string) => {
  const len = 160 + message.length
  const sizeHex = len.toString(16).padStart(8, '0').toUpperCase()
  const size = sizeHex.match(/.{2}/g)?.reverse().join('') || ''

  const verifiableEntityHeaderReserved_1 = '00000000'
  const signature =
    '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
  const signerPublicKey =
    '0000000000000000000000000000000000000000000000000000000000000000'
  const entityBodyReserved_1 = '00000000'
  const version = '01'
  const network = networkNumber.toString(16).padStart(2, '0').toUpperCase()
  const type = '5441'
  const fee = '0000000000000000'
  const deadline = '0000000000000000'

  const recipientAddress = base32ToHexAddress(
    publicKeyToAddress(networkNumber, signerPublicKey),
  )

  const mosaicsCount = '00'
  const transferTransactionBodyReserved_1 = '00'
  const transferTransactionBodyReserved_2 = '00000000'

  const encodedMessage = new TextEncoder().encode(message)
  const messageSizeHex = encodedMessage.length
    .toString(16)
    .padStart(4, '0')
    .toUpperCase()
  const messageSize = messageSizeHex.match(/.{2}/g)?.reverse().join('') || ''
  const messageHex = Array.from(encodedMessage, (byte) =>
    byte.toString(16).padStart(2, '0'),
  )
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
