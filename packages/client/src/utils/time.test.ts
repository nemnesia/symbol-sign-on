import { describe, expect, it } from 'vitest'
import { parseTimeToSeconds } from './time.js'

describe('parseTimeToSeconds', () => {
  it('日単位を変換できる', () => {
    expect(parseTimeToSeconds('1d')).toBe(86400)
    expect(parseTimeToSeconds('2d')).toBe(172800)
  })

  it('時間単位を変換できる', () => {
    expect(parseTimeToSeconds('1h')).toBe(3600)
    expect(parseTimeToSeconds('3h')).toBe(10800)
  })

  it('分単位を変換できる', () => {
    expect(parseTimeToSeconds('30m')).toBe(1800)
    expect(parseTimeToSeconds('5m')).toBe(300)
  })

  it('秒単位を変換できる', () => {
    expect(parseTimeToSeconds('10s')).toBe(10)
    expect(parseTimeToSeconds('0s')).toBe(0)
  })

  it('複合指定を変換できる', () => {
    expect(parseTimeToSeconds('1d2h30m10s')).toBe(86400 + 7200 + 1800 + 10)
    expect(parseTimeToSeconds('2h15m')).toBe(7200 + 900)
  })

  it('数値のみはそのまま秒数', () => {
    expect(parseTimeToSeconds('120')).toBe(120)
    expect(parseTimeToSeconds('3600')).toBe(3600)
  })

  it('空文字はデフォルト値', () => {
    expect(parseTimeToSeconds('')).toBe(3600)
  })

  it('不正な文字列はデフォルト値', () => {
    expect(parseTimeToSeconds('abc')).toBe(3600)
    expect(parseTimeToSeconds('1x2y')).toBe(3600)
  })

  it('部分指定（例: 1h0m）は正しく変換', () => {
    expect(parseTimeToSeconds('1h0m')).toBe(3600)
    expect(parseTimeToSeconds('0d0h0m0s')).toBe(3600)
  })
})
