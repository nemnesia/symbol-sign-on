import { describe, expect, it } from 'vitest'
import { createSignTx } from './transaction'

describe('createSignTx', () => {
  describe('基本機能', () => {
    it('テストネット用のトランザクションを作成できる', () => {
      const result = createSignTx('testnet', 'Hello Symbol!')

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
      expect(result).toMatch(/^[0-9A-F]+$/) // Should be uppercase hex
    })

    it('メインネット用のトランザクションを作成できる', () => {
      const result = createSignTx('mainnet', 'Hello Symbol!')

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
      expect(result).toMatch(/^[0-9A-F]+$/) // Should be uppercase hex
    })

    it('異なるネットワークで異なるトランザクションを作成できる', () => {
      const testnetTx = createSignTx('testnet', 'Hello')
      const mainnetTx = createSignTx('mainnet', 'Hello')

      expect(testnetTx).not.toBe(mainnetTx)
    })

    it('異なるメッセージで異なるトランザクションを作成できる', () => {
      const tx1 = createSignTx('testnet', 'Hello')
      const tx2 = createSignTx('testnet', 'World')

      expect(tx1).not.toBe(tx2)
    })
  })

  describe('メッセージ処理', () => {
    it('空のメッセージを処理できる', () => {
      const result = createSignTx('testnet', '')

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('日本語テキストを処理できる', () => {
      const result = createSignTx('testnet', 'こんにちは')

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('絵文字を処理できる', () => {
      const result = createSignTx('testnet', '🚀💎')

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('長いメッセージを処理できる', () => {
      const longMessage = 'A'.repeat(1000)
      const result = createSignTx('testnet', longMessage)

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('トランザクション構造', () => {
    it('ヘッダーに正しいトランザクションサイズが含まれる', () => {
      const message = 'Test'
      const result = createSignTx('testnet', message)

      // Transaction starts with size (4 bytes = 8 hex chars)
      expect(result.length).toBeGreaterThanOrEqual(8)

      // The size should be the total length in bytes
      const sizeBytesHex = result.substring(0, 8)
      const sizeBytes = parseInt(
        sizeBytesHex.substring(6, 8) +
          sizeBytesHex.substring(4, 6) +
          sizeBytesHex.substring(2, 4) +
          sizeBytesHex.substring(0, 2),
        16,
      )
      const expectedSize = 160 + message.length

      expect(sizeBytes).toBe(expectedSize)
    })

    it('トランザクションにネットワークタイプが含まれる', () => {
      const testnetTx = createSignTx('testnet', 'test')
      const mainnetTx = createSignTx('mainnet', 'test')

      // Network type should be different in the transactions
      expect(testnetTx).toContain('98') // 152 in hex
      expect(mainnetTx).toContain('68') // 104 in hex
    })

    it('同じ入力で決定論的である', () => {
      const tx1 = createSignTx('testnet', 'Hello')
      const tx2 = createSignTx('testnet', 'Hello')

      expect(tx1).toBe(tx2)
    })
  })

  describe('エッジケース', () => {
    it('特殊文字を処理できる', () => {
      const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?'
      const result = createSignTx('testnet', specialChars)

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('ユニコード文字を処理できる', () => {
      const unicode = '🌟✨💫⭐🎆'
      const result = createSignTx('testnet', unicode)

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })
  })
})
