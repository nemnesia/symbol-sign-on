import { describe, expect, it } from 'vitest'
import { isMobileDevice } from './platformUtils'

describe('isMobileDevice', () => {
  it('should return true for mobile user agents', () => {
    const mobileUserAgents = [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Mobile Safari/537.36',
      'Opera/9.80 (Android; Opera Mini/24.0.2254/37.8971; U; en) Presto/2.12.423 Version/12.16',
    ]

    mobileUserAgents.forEach((userAgent) => {
      Object.defineProperty(global.navigator, 'userAgent', {
        value: userAgent,
        configurable: true,
      })
      expect(isMobileDevice()).toBe(true)
    })
  })

  it('should return false for non-mobile user agents', () => {
    const desktopUserAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    ]

    desktopUserAgents.forEach((userAgent) => {
      Object.defineProperty(global.navigator, 'userAgent', {
        value: userAgent,
        configurable: true,
      })
      expect(isMobileDevice()).toBe(false)
    })
  })
})
