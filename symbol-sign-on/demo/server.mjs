import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// デモサーバーのポート（メインアプリとは別）
const DEMO_PORT = process.env.DEMO_PORT || 3001;

const app = express();

// 静的ファイル配信（現在のディレクトリ）
app.use(express.static(__dirname));

// ルートアクセス時にlogin-demo.htmlを表示
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'login-demo.html'));
});

// ヘルスチェック
app.get('/health', (req, res) => {
  res.json({ status: 'ok', port: DEMO_PORT });
});

// 404ハンドラー
app.use((req, res) => {
  res.status(404).send(`
    <h1>404 - Page Not Found</h1>
    <p>デモページは <a href="/">こちら</a> からアクセスしてください。</p>
  `);
});

// サーバー起動
app.listen(DEMO_PORT, () => {
  console.log(`🚀 Demo server is running on http://localhost:${DEMO_PORT}`);
  console.log(`📄 Demo page: http://localhost:${DEMO_PORT}/`);
});

// エラーハンドリング
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  process.exit(1);
});
