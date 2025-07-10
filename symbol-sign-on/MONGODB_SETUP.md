# MongoDB Docker Compose Setup

このプロジェクトではMongoDBをDocker Composeで起動してテストに使用します。

## 使用方法

### 1. MongoDBの起動
```bash
# バックグラウンドで起動
docker-compose -f docker-compose.dev.yml up -d

# ログを確認
docker-compose -f docker-compose.dev.yml logs -f
```

### 2. MongoDBの停止
```bash
# コンテナを停止
docker-compose -f docker-compose.dev.yml down

# データも削除する場合
docker-compose -f docker-compose.dev.yml down -v
```

### 3. MongoDB接続確認
```bash
# MongoDBコンテナに接続
docker exec -it symbol-sign-on-mongodb mongosh -u admin -p password

# データベース確認
use symbol_sign_auth
show collections
```

## 設定情報

### MongoDB
- **ポート**: 27017
- **ユーザー**: admin
- **パスワード**: password
- **データベース**: symbol_sign_auth

### Mongo Express (管理UI)
- **URL**: http://localhost:8081
- **認証**: なし（開発用）

## 環境変数設定

`.env`ファイルに以下を設定してください：

```env
# MongoDB設定
MONGODB_URI=mongodb://admin:password@localhost:27017/symbol_sign_auth?authSource=admin
```

## コレクション構成

自動的に以下のコレクションが作成されます：

1. **auth_codes**
   - 認証コード管理
   - インデックス: code (unique), expiresAt (TTL)

2. **refresh_tokens**
   - リフレッシュトークン管理
   - インデックス: token (unique), expiresAt (TTL)

3. **user_sessions**
   - ユーザーセッション管理
   - インデックス: sessionId (unique), expiresAt (TTL)

## トラブルシューティング

### ポートが使用中の場合
```bash
# ポート27017を使用しているプロセスを確認
sudo lsof -i :27017

# 必要に応じてプロセスを終了
sudo kill -9 <PID>
```

### データをリセットしたい場合
```bash
# コンテナとボリュームを削除
docker-compose -f docker-compose.dev.yml down -v

# 再起動
docker-compose -f docker-compose.dev.yml up -d
```
