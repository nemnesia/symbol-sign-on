import { describe, it, expect } from 'vitest'
import { createSignTx } from '../src/index'

describe('createSignTx', () => {
  describe('基本機能', () => {
    it('テストネット用のトランザクションを作成できる', () => {
      const result = createSignTx(152, 'Hello Symbol!')

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
      expect(result).toMatch(/^[0-9A-F]+$/) // Should be uppercase hex
    })

    it('メインネット用のトランザクションを作成できる', () => {
      const result = createSignTx(104, 'Hello Symbol!')

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
      expect(result).toMatch(/^[0-9A-F]+$/) // Should be uppercase hex
    })

    it('異なるネットワークで異なるトランザクションを作成できる', () => {
      const testnetTx = createSignTx(152, 'Hello')
      const mainnetTx = createSignTx(104, 'Hello')

      expect(testnetTx).not.toBe(mainnetTx)
    })

    it('異なるメッセージで異なるトランザクションを作成できる', () => {
      const tx1 = createSignTx(152, 'Hello')
      const tx2 = createSignTx(152, 'World')

      expect(tx1).not.toBe(tx2)
    })
  })

  describe('メッセージ処理', () => {
    it('空のメッセージを処理できる', () => {
      const result = createSignTx(152, '')

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('日本語テキストを処理できる', () => {
      const result = createSignTx(152, 'こんにちは')

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('絵文字を処理できる', () => {
      const result = createSignTx(152, '🚀💎')

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('長いメッセージを処理できる', () => {
      const longMessage = 'A'.repeat(1000)
      const result = createSignTx(152, longMessage)

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('トランザクション構造', () => {
    it('ヘッダーに正しいトランザクションサイズが含まれる', () => {
      const message = 'Test'
      const result = createSignTx(152, message)

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
      const testnetTx = createSignTx(152, 'test')
      const mainnetTx = createSignTx(104, 'test')

      // Network type should be different in the transactions
      expect(testnetTx).toContain('98') // 152 in hex
      expect(mainnetTx).toContain('68') // 104 in hex
    })

    it('同じ入力で決定論的である', () => {
      const tx1 = createSignTx(152, 'Hello')
      const tx2 = createSignTx(152, 'Hello')

      expect(tx1).toBe(tx2)
    })
  })

  describe('エッジケース', () => {
    it('特殊文字を処理できる', () => {
      const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?'
      const result = createSignTx(152, specialChars)

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('ユニコード文字を処理できる', () => {
      const unicode = '🌟✨💫⭐🎆'
      const result = createSignTx(152, unicode)

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('非常に短いネットワーク番号を処理できる', () => {
      const result = createSignTx(1, 'test')

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })
  })
  
})
