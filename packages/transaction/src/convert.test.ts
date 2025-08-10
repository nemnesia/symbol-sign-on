import { describe, it, expect } from 'vitest'
import { hexToUint8, uint8ToHex } from '../src/convert'

describe('変換関数', () => {
  describe('hexToUint8', () => {
    it('16進数文字列をUint8Arrayに変換できる', () => {
      const hex = '48656c6c6f'
      const expected = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f])
      const result = hexToUint8(hex)

      expect(result).toEqual(expected)
    })

    it('空の16進数文字列を正しく処理できる', () => {
      const hex = ''
      const expected = new Uint8Array([])
      const result = hexToUint8(hex)

      expect(result).toEqual(expected)
    })

    it('大文字の16進数文字列を正しく処理できる', () => {
      const hex = '48656C6C6F'
      const expected = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f])
      const result = hexToUint8(hex)

      expect(result).toEqual(expected)
    })
  })

  describe('uint8ToHex', () => {
    it('Uint8Arrayを16進数文字列に変換できる', () => {
      const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f])
      const expected = '48656c6c6f'
      const result = uint8ToHex(bytes)

      expect(result).toBe(expected)
    })

    it('空のUint8Arrayを正しく処理できる', () => {
      const bytes = new Uint8Array([])
      const expected = ''
      const result = uint8ToHex(bytes)

      expect(result).toBe(expected)
    })

    it('1桁の16進数をゼロ埋めする', () => {
      const bytes = new Uint8Array([0x01, 0x0f, 0xff])
      const expected = '010fff'
      const result = uint8ToHex(bytes)

      expect(result).toBe(expected)
    })
  })

  describe('ラウンドトリップ変換', () => {
    it('16進数をバイト配列に変換し、再び16進数に正しく戻せる', () => {
      const originalHex = '48656c6c6f576f726c64'
      const bytes = hexToUint8(originalHex)
      const resultHex = uint8ToHex(bytes)

      expect(resultHex).toBe(originalHex.toLowerCase())
    })

    it('バイト配列を16進数に変換し、再びバイト配列に正しく戻せる', () => {
      const originalBytes = new Uint8Array([
        0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef,
      ])
      const hex = uint8ToHex(originalBytes)
      const resultBytes = hexToUint8(hex)

      expect(resultBytes).toEqual(originalBytes)
    })
  })
})
