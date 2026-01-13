/**
 * 16進文字列をUint8Arrayに変換
 */
export const hexToUint8 = (hex: string): Uint8Array => {
  if (hex.length === 0) return new Uint8Array()
  return new Uint8Array(hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)))
}

/**
 * Uint8Arrayを16進文字列に変換
 */
export const uint8ToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

/**
 * Base64エンコードのためのユーティリティ関数
 * ブラウザとNode.js環境の両方で動作する
 */
export const base64Encode = (data: Uint8Array): string => {
  // ブラウザ環境の場合
  if (typeof globalThis !== 'undefined' && 'btoa' in globalThis) {
    return globalThis.btoa(String.fromCharCode(...data))
  }
  
  // Node.js環境またはbtoaが利用できない場合
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let result = ''
  let i = 0
  
  while (i < data.length) {
    const a = data[i++]
    const b = i < data.length ? data[i++] : 0
    const c = i < data.length ? data[i++] : 0
    
    const bitmap = (a << 16) | (b << 8) | c
    
    result += chars.charAt((bitmap >> 18) & 63)
    result += chars.charAt((bitmap >> 12) & 63)
    result += i - 2 < data.length ? chars.charAt((bitmap >> 6) & 63) : '='
    result += i - 1 < data.length ? chars.charAt(bitmap & 63) : '='
  }
  
  return result
}
