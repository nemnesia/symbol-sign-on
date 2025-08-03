import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import oauthRouter from './oauth.js'

const app = express()
app.use(express.json())
app.use('/oauth', oauthRouter)

describe('OAuth2 Routes', () => {
  it('GET /oauth/authorize should respond', async () => {
    const res = await request(app).get('/oauth/authorize')
    expect([200, 400, 401, 302]).toContain(res.statusCode)
  })

  it('PUT /oauth/verify-signature should respond', async () => {
    const res = await request(app).put('/oauth/verify-signature').send({})
    expect([200, 400, 401]).toContain(res.statusCode)
  })

  it('POST /oauth/token should respond', async () => {
    const res = await request(app).post('/oauth/token').send({})
    expect([200, 400, 401]).toContain(res.statusCode)
  })

  it('GET /oauth/userinfo should respond', async () => {
    const res = await request(app).get('/oauth/userinfo')
    expect([200, 400, 401]).toContain(res.statusCode)
  })

  it('POST /oauth/logout should respond', async () => {
    const res = await request(app).post('/oauth/logout').send({})
    expect([200, 400, 401]).toContain(res.statusCode)
  })
})
