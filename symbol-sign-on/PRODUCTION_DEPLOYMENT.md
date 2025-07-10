# 本番環境デプロイガイド

## 概要

このガイドでは、Symbol Sign Auth APIを本番環境にDockerを使ってデプロイする方法を説明します。

## 前提条件

- Docker Engine 20.10+
- Docker Compose 2.0+
- Git
- 少なくとも2GB以上のRAMを持つLinuxサーバー
- ドメイン名（SSL証明書を使用する場合）

## セットアップ手順

### 1. プロジェクトのクローン

```bash
git clone <repository-url>
cd symbol-sign-on
```

### 2. 環境変数の設定

```bash
# サンプルファイルをコピー
cp .env.prod.sample .env.prod

# 環境変数を編集
nano .env.prod
```

**重要:** 以下の値を必ず変更してください：
- `MONGODB_ROOT_PASSWORD`: 強力なパスワード（12文字以上）
- `JWT_SECRET`: ランダムな文字列
- `SYMBOL_PRIVATE_KEY`: Symbol秘密鍵
- `SYMBOL_PUBLIC_KEY`: Symbol公開鍵
- `ALLOWED_ORIGINS`: 許可するドメイン

### 3. デプロイスクリプトの実行権限を設定

```bash
chmod +x scripts/deploy.sh
chmod +x scripts/backup.sh
```

### 4. 本番環境のビルドと起動

```bash
# イメージをビルド
./scripts/deploy.sh build

# 本番環境を起動
./scripts/deploy.sh start
```

### 5. 動作確認

```bash
# サービス状態を確認
./scripts/deploy.sh status

# ヘルスチェック
curl http://localhost/health
```

## SSL証明書の設定

### Let's Encryptを使用する場合

```bash
# .env.prod で SSL_DOMAIN と SSL_EMAIL を設定
./scripts/deploy.sh ssl-setup

# HTTPSを有効化（nginx設定のコメントアウト解除）
# nginx/conf.d/default.conf を編集後、再起動
./scripts/deploy.sh restart
```

### 独自の証明書を使用する場合

```bash
# ssl/ ディレクトリに証明書を配置
cp your-cert.pem ssl/cert.pem
cp your-key.pem ssl/key.pem

# nginx設定のHTTPS部分を有効化
# nginx/conf.d/default.conf を編集後、再起動
./scripts/deploy.sh restart
```

## 運用コマンド

### 基本コマンド

```bash
# 起動
./scripts/deploy.sh start

# 停止
./scripts/deploy.sh stop

# 再起動
./scripts/deploy.sh restart

# ログ確認
./scripts/deploy.sh logs

# システム状態確認
./scripts/deploy.sh status
```

### バックアップとリストア

```bash
# バックアップ作成
./scripts/deploy.sh backup

# リストア
./scripts/deploy.sh restore backups/mongodb_backup_20250106_120000.gz
```

### 監視とメンテナンス

```bash
# システム監視
./scripts/deploy.sh monitor

# セキュリティチェック
./scripts/deploy.sh security-check

# 未使用リソースの削除
./scripts/deploy.sh clean
```

## セキュリティ設定

### ファイアウォール設定

```bash
# UFWの場合
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 27017/tcp  # MongoDBポートをブロック
sudo ufw enable
```

### 定期的なセキュリティアップデート

```bash
# システムアップデート
sudo apt update && sudo apt upgrade -y

# Dockerイメージアップデート
./scripts/deploy.sh update
```

## 監視とログ

### ログの場所

- アプリケーションログ: `logs/app-current.log`
- Nginxログ: `logs/nginx/access.log`, `logs/nginx/error.log`
- 監査ログ: `logs/audit.json`

### ログの管理

```bash
# ログローテーション設定確認
ls -la logs/

# ログサイズ確認
du -sh logs/
```

## パフォーマンス最適化

### リソース制限

Docker Composeファイルでリソース制限を設定済み：
- MongoDB: 512MB RAM, 0.5 CPU
- Application: 512MB RAM, 0.5 CPU  
- Nginx: 128MB RAM, 0.25 CPU

### 監視メトリクス

```bash
# リソース使用量の確認
docker stats

# システム監視
./scripts/deploy.sh monitor
```

## トラブルシューティング

### よくある問題

1. **コンテナが起動しない**
   ```bash
   # ログを確認
   ./scripts/deploy.sh logs
   
   # 環境変数を確認
   cat .env.prod
   ```

2. **データベース接続エラー**
   ```bash
   # MongoDB コンテナの状態を確認
   docker-compose ps mongodb
   
   # MongoDB ログを確認
   docker-compose logs mongodb
   ```

3. **SSL証明書エラー**
   ```bash
   # 証明書の存在を確認
   ls -la ssl/
   
   # nginx設定を確認
   nginx -t
   ```

### ログレベルの調整

```bash
# .env.prod でログレベルを調整
LOG_LEVEL=debug           # 開発時
LOG_LEVEL=info           # 本番時（推奨）
LOG_LEVEL=warn           # 軽量運用時
```

## 定期メンテナンス

### 週次メンテナンス

```bash
# システムアップデート
sudo apt update && sudo apt upgrade -y

# バックアップ確認
ls -la backups/

# ログローテーション
./scripts/deploy.sh logs > /dev/null 2>&1
```

### 月次メンテナンス

```bash
# セキュリティチェック
./scripts/deploy.sh security-check

# 不要なリソースの削除
./scripts/deploy.sh clean

# システム監視
./scripts/deploy.sh monitor
```

## 緊急時の対応

### サービス停止時

```bash
# 即座に再起動
./scripts/deploy.sh restart

# 問題の調査
./scripts/deploy.sh logs
./scripts/deploy.sh status
```

### データ復旧

```bash
# 最新のバックアップを確認
ls -la backups/

# データベースを復旧
./scripts/deploy.sh restore backups/mongodb_backup_YYYYMMDD_HHMMSS.gz
```

## サポート

問題が発生した場合は、以下の情報と共にサポートに連絡してください：

1. エラーメッセージ
2. ログファイル (`logs/app-current.log`)
3. システム情報 (`./scripts/deploy.sh status`)
4. 環境変数設定（パスワード等は除く）
