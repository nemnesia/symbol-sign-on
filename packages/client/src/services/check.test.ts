import express from 'express'
import { MongoNetworkError, MongoNetworkTimeoutError } from 'mongodb'
import request from 'supertest'
import { afterEach, describe, expect, it, Mock, vi } from 'vitest'
import { Clients } from '../db/mongo.js'
import { handleCheck } from './check.js'

// モック設定
vi.mock('../db/mongo.js', () => ({ Clients: { findOne: vi.fn() }, setChallenge: vi.fn() }))
vi.mock('../utils/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}))

const app = express()
app.use(express.json())
app.get('/oauth/check', handleCheck)

describe('handleCheck', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('必要なパラメータがない場合は400を返す', async () => {
    const response = await request(app).get('/oauth/check')

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: 'invalid_request',
      error_description: 'Missing required parameters: response_type, client_id, redirect_uri',
    })
  })

  it('パラメータが配列の場合は400を返す', async () => {
    const response = await request(app)
      .get('/oauth/check')
      .query({
        response_type: ['aaa', 'bbb'],
        client_id: ['123'],
        redirect_uri: ['https://example.com'],
      })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: 'invalid_request',
      error_description: 'Parameters must be single values, not arrays',
    })
  })

  it('レスポンスタイプがサポートされていない場合は400を返す', async () => {
    const response = await request(app)
      .get('/oauth/check')
      .query({ response_type: 'token', client_id: '123', redirect_uri: 'https://example.com' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: 'unsupported_response_type',
      error_description: "Only 'code' response_type is supported",
    })
  })

  it('クライアントIDが空の場合は400を返す', async () => {
    const response = await request(app)
      .get('/oauth/check')
      .query({ response_type: 'code', client_id: '', redirect_uri: 'https://example.com' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: 'invalid_request',
      error_description: 'client_id and redirect_uri cannot be empty',
    })
  })

  it('リダイレクトURLが空の場合は400を返す', async () => {
    const response = await request(app)
      .get('/oauth/check')
      .query({ response_type: 'code', client_id: '123', redirect_uri: '' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: 'invalid_request',
      error_description: 'client_id and redirect_uri cannot be empty',
    })
  })

  it('リダイレクトURLが無効な場合は400を返すこと', async () => {
    const response = await request(app)
      .get('/oauth/check')
      .query({ response_type: 'code', client_id: '123', redirect_uri: 'invalid-uri' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: 'invalid_request',
      error_description: 'redirect_uri must be a valid URL',
    })
  })

  it('本番環境でHTTPS以外のプロトコルを拒否する', async () => {
    process.env.NODE_ENV = 'production'
    const response = await request(app)
      .get('/oauth/check')
      .query({ response_type: 'code', client_id: '123', redirect_uri: 'http://example.com' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: 'invalid_request',
      error_description: 'redirect_uri must be a valid URL',
    })
  })

  it('開発環境でローカルホスト以外のHTTPプロトコルを拒否する', async () => {
    process.env.NODE_ENV = 'development'
    const response = await request(app)
      .get('/oauth/check')
      .query({ response_type: 'code', client_id: '123', redirect_uri: 'http://example.com' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: 'invalid_request',
      error_description: 'redirect_uri must be a valid URL',
    })
  })

  it('クライアントIDが見つからない場合は400を返す', async () => {
    ;(Clients.findOne as Mock).mockResolvedValue(null)

    const response = await request(app)
      .get('/oauth/check')
      .query({ response_type: 'code', client_id: '123', redirect_uri: 'https://example.com' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: 'unauthorized_client',
      error_description: 'Client ID is not registered or has no trusted URI',
    })
  })

  it('リダイレクトURLが信頼できるURIにマッチしない場合は400を返す', async () => {
    ;(Clients.findOne as Mock).mockResolvedValue({
      client_id: '123',
      trusted_redirect_uri: ['https://trusted.com'],
    })

    const response = await request(app)
      .get('/oauth/check')
      .query({ response_type: 'code', client_id: '123', redirect_uri: 'https://example.com' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: 'invalid_request',
      error_description: 'redirect_uri does not match any trusted URI',
    })
  })

  it('クライアントIDとリダイレクトURLが有効な場合は200を返す', async () => {
    ;(Clients.findOne as Mock).mockResolvedValue({
      client_id: '123',
      trusted_redirect_uri: ['https://example.com'],
      app_name: 'Test App',
    })

    const response = await request(app)
      .get('/oauth/check')
      .query({ response_type: 'code', client_id: '123', redirect_uri: 'https://example.com' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      valid: true,
      app_name: 'Test App',
    })
  })

  it('データベースエラーが発生した場合は500を返す', async () => {
    ;(Clients.findOne as Mock).mockRejectedValue(new Error('Database error'))

    const response = await request(app)
      .get('/oauth/check')
      .query({ response_type: 'code', client_id: '123', redirect_uri: 'https://example.com' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({
      error: 'server_error',
      error_description: 'An unexpected error occurred. Please try again later.',
    })
  })

  it('データベースエラーが発生した場合は500を返す(ネットワークエラー)', async () => {
    ;(Clients.findOne as Mock).mockRejectedValue(new MongoNetworkError('Database error'))

    const response = await request(app)
      .get('/oauth/check')
      .query({ response_type: 'code', client_id: '123', redirect_uri: 'https://example.com' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({
      error: 'server_error',
      error_description: 'An unexpected error occurred. Please try again later.',
    })
  })

  it('データベースエラーが発生した場合は500を返す(タイムアウト)', async () => {
    ;(Clients.findOne as Mock).mockRejectedValue(new MongoNetworkTimeoutError('Database error'))

    const response = await request(app)
      .get('/oauth/check')
      .query({ response_type: 'code', client_id: '123', redirect_uri: 'https://example.com' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({
      error: 'server_error',
      error_description: 'An unexpected error occurred. Please try again later.',
    })
  })

  it('レスポンスタイプが空の場合は400を返す', async () => {
    const response = await request(app)
      .get('/oauth/check')
      .query({ response_type: '', client_id: '123', redirect_uri: 'https://example.com' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: 'unsupported_response_type',
      error_description: "Only 'code' response_type is supported",
    })
  })
})
