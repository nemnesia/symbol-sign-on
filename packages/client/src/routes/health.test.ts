import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import healthRouter from './health.js'

const app = express()
app.use('/health', healthRouter)

describe('Health Check Route', () => {
  it('GET /health should respond with status and health info', async () => {
    const res = await request(app).get('/health')
    expect([200, 503]).toContain(res.statusCode)
    expect(res.body).toHaveProperty('status')
    expect(res.body).toHaveProperty('timestamp')
    expect(res.body).toHaveProperty('version')
    expect(res.body).toHaveProperty('uptime')
    expect(res.body).toHaveProperty('database')
    expect(res.body).toHaveProperty('redis')
    expect(res.body).toHaveProperty('memory')
    expect(res.body).toHaveProperty('environment')
  })

  it('GET /health should respond 503 if mongo fails', async () => {
    // Mongoのモック: getDbがnullを返すようにする
    vi.mock('../db/mongo.js', () => ({ getDb: () => null }))
    const res = await request(app).get('/health')
    expect(res.statusCode).toBe(503)
    vi.resetModules()
  })

  it('GET /health should respond 503 on error', async () => {
    // モジュールの読み込み時にエラーが発生するようなモックを作成
    vi.doMock('../db/mongo.js', () => {
      throw new Error('test error')
    })

    // モジュールを再読み込み
    vi.resetModules()
    const { default: errorHealthRouter } = await import('./health.js')
    const errorApp = express()
    errorApp.use('/health', errorHealthRouter)

    const res = await request(errorApp).get('/health')
    expect(res.statusCode).toBe(503)

    // モックをリセット
    vi.doUnmock('../db/mongo.js')
    vi.resetModules()
  }, 10000)

  it('GET /health should respond 503 if mongo ping throws', async () => {
    // getDbは正常だがpingで例外
    vi.doMock('../db/mongo.js', () => ({
      getDb: () => ({
        admin: () => ({
          ping: () => {
            throw new Error('mongo ping error')
          },
        }),
      }),
    }))
    vi.resetModules()
    const { default: errorHealthRouter } = await import('./health.js')
    const errorApp = express()
    errorApp.use('/health', errorHealthRouter)
    const res = await request(errorApp).get('/health')
    expect(res.statusCode).toBe(503)
    vi.doUnmock('../db/mongo.js')
    vi.resetModules()
  })
})
