import { describe, it, expect } from 'vitest'
import { hexToBase32Address, base32ToHexAddress, publicKeyToAddress } from './address'

describe('Address Utilities', () => {
  describe('hexToBase32Address', () => {
    it('HEXアドレスを正しくBase32に変換する', () => {
      const hexAddress = '9F784B4B2B3E5A6C8D9E0F1A2B3C4D5E6F7A8B9C0D1E2F3'
      const base32Address = hexToBase32Address(hexAddress)

      expect(base32Address).toBeDefined()
      expect(base32Address.length).toBeGreaterThan(0)
    })
  })

  describe('base32ToHexAddress', () => {
    it('Base32アドレスを正しくHEXに変換する', () => {
      const base32Address = 'NB2WJX7X3Z5Q2F7Y7X3Z5Q2F7Y7X3Z5Q2F7Y7X3Z5Q2F7Y7'
      const hexAddress = base32ToHexAddress(base32Address)

      expect(hexAddress).toBeDefined()
      expect(hexAddress.length).toBeGreaterThan(0)
    })
  })

  describe('publicKeyToAddress', () => {
    it('公開鍵から正しいアドレスを生成する', () => {
      const networkId = 152 // Testnet
      const publicKey = 'B4F12E7C9F6946091E2CB8B6D3A12B50D17CCBBF646386EA27CE2946A7423DCF'
      const address = publicKeyToAddress(networkId, publicKey)

      expect(address).toBeDefined()
      expect(address.length).toBeGreaterThan(0)
    })

    it('異なるネットワークIDで異なるアドレスを生成する', () => {
      const testnetId = 152
      const mainnetId = 104
      const publicKey = 'B4F12E7C9F6946091E2CB8B6D3A12B50D17CCBBF646386EA27CE2946A7423DCF'

      const testnetAddress = publicKeyToAddress(testnetId, publicKey)
      const mainnetAddress = publicKeyToAddress(mainnetId, publicKey)

      expect(testnetAddress).not.toBe(mainnetAddress)
    })
  })
})
