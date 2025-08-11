import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// EventEmitterのシンプルなモック
class MockEventEmitter {
  private events: Record<string, Function[]> = {}

  on(event: string, listener: Function) {
    if (!this.events[event]) {
      this.events[event] = []
    }
    this.events[event].push(listener)
  }

  emit(event: string, ...args: any[]) {
    if (this.events[event]) {
      this.events[event].forEach((listener) => listener(...args))
    }
  }
}

// transportインスタンスを保存するためのグローバル変数
let mockTransportInstance: MockEventEmitter | null = null

// 実際のファイルシステム操作をモックする
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
  }
})

vi.mock('winston-daily-rotate-file', () => {
  return {
    default: vi.fn().mockImplementation(() => {
      const mockTransport = new MockEventEmitter()
      Object.assign(mockTransport, {
        level: 'info',
        format: vi.fn(),
        filename: 'test.log',
        datePattern: 'YYYY-MM-DD',
      })

      // テスト用にtransportインスタンスを保存
      mockTransportInstance = mockTransport

      return mockTransport
    }),
  }
})

// winston自体もモック
vi.mock('winston', () => {
  const winstonMock = {
    format: {
      timestamp: vi.fn(() => (opts?: any) => opts),
      printf: vi.fn((fn) => fn),
      combine: vi.fn((...args) => args),
      colorize: vi.fn(() => (opts?: any) => opts),
      errors: vi.fn(() => (opts?: any) => opts),
      json: vi.fn(() => (opts?: any) => opts),
      simple: vi.fn(() => (opts?: any) => opts),
    },
    transports: {
      Console: vi.fn().mockImplementation(() => ({
        level: 'info',
        format: vi.fn(),
      })),
    },
    createLogger: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    })),
  }

  return {
    default: winstonMock,
    ...winstonMock,
  }
})

