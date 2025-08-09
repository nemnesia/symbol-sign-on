import { ripemd160 } from '@noble/hashes/legacy'
import { sha3_256 } from '@noble/hashes/sha3'
import { hexToUint8, uint8ToHex } from './convert.js'

/**
 * Base32エンコード/デコード用の文字セット
 */
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/**
 * HEXアドレスをBase32アドレスに変換
 */
export const hexToBase32Address = (hexAddress: string): string => {
  let bits = 0
  let value = 0
  let base32 = ''
  for (const byte of hexToUint8(hexAddress)) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      base32 += BASE32_CHARS[(value >>> (bits - 5)) & 0x1f]
      bits -= 5
    }
  }
  if (bits > 0) base32 += BASE32_CHARS[(value << (5 - bits)) & 0x1f]
  return base32
}

/**
 * Base32アドレスをHEXアドレスに変換
 */
export const base32ToHexAddress = (base32Address: string): string => {
  let bits = 0
  let value = 0
  let hex = ''
  for (const char of base32Address) {
    value = (value << 5) | BASE32_CHARS.indexOf(char)
    bits += 5
    while (bits >= 8) {
      hex += ((value >>> (bits - 8)) & 0xff).toString(16).padStart(2, '0')
      bits -= 8
    }
  }
  return hex.toUpperCase()
}

/**
 * 公開鍵からアドレスを生成
 */
export const publicKeyToAddress = (networkId: number, publicKey: string): string => {
  const ripemdHash = ripemd160(sha3_256(hexToUint8(publicKey)))
  const versionPrefixed = new Uint8Array([networkId, ...ripemdHash])
  const checksum = sha3_256(versionPrefixed).slice(0, 3)
  return hexToBase32Address(uint8ToHex(new Uint8Array([...versionPrefixed, ...checksum])))
}
