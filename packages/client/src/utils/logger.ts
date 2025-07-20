import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'

// 環境変数を確実に読み込む
dotenv.config()

const logDir = process.env.LOG_DIR || 'logs'
const retentionDays = parseInt(process.env.LOG_RETENTION_DAYS || '14', 10)
const level = process.env.LOG_LEVEL || 'info'
const fileLevel = process.env.LOG_FILE_LEVEL || level
const consoleLevel = process.env.LOG_CONSOLE_LEVEL || level

// ログディレクトリが存在しない場合は作成
const logDirPath = path.resolve(process.cwd(), logDir)
if (!fs.existsSync(logDirPath)) {
  fs.mkdirSync(logDirPath, { recursive: true })
}

const transport = new DailyRotateFile({
  dirname: logDirPath,
  filename: 'app-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: `${retentionDays}d`,
  auditFile: path.join(logDirPath, 'audit.json'),
  createSymlink: true,
  symlinkName: 'app-current.log',
  level: fileLevel,
})

// ファイル作成時のイベントハンドラ
transport.on('new', (filename) => {
  console.log(`New log file created: ${filename}`)
})

// ローテーション時のイベントハンドラ
transport.on('rotate', (oldFilename, newFilename) => {
  console.log(`Log rotated from ${oldFilename} to ${newFilename}`)
})

const logger = winston.createLogger({
  level,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY/MM/DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      // ログレベルを5文字で統一（右詰め）
      const paddedLevel = level.toUpperCase().padEnd(5, ' ')
      const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : ''
      return `${timestamp} [${paddedLevel}] ${message}${metaStr}`
    }),
  ),
  transports: [
    transport,
    new winston.transports.Console({
      level: consoleLevel,
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY/MM/DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          // ログレベルを5文字で統一（右詰め）
          const paddedLevel = level.toUpperCase().padEnd(5, ' ')
          const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : ''
          return `${timestamp} [${paddedLevel}] ${message}${metaStr}`
        }),
        winston.format.colorize({ all: true }),
      ),
    }),
  ],
})

// 起動時にログディレクトリとファイルの情報を出力
logger.info(`Log directory: ${logDirPath}`)
logger.info(`Log retention: ${retentionDays} days`)
logger.info(`Log level: ${level}`)
logger.info(`File log level: ${fileLevel}`)
logger.info(`Console log level: ${consoleLevel}`)

export default logger
