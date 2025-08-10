import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3000;

// 静的ファイルの配信（現在のディレクトリとプロジェクトルートを配信）
app.use(express.static(__dirname));
app.use(express.static(join(__dirname, '..')));

// CORS ヘッダーを追加
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// ルートページでtest.htmlを配信
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'test.html'));
});

app.listen(port, () => {
  console.log(`🚀 Test server running at http://localhost:${port}`);
  console.log(`📝 Open your browser and navigate to http://localhost:${port} to test the transaction generator`);
});
