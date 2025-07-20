import { describe, it, expect } from 'vitest'
import { hexToUint8, uint8ToHex } from '../src/convert'

describe('convert functions', () => {
  describe('hexToUint8', () => {
    it('should convert hex string to Uint8Array', () => {
      const hex = '48656c6c6f'
      const expected = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f])
      const result = hexToUint8(hex)

      expect(result).toEqual(expected)
    })

    it('should handle empty hex string', () => {
      const hex = ''
      const expected = new Uint8Array([])
      const result = hexToUint8(hex)

      expect(result).toEqual(expected)
    })

    it('should handle uppercase hex string', () => {
      const hex = '48656C6C6F'
      const expected = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f])
      const result = hexToUint8(hex)

      expect(result).toEqual(expected)
    })
  })

  describe('uint8ToHex', () => {
    it('should convert Uint8Array to hex string', () => {
      const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f])
      const expected = '48656c6c6f'
      const result = uint8ToHex(bytes)

      expect(result).toBe(expected)
    })

    it('should handle empty Uint8Array', () => {
      const bytes = new Uint8Array([])
      const expected = ''
      const result = uint8ToHex(bytes)

      expect(result).toBe(expected)
    })

    it('should pad single digit hex with zero', () => {
      const bytes = new Uint8Array([0x01, 0x0f, 0xff])
      const expected = '010fff'
      const result = uint8ToHex(bytes)

      expect(result).toBe(expected)
    })
  })

  describe('round trip conversion', () => {
    it('should convert hex to bytes and back to hex correctly', () => {
      const originalHex = '48656c6c6f576f726c64'
      const bytes = hexToUint8(originalHex)
      const resultHex = uint8ToHex(bytes)

      expect(resultHex).toBe(originalHex.toLowerCase())
    })

    it('should convert bytes to hex and back to bytes correctly', () => {
      const originalBytes = new Uint8Array([0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef])
      const hex = uint8ToHex(originalBytes)
      const resultBytes = hexToUint8(hex)

      expect(resultBytes).toEqual(originalBytes)
    })
  })
})
