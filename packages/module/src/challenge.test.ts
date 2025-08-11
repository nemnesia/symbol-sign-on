import { describe, expect, it, vi } from 'vitest'
import { ChallengeRequest, ChallengeResponse, getChallenge, verifySignature } from './challenge'

describe('getChallenge', () => {
  it('should return a ChallengeResponse when the request is successful', async () => {
    const mockResponse: ChallengeResponse = {
      client_id: 'test-client',
      redirect_uri: 'https://example.com',
      challenge: 'test-challenge',
    }

    global.fetch = vi.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve(mockResponse),
      } as Response),
    )

    const params: ChallengeRequest = {
      client_id: 'test-client',
      redirect_uri: 'https://example.com',
    }

    const result = await getChallenge(params, 'https://api.example.com')
    expect(result).toEqual(mockResponse)
  })

  // it('should return a ChallengeError when the request fails', async () => {
  //   const mockError: ChallengeError = {
  //     error: 'invalid_request',
  //     error_description: 'Invalid client_id or redirect_uri',
  //   }

  //   global.fetch = vi.fn(() =>
  //     Promise.resolve({
  //       json: () => Promise.resolve(mockError),
  //     } as Response),
  //   )

  //   const params: ChallengeRequest = {
  //     client_id: 'invalid-client',
  //     redirect_uri: 'https://example.com',
  //   }

  //   const result = await getChallenge(params, 'https://api.example.com')
  //   expect(result).toEqual(mockError)
  // })
})

describe('verifySignature', () => {
  it('should create and submit a form with the correct payload', () => {
    if (typeof document === 'undefined') {
      throw new Error('Test must be run in a jsdom environment')
    }
    document.body.innerHTML = ''

    const signedTx = 'test-signed-transaction'
    const baseUrl = 'https://api.example.com'

    verifySignature(signedTx, baseUrl)

    const form = document.querySelector('form')
    expect(form).not.toBeNull()
    expect(form?.method.toLowerCase()).toBe('post')
    expect(form?.action).toBe(`${baseUrl}/oauth/verify-signature`)

    const input = form?.querySelector('input[name="payload"]')
    expect(input).not.toBeNull()
    expect(input?.getAttribute('value')).toBe(signedTx)
  })
})