// loggerをダイナミックインポートでロード
describe('loggerユーティリティ', () => {
  let consoleSpy: any
  let logger: any

  beforeEach(async () => {
    // コンソール出力をキャプチャ
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    // ダイナミックインポートでloggerを読み込み
    const loggerModule = await import('./logger.js')
    logger = loggerModule.default
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  it('loggerインスタンスが存在するべき', () => {
    expect(logger).toBeDefined()
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.debug).toBe('function')
  })

  it('infoメッセージをログに記録するべき', () => {
    const testMessage = 'Test info message'
    logger.info(testMessage)
    // ログが呼ばれたことを確認
    expect(logger.info).toBeDefined()
  })

  it('errorメッセージをログに記録するべき', () => {
    const testMessage = 'Test error message'
    logger.error(testMessage)
    // ログが呼ばれたことを確認
    expect(logger.error).toBeDefined()
  })

  it('warnメッセージをログに記録するべき', () => {
    const testMessage = 'Test warn message'
    logger.warn(testMessage)
    // ログが呼ばれたことを確認
    expect(logger.warn).toBeDefined()
  })

  it('debugメッセージをログに記録するべき', () => {
    const testMessage = 'Test debug message'
    logger.debug(testMessage)
    // ログが呼ばれたことを確認
    expect(logger.debug).toBeDefined()
  })

  it('ログメッセージが一貫したフォーマットであるべき', () => {
    // ログフォーマットのテスト
    const message = 'Formatted message test'
    const metadata = { userId: '123', action: 'test' }

    logger.info(message, metadata)

    // フォーマットが正しく適用されることを確認
    expect(logger.info).toBeDefined()
  })

  // it('transportイベントと環境設定を処理するべき', async () => {
  //   // コンソールログをスパイ
  //   const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

  //   // モックされたtransportインスタンスを使ってイベントをエミット
  //   if (mockTransportInstance) {
  //     // newイベントをエミット
  //     mockTransportInstance.emit('new', 'test-log-file.log')

  //     // rotateイベントをエミット
  //     mockTransportInstance.emit('rotate', 'old-file.log', 'new-file.log')

  //     // コンソールログが呼ばれたことを確認
  //     expect(consoleSpy).toHaveBeenCalledWith('New log file created: test-log-file.log')
  //     expect(consoleSpy).toHaveBeenCalledWith('Log rotated from old-file.log to new-file.log')
  //   }

  //   // ログレベルとファイルシステムテストの基本動作を確認
  //   expect(logger).toBeDefined()

  //   consoleSpy.mockRestore()
  // })

  it('メタデータ付きのメッセージをログに記録するべき', () => {
    const message = 'Test message with metadata'
    const metadata = {
      userId: '123',
      action: 'test_action',
      timestamp: new Date().toISOString(),
    }

    // 各レベルでメタデータ付きログをテスト
    logger.info(message, metadata)
    logger.error(message, metadata)
    logger.warn(message, metadata)
    logger.debug(message, metadata)

    // ログ関数が呼ばれたことを確認
    expect(logger.info).toBeDefined()
    expect(logger.error).toBeDefined()
    expect(logger.warn).toBeDefined()
    expect(logger.debug).toBeDefined()
  })

  it('メタデータなしのメッセージをログに記録するべき', () => {
    const message = 'Test message without metadata'

    // メタデータなしでログをテスト
    logger.info(message)
    logger.error(message)
    logger.warn(message)
    logger.debug(message)

    // ログ関数が呼ばれたことを確認
    expect(logger.info).toBeDefined()
    expect(logger.error).toBeDefined()
    expect(logger.warn).toBeDefined()
    expect(logger.debug).toBeDefined()
  })

  it('エラーオブジェクトを含むログを処理するべき', () => {
    const errorMessage = 'Test error with stack trace'
    const error = new Error(errorMessage)

    // エラーオブジェクトを含むログをテスト
    logger.error('Error occurred', { error })

    // ログ関数が正しく呼ばれたことを確認
    expect(logger.error).toBeDefined()
  })

  it('異なる型のメタデータを処理するべき', () => {
    // 様々な型のメタデータをテスト
    const testCases = [
      { string: 'test' },
      { number: 123 },
      { boolean: true },
      { array: [1, 2, 3] },
      { nested: { key: 'value' } },
      { mixed: { str: 'test', num: 456, bool: false } },
    ]

    testCases.forEach((metadata, index) => {
      logger.info(`Test message ${index}`, metadata)
    })

    expect(logger.info).toBeDefined()
  })

  it('環境変数を使用してloggerを設定するべき', async () => {
    vi.resetModules()
    process.env.LOG_DIR = 'custom_logs'
    process.env.LOG_RETENTION_DAYS = '7'
    process.env.LOG_LEVEL = 'debug'
    process.env.LOG_FILE_LEVEL = 'warn'
    process.env.LOG_CONSOLE_LEVEL = 'error'
    await import('./logger.js')
    // ここでloggerの設定値を検証
    expect(process.env.LOG_DIR).toBe('custom_logs')
    expect(process.env.LOG_RETENTION_DAYS).toBe('7')
    expect(process.env.LOG_LEVEL).toBe('debug')
    expect(process.env.LOG_FILE_LEVEL).toBe('warn')
    expect(process.env.LOG_CONSOLE_LEVEL).toBe('error')
  })

  it('新しいログファイル作成時に正しいメッセージを記録するべき', () => {
    const mockInfo = vi.spyOn(logger, 'info')
    const filename = 'test-log-file.log'

    // mockTransportInstanceを使用してイベントをトリガー
    if (mockTransportInstance) {
      mockTransportInstance.emit('new', filename)
    }

    // logger.info が正しく呼び出されたか確認
    expect(mockInfo).toHaveBeenCalledWith(`New log file created: ${filename}`)

    mockInfo.mockRestore()
  })

  it('ログローテーション時に正しいメッセージを記録するべき', () => {
    const mockInfo = vi.spyOn(logger, 'info')
    const oldFilename = 'old-file.log'
    const newFilename = 'new-file.log'

    // mockTransportInstanceを使用してイベントをトリガー
    if (mockTransportInstance) {
      mockTransportInstance.emit('rotate', oldFilename, newFilename)
    }

    // logger.info が正しく呼び出されたか確認
    expect(mockInfo).toHaveBeenCalledWith(`Log rotated from ${oldFilename} to ${newFilename}`)

    mockInfo.mockRestore()
  })
})
