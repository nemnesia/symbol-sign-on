/**
 * 16進文字列をUint8Arrayに変換
 */
export const hexToUint8 = (hex: string): Uint8Array =>
  new Uint8Array(hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)))

/**
 * Uint8Arrayを16進文字列に変換
 */
export const uint8ToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
