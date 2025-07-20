import { describe, it, expect } from 'vitest'
import { createSingTx } from '../src/index'

describe('createSingTx', () => {
  describe('basic functionality', () => {
    it('should create a transaction for testnet', () => {
      const result = createSingTx(152, 'Hello Symbol!')

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
      expect(result).toMatch(/^[0-9A-F]+$/) // Should be uppercase hex
    })

    it('should create a transaction for mainnet', () => {
      const result = createSingTx(104, 'Hello Symbol!')

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
      expect(result).toMatch(/^[0-9A-F]+$/) // Should be uppercase hex
    })

    it('should create different transactions for different networks', () => {
      const testnetTx = createSingTx(152, 'Hello')
      const mainnetTx = createSingTx(104, 'Hello')

      expect(testnetTx).not.toBe(mainnetTx)
    })

    it('should create different transactions for different messages', () => {
      const tx1 = createSingTx(152, 'Hello')
      const tx2 = createSingTx(152, 'World')

      expect(tx1).not.toBe(tx2)
    })
  })

  describe('message handling', () => {
    it('should handle empty message', () => {
      const result = createSingTx(152, '')

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should handle Japanese text', () => {
      const result = createSingTx(152, 'こんにちは')

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should handle emoji', () => {
      const result = createSingTx(152, '🚀💎')

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should handle long message', () => {
      const longMessage = 'A'.repeat(1000)
      const result = createSingTx(152, longMessage)

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('transaction structure', () => {
    it('should have correct transaction size in header', () => {
      const message = 'Test'
      const result = createSingTx(152, message)

      // Transaction starts with size (4 bytes = 8 hex chars)
      expect(result.length).toBeGreaterThanOrEqual(8)

      // The size should be the total length in bytes
      const sizeBytesHex = result.substring(0, 8)
      const sizeBytes = parseInt(sizeBytesHex.substring(6, 8) + sizeBytesHex.substring(4, 6) + sizeBytesHex.substring(2, 4) + sizeBytesHex.substring(0, 2), 16)
      const expectedSize = 160 + message.length

      expect(sizeBytes).toBe(expectedSize)
    })

    it('should contain network type in transaction', () => {
      const testnetTx = createSingTx(152, 'test')
      const mainnetTx = createSingTx(104, 'test')

      // Network type should be different in the transactions
      expect(testnetTx).toContain('98') // 152 in hex
      expect(mainnetTx).toContain('68') // 104 in hex
    })

    it('should be deterministic for same inputs', () => {
      const tx1 = createSingTx(152, 'Hello')
      const tx2 = createSingTx(152, 'Hello')

      expect(tx1).toBe(tx2)
    })
  })

  describe('edge cases', () => {
    it('should handle special characters', () => {
      const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?'
      const result = createSingTx(152, specialChars)

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should handle unicode characters', () => {
      const unicode = '🌟✨💫⭐🎆'
      const result = createSingTx(152, unicode)

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should handle very short network numbers', () => {
      const result = createSingTx(1, 'test')

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })
  })
})
