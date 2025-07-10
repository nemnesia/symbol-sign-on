import dotenv from 'dotenv';

// 最初に環境変数を読み込む
dotenv.config();

import express from 'express';
import cors from 'cors';
import { connectToMongo } from './db/database.js';
import oauthRoutes from './routes/oauth.js';
import logger from './utils/logger.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ミドルウェア設定
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ログミドルウェア
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

// ルート設定
app.use('/oauth', oauthRoutes);

// Chrome DevTools用のエンドポイント（404警告を回避）
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
  res.status(404).json({ error: 'Not implemented' });
});

// ヘルスチェックエンドポイント
app.get('/health', async (req, res) => {
  try {
    // MongoDB接続状態を確認
    const dbStatus = await checkDatabaseConnection();
    
    const healthStatus = {
      status: dbStatus ? 'OK' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime(),
      database: dbStatus ? 'connected' : 'disconnected',
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development'
    };
    
    const statusCode = dbStatus ? 200 : 503;
    res.status(statusCode).json(healthStatus);
  } catch (error) {
    logger.error(`Health check failed: ${(error as Error).message}`);
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
});

// データベース接続確認用のヘルパー関数
async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const { getDb } = await import('./db/database.js');
    const db = getDb();
    if (!db) return false;
    
    // ping コマンドでDB接続を確認
    await db.admin().ping();
    return true;
  } catch {
    return false;
  }
}

// 404ハンドラー
app.use('*', (req, res) => {
  // Chrome DevToolsや開発者ツール関連のリクエストはログレベルを下げる
  const isDevToolsRequest = req.originalUrl.includes('/.well-known/') || 
                           req.originalUrl.includes('/favicon.ico') ||
                           req.originalUrl.includes('/chrome-extension/');
  
  if (isDevToolsRequest) {
    logger.debug(`404 - ${req.method} ${req.originalUrl}`);
  } else {
    logger.warn(`404 - ${req.method} ${req.originalUrl}`);
  }
  
  res.status(404).json({ error: 'Endpoint not found' });
});

// エラーハンドラー
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(`Error: ${err.message}`);
  res.status(500).json({ error: 'Internal server error' });
});

// サーバー起動
async function startServer() {
  try {
    // MongoDB接続（オプショナル）
    try {
      await connectToMongo();
      logger.info('Database connected');
    } catch (dbError) {
      logger.warn(`Database connection failed: ${(dbError as Error).message}`);
      logger.warn('Server will start without database');
    }

    // サーバー起動
    app.listen(PORT, () => {
      logger.info(`Server running on http://localhost:${PORT}`);
      logger.info(`API endpoints:`);
      logger.info(`  GET  /health - Health check`);
      logger.info(`  GET  /oauth/authorize - Start authentication`);
      logger.info(`  POST /oauth/verify-signature - Verify Symbol signature`);
      logger.info(`  POST /oauth/token - Exchange code for token`);
      logger.info(`  GET  /oauth/userinfo - Get user info`);
      logger.info(`  GET  /demo.html - Demo page`);
    });
  } catch (error) {
    logger.error(`Failed to start server: ${(error as Error).message}`);
    process.exit(1);
  }
}

// 未処理のプロミス拒否をキャッチ
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// 未処理の例外をキャッチ
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// グレースフルシャットダウン
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  try {
    const { closeConnection } = await import('./db/database.js');
    await closeConnection();
  } catch (error) {
    logger.error(`Error during shutdown: ${(error as Error).message}`);
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  try {
    const { closeConnection } = await import('./db/database.js');
    await closeConnection();
  } catch (error) {
    logger.error(`Error during shutdown: ${(error as Error).message}`);
  }
  process.exit(0);
});

startServer().catch((error) => {
  logger.error(`Failed to start application: ${error.message}`);
  process.exit(1);
});
