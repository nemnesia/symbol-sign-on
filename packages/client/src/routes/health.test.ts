import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import healthRouter from './health.js'

const app = express()
app.use('/health', healthRouter)

describe('ヘルスチェックルート', () => {
  it('GET /health はステータスとヘルス情報を返すべき', async () => {
    vi.doMock('../db/mongo.js', () => ({
      getDb: () => ({
        admin: () => ({
          ping: () => {
            return Promise.resolve()
          },
        }),
      }),
    }))

    const res = await request(app).get('/health')

    expect([200, 503]).toContain(res.statusCode)
    expect(res.body).toHaveProperty('status')
    expect(res.body).toHaveProperty('timestamp')
    expect(res.body).toHaveProperty('version')
    expect(res.body).toHaveProperty('uptime')
    expect(res.body).toHaveProperty('database')
    expect(res.body).toHaveProperty('memory')
    expect(res.body).toHaveProperty('environment')
  })

  it('GET /health はMongoが失敗した場合505を返すべき', async () => {
    // Mongoのモック: getDbがnullを返すようにする
    vi.doMock('../db/mongo.js', () => ({ getDb: () => null }))
    const res = await request(app).get('/health')
    expect(res.statusCode).toBe(505)
    expect(res.body.status).toBe('ERROR')
    expect(res.body.error).toBe('MongoDB connection is not available')
    vi.resetModules()
  })

  it('GET /health はエラー時に503を返すべき', async () => {
    vi.doMock('../db/mongo.js', () => ({
      getDb: () => ({
        admin: () => ({
          ping: () => {
            throw new Error('MongoDB ping error')
          },
        }),
      }),
    }))

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

  it('GET /health はMongoのpingが例外をスローした場合503を返すべき', async () => {
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

  it('GET /health 正常系', async () => {
    vi.doMock('../db/mongo.js', () => ({
      getDb: () => ({
        admin: () => ({
          ping: () => {
            return Promise.resolve()
          },
        }),
      }),
    }))
    vi.resetModules()
    const { default: errorHealthRouter } = await import('./health.js')
    const errorApp = express()
    errorApp.use('/health', errorHealthRouter)
    const res = await request(errorApp).get('/health')
    expect(res.statusCode).toBe(200)
    vi.doUnmock('../db/mongo.js')
    vi.resetModules()
  })
})
