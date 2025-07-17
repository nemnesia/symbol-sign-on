# Symbol Sign On Demo

このディレクトリには、Symbol Sign Onのデモページが含まれています。

## 使い方

### デモサーバーの起動

メインプロジェクトのルートディレクトリから：

```bash
npm run demo:start
```

または、このディレクトリから直接：

```bash
cd demo
node server.js
```

### アクセス

デモサーバーが起動すると、以下のURLでアクセスできます：

- **デモページ**: http://localhost:3001/
- **ヘルスチェック**: http://localhost:3001/health

### ポート設定

デフォルトポートは3001ですが、環境変数で変更できます：

```bash
DEMO_PORT=3002 npm run demo:start
```

## ファイル構成

- `login-demo.html` - Symbol Sign Onのデモページ
- `server.js` - Express.jsベースの簡易サーバー
- `README.md` - このファイル

## 注意事項

- このデモサーバーはメインアプリケーション（ポート3000）とは独立して動作します
- 静的ファイルの配信のみを行い、認証機能は含まれていません
- 開発・テスト目的でのみ使用してください
