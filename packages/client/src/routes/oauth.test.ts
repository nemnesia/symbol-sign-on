import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import oauthRouter from './oauth.js'

// モック設定
vi.mock('../db/mongo.js', () => ({
  Clients: { findOne: vi.fn() },
  insertChallenge: vi.fn(),
  findChallenge: vi.fn(),
  deleteChallenge: vi.fn(),
  insertAuthCode: vi.fn(),
  findAuthCode: vi.fn(),
  updateAuthCode: vi.fn(),
  insertRefreshToken: vi.fn(),
  findRefreshToken: vi.fn(),
  deleteRefreshToken: vi.fn(),
  insertAccessTokenBlacklist: vi.fn(),
  findAccessTokenBlacklist: vi.fn(),
}))
vi.mock('../utils/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}))

const app = express()
app.use(express.json())
app.use('/oauth', oauthRouter)

describe('OAuth2 Routes', () => {
  it('GET /oauth/authorize should respond', async () => {
    const res = await request(app).get('/oauth/authorize')
    expect([200, 400, 401, 302]).toContain(res.statusCode)
  })

  it('POST /oauth/verify-signature should respond with 400 when no payload is provided', async () => {
    const res = await request(app).post('/oauth/verify-signature').send({})
    expect(res.statusCode).toBe(400)
  })

  it('POST /oauth/verify-signature should respond with 400 when payload is incomplete', async () => {
    const res = await request(app).post('/oauth/verify-signature').send({
      signature: 'test-signature',
      // stateは欠落
    })
    expect(res.statusCode).toBe(400)
  })

  it('POST /oauth/token should respond with 400 when no payload is provided', async () => {
    const res = await request(app).post('/oauth/token').send({})
    expect(res.statusCode).toBe(400)
  })

  it('POST /oauth/token should respond with 400 when grant_type is missing', async () => {
    const res = await request(app).post('/oauth/token').send({
      code: 'test-code',
      redirect_uri: 'http://localhost/callback',
    })
    expect(res.statusCode).toBe(400)
  })

  it('POST /oauth/token should respond with 400 when code is missing', async () => {
    const res = await request(app).post('/oauth/token').send({
      grant_type: 'authorization_code',
      redirect_uri: 'http://localhost/callback',
    })
    expect(res.statusCode).toBe(400)
  })

  it('GET /oauth/userinfo should respond with 401 when no authorization header is provided', async () => {
    const res = await request(app).get('/oauth/userinfo')
    expect(res.statusCode).toBe(401)
  })

  it('GET /oauth/userinfo should respond with 401 when invalid authorization header is provided', async () => {
    const res = await request(app).get('/oauth/userinfo').set('Authorization', 'Invalid token')
    expect(res.statusCode).toBe(401)
  })

  it('POST /oauth/logout should respond with 400 when no payload is provided', async () => {
    const res = await request(app).post('/oauth/logout').send({})
    expect(res.statusCode).toBe(400)
  })

  it('POST /oauth/logout should respond with 400 when token is missing', async () => {
    const res = await request(app).post('/oauth/logout').send({
      token_type_hint: 'access_token',
    })
    expect(res.statusCode).toBe(400)
  })
})
