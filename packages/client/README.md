# Symbol Sign On

SymbolブロックチェーンのデジタルDSA署名を使用したOAuth2認証システム

## 機能

- Symbol署名を使用した認証
- OAuth2ライクなフロー（認可コード → アクセストークン）
- JWTの代わりにUUIDベースのトークン
- MongoDB でのセッション管理
- TTLによる自動的な期限切れ処理

## セットアップ

### 前提条件

- Node.js 18+
- MongoDB
- TypeScript

### プロジェクト構成

```
src/
├── index.ts          # メインエントリーポイント
├── routes/
│   └── auth.ts       # 認証関連のAPI ルート
├── services/
│   └── signature.ts  # Symbol署名検証サービス
├── db/
│   └── database.ts   # MongoDB接続管理
├── types/
│   └── auth.ts       # TypeScript型定義
└── utils/
    └── logger.ts     # ログ設定
```

### インストール

```bash
npm install
```

### 環境変数設定

`.env` ファイルを編集：

```env
MONGODB_URI=mongodb://localhost:27017/symbol-oauth
SYMBOL_NETWORK_TYPE=testnet

# レコード有効期限
CHALLENGE_EXPIRATION=5m
AUTHCODE_EXPIRATION=2m
REFRESH_TOKEN_EXPIRATION=30d
ACCESS_TOKEN_EXPIRATION=15m

# CORS設定
CORS_ORIGIN=http://localhost:3000
CORS_ORIGINS_CACHE_TTL=5m

# ログ設定
LOG_RETENTION_DAYS=14
LOG_LEVEL=info
LOG_DIR=logs
PORT=3000
```

### 開発サーバー起動

```bash
npm run dev
```

### ビルドと本番実行

```bash
npm run build
npm start
```

## API エンドポイント

### 1. 認証開始（チャレンジ生成）

```
GET /oauth/authorize?state=optional_state
```

**レスポンス:**
```json
{
  "challenge": "uuid-v4-string",
  "state": "optional_state"
}
```

### 2. 署名検証

```
POST /oauth/verify-signature
```

**リクエストボディ:**
```json
{
  "challenge": "前のステップで取得したチャレンジ",
  "signature": "Symbol署名（16進数）",
  "publicKey": "公開鍵（16進数、64文字）",
  "address": "Symbolアドレス"
}
```

**レスポンス:**
```json
{
  "code": "認可コード（uuid-v4）"
}
```

### 3. アクセストークン取得

```
POST /oauth/token
```

**リクエストボディ:**
```json
{
  "code": "前のステップで取得した認可コード"
}
```

**レスポンス:**
```json
{
  "accessToken": "アクセストークン（uuid-v4）",
  "address": "認証されたSymbolアドレス"
}
```

### 4. ユーザー情報取得

```
GET /oauth/userinfo
Authorization: Bearer <access_token>
```

**レスポンス:**
```json
{
  "address": "認証されたSymbolアドレス"
}
```

### 5. ヘルスチェック

```
GET /health
```

## 認証フロー

1. クライアントが `/oauth/authorize` にアクセスしてチャレンジを取得
2. Symbol Walletでチャレンジに署名
3. `/oauth/verify-signature` で署名を検証し、認可コードを取得
4. `/oauth/token` で認可コードをアクセストークンに交換
5. `/oauth/userinfo` でユーザー情報を取得（認証が必要）

## 注意事項

- 現在の署名検証は簡易実装です
- 本番環境では、Symbol SDK v3を使用した正しい署名検証を実装してください
- MongoDB のセキュリティ設定を適切に行ってください
- HTTPS を使用することを強く推奨します

## 環境変数説明

### 基本設定
- `CORS_ORIGIN`: 許可するベースオリジン（必須）
- `CORS_ORIGINS_CACHE_TTL`: CORS許可オリジンのキャッシュ時間（例: `5m`, `1h`, `30s`）
- `PORT`: サーバーポート（デフォルト: 3000）
- `MONGODB_URI`: MongoDB接続URI（必須）

### 有効期限設定
- `CHALLENGE_EXPIRATION`: チャレンジの有効期限（デフォルト: 5m）
- `AUTHCODE_EXPIRATION`: 認可コードの有効期限（デフォルト: 2m）
- `ACCESS_TOKEN_EXPIRATION`: アクセストークンの有効期限（デフォルト: 15m）
- `REFRESH_TOKEN_EXPIRATION`: リフレッシュトークンの有効期限（デフォルト: 30d）

### Symbol設定
- `SYMBOL_NETWORK_TYPE`: Symbolネットワークタイプ（`testnet` または `mainnet`）

### ログ設定
- `LOG_LEVEL`: ログレベル（`debug`, `info`, `warn`, `error`）
- `LOG_FILE_LEVEL`: ファイル出力ログレベル
- `LOG_CONSOLE_LEVEL`: コンソール出力ログレベル
- `LOG_RETENTION_DAYS`: ログファイルの保持日数

## 開発メモ

- チャレンジ: 5分で失効
- 認可コード: 10分で失効
- アクセストークン: 24時間で失効
