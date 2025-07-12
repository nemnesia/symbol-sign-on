# ローカル開発環境セットアップ

このプロジェクトをローカル環境で開発・稼働・テストするための手順書です。

## 前提条件

- Node.js 22.x以上
- npm 11.x以上
- MongoDB 7.x以上（ローカルインスタンス）
- Git

## 初期セットアップ

### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd symbol-sign-on
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. MongoDBのセットアップ

#### Option A: MongoDB Community Editionのインストール（推奨）

**Ubuntu/Debian:**
```bash
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
```

**macOS (Homebrew):**
```bash
brew tap mongodb/brew
brew install mongodb-community
```

**MongoDBサービスの起動:**
```bash
# Ubuntu/Debian
sudo systemctl start mongod
sudo systemctl enable mongod

# macOS
brew services start mongodb/brew/mongodb-community
```

#### Option B: Dockerを使用（簡易的）

```bash
# MongoDB単体をDockerで起動
docker run -d --name mongodb -p 27017:27017 mongo:7.0
```

### 4. 環境変数の設定

環境変数ファイルは既に設定済みです:
- `.env` - 開発環境用設定
- `.env.dev` - 開発環境用設定（バックアップ）

必要に応じて設定を変更してください。

## 開発

### 開発サーバーの起動

```bash
# 通常の開発サーバー
npm run dev

# ファイル監視付き開発サーバー（推奨）
npm run dev:watch
```

サーバーは http://localhost:3000 で起動します。

### ビルド

```bash
# TypeScriptをコンパイル
npm run build

# 本番モードで実行
npm start
```

## テスト

### 全テストの実行

```bash
# 全テストを実行
npm test

# 監視モードでテスト実行
npm run test:watch

# テストカバレッジを生成
npm run test:coverage

# テストUIを起動
npm run test:ui
```



## API エンドポイント

### OAuth認証フロー

1. **チャレンジ取得**
   ```
   GET /oauth/challenge
   ```

2. **署名検証**
   ```
   POST /oauth/verify
   Content-Type: application/json
   
   {
     "challengeId": "uuid",
     "signature": "hex_signature",
     "publicKey": "hex_public_key"
   }
   ```

3. **トークン取得**
   ```
   POST /oauth/token
   Content-Type: application/json
   
   {
     "grant_type": "authorization_code",
     "code": "auth_code"
   }
   ```

### ヘルスチェック

```
GET /health
```

## 開発時の便利なコマンド

```bash
# MongoDB接続状態確認
mongosh mongodb://localhost:27017/symbol_sign_on

# アプリケーションログの確認
tail -f logs/app-current.log

# 開発用データベースのリセット
mongosh mongodb://localhost:27017/symbol_sign_on --eval "db.dropDatabase()"

# TypeScriptの型チェック
npx tsc --noEmit

# コードフォーマット確認
npx prettier --check src/
```

## トラブルシューティング

### MongoDB接続エラー

```bash
# MongoDBサービスの状態確認
sudo systemctl status mongod

# MongoDBサービスの再起動
sudo systemctl restart mongod

# MongoDB接続テスト
mongosh mongodb://localhost:27017/symbol_sign_on
```

### ポート競合エラー

```bash
# 3000番ポートを使用しているプロセスを確認
lsof -i :3000

# プロセスを終了
kill -9 <PID>
```

### 依存関係のエラー

```bash
# node_modulesを再インストール
rm -rf node_modules package-lock.json
npm install

# キャッシュクリア
npm cache clean --force
```

## 開発環境の設定

### VS Code設定

推奨拡張機能:
- TypeScript Importer
- ESLint
- Prettier
- MongoDB for VS Code
- Thunder Client（APIテスト用）

### 設定ファイル

- `tsconfig.json` - TypeScript設定
- `.env` - 環境変数設定

## 本番環境との違い

- ログレベル: DEBUG（本番環境: INFO）
- MongoDBの認証: なし（本番環境: 認証あり）
- CORS設定: 緩和（本番環境: 厳格）
- SSL: 無効（本番環境: 有効）

## 次のステップ

1. Symbol SDK v3の実装
2. 実際の署名検証ロジックの実装
3. JWT認証の追加
4. レート制限の実装
5. 詳細なログ記録の実装
