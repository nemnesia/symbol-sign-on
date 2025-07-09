export const createSingTx = (networkNumber: number, message: string) => {
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
  const signerPublicKey =
    '0000000000000000000000000000000000000000000000000000000000000000'
  const entityBodyReserved_1 = '00000000'
  const version = '01'
  const network = networkNumber.toString(16).padStart(2, '0').toUpperCase()
  const type = '5441'
  const fee = '0000000000000000'
  const deadline = '0000000000000000'

  const recipientAddress = '000000000000000000000000000000000000000000000000'
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
  const messageHex = Array.from(new TextEncoder().encode(message), (byte) =>
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
