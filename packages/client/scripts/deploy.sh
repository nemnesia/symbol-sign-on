#!/bin/bash

# 本番環境用のデプロイスクリプト

set -e

COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env.prod"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# 色付きの出力
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

echo_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo_debug() {
    echo -e "${BLUE}[DEBUG]${NC} $1"
}

# プロジェクトディレクトリに移動
cd "$PROJECT_DIR"

# 環境変数ファイルの確認
check_env_file() {
    if [ ! -f "$ENV_FILE" ]; then
        echo_error "環境変数ファイル $ENV_FILE が見つかりません"
        echo_info "サンプルファイルからコピーしてください:"
        echo_info "cp .env.prod.sample .env.prod"
        echo_info "その後、適切な値を設定してください"
        exit 1
    fi
    
    # 重要な環境変数の確認
    source "$ENV_FILE"
    if [ "$MONGODB_ROOT_PASSWORD" = "your_secure_password_here_change_this" ]; then
        echo_error "MongoDBのパスワードがデフォルトのままです"
        echo_info "$ENV_FILE でパスワードを変更してください"
        exit 1
    fi
}

# 必要なディレクトリの作成
create_directories() {
    echo_info "必要なディレクトリを作成中..."
    mkdir -p logs/nginx
    mkdir -p backups
    mkdir -p ssl
    mkdir -p data/mongodb
    mkdir -p nginx/html
    
    # パーミッションの設定
    chmod 755 logs backups ssl data
    chmod +x scripts/backup.sh
}

case "$1" in
    "build")
        check_env_file
        create_directories
        echo_info "イメージをビルド中..."
        docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE build --no-cache
        echo_info "ビルド完了"
        ;;
    "start")
        check_env_file
        create_directories
        echo_info "本番環境を起動中..."
        docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d
        echo_info "起動完了しました"
        echo_info "サービス確認中..."
        sleep 10
        docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE ps
        echo_info "ヘルスチェック: http://localhost/health"
        ;;
    "stop")
        echo_info "本番環境を停止中..."
        docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE down
        echo_info "停止完了しました"
        ;;
    "restart")
        echo_info "本番環境を再起動中..."
        docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE down
        docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d
        echo_info "再起動完了しました"
        ;;
    "logs")
        echo_info "ログを表示中..."
        docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE logs -f
        ;;
    "status")
        echo_info "サービス状態:"
        docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE ps
        echo_info "ヘルスチェック:"
        docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE exec app curl -f http://localhost:4510/health || echo_warn "アプリケーションが応答していません"
        ;;
    "backup")
        check_env_file
        echo_info "MongoDBのバックアップを作成中..."
        source "$ENV_FILE"
        BACKUP_FILE="backups/mongodb_backup_$(date +%Y%m%d_%H%M%S).gz"
        docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE exec -T mongodb mongodump \
            --authenticationDatabase admin \
            -u "${MONGODB_ROOT_USERNAME}" \
            -p "${MONGODB_ROOT_PASSWORD}" \
            --db "${MONGODB_DATABASE}" \
            --archive --gzip > "$BACKUP_FILE"
        echo_info "バックアップ完了: $BACKUP_FILE"
        ls -lh "$BACKUP_FILE"
        ;;
    "restore")
        check_env_file
        if [ -z "$2" ]; then
            echo_error "バックアップファイルを指定してください"
            echo_info "使用方法: $0 restore backups/mongodb_backup_YYYYMMDD_HHMMSS.gz"
            exit 1
        fi
        if [ ! -f "$2" ]; then
            echo_error "バックアップファイルが見つかりません: $2"
            exit 1
        fi
        echo_warn "データベースを復元します。既存データは上書きされます。"
        read -p "続行しますか？ (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo_info "MongoDBを復元中..."
            source "$ENV_FILE"
            docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE exec -T mongodb mongorestore \
                --authenticationDatabase admin \
                -u "${MONGODB_ROOT_USERNAME}" \
                -p "${MONGODB_ROOT_PASSWORD}" \
                --db "${MONGODB_DATABASE}" \
                --archive --gzip --drop < "$2"
            echo_info "復元完了しました"
        else
            echo_info "復元をキャンセルしました"
        fi
        ;;
    "update")
        check_env_file
        echo_info "本番環境を更新中..."
        docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE pull
        docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE build --no-cache
        docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d
        echo_info "更新完了しました"
        ;;
    "ssl-setup")
        check_env_file
        source "$ENV_FILE"
        echo_info "SSL証明書のセットアップを開始します..."
        echo_warn "事前にドメインのDNSレコードを設定してください"
        
        DOMAIN=${SSL_DOMAIN:-"localhost"}
        EMAIL=${SSL_EMAIL:-"admin@localhost"}
        
        if [ "$DOMAIN" = "localhost" ]; then
            read -p "ドメイン名を入力してください: " domain
            if [ -z "$domain" ]; then
                echo_error "ドメイン名が入力されていません"
                exit 1
            fi
            DOMAIN=$domain
        fi
        
        # Let's Encrypt用の設定
        echo_info "Let's Encryptで証明書を取得中..."
        docker run --rm -v ${PWD}/ssl:/etc/letsencrypt -v ${PWD}/nginx/html:/var/www/certbot \
            certbot/certbot certonly --webroot --webroot-path=/var/www/certbot \
            --email "$EMAIL" --agree-tos --no-eff-email -d "$DOMAIN"
        
        echo_info "SSL証明書の設定が完了しました"
        echo_warn "nginx/conf.d/default.conf のHTTPS設定のコメントを外して再起動してください"
        ;;
    "security-check")
        check_env_file
        echo_info "セキュリティチェックを実行中..."
        
        # パスワードの強度チェック
        source "$ENV_FILE"
        if [ ${#MONGODB_ROOT_PASSWORD} -lt 12 ]; then
            echo_warn "MongoDBのパスワードが短すぎます（12文字以上推奨）"
        fi
        
        # ファイル権限チェック
        echo_info "ファイル権限をチェック中..."
        if [ -f ".env.prod" ]; then
            PERM=$(stat -c%a .env.prod)
            if [ "$PERM" != "600" ]; then
                echo_warn ".env.prod のファイル権限を変更します (600)"
                chmod 600 .env.prod
            fi
        fi
        
        # Dockerイメージの脆弱性チェック
        echo_info "Dockerイメージの脆弱性をチェック中..."
        if command -v docker &> /dev/null; then
            docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
                -v ${PWD}:/app anchore/syft:latest /app -o json | \
                docker run --rm -i anchore/grype:latest
        fi
        
        echo_info "セキュリティチェック完了"
        ;;
    "monitor")
        check_env_file
        echo_info "システム監視情報を表示中..."
        
        # リソース使用量
        echo_info "--- コンテナリソース使用量 ---"
        docker stats --no-stream $(docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE ps -q)
        
        # ログサイズ
        echo_info "--- ログサイズ ---"
        du -sh logs/
        
        # データベースサイズ
        echo_info "--- データベースサイズ ---"
        du -sh data/mongodb/
        
        # バックアップサイズ
        echo_info "--- バックアップサイズ ---"
        du -sh backups/
        
        # 接続テスト
        echo_info "--- 接続テスト ---"
        if curl -f http://localhost/health &>/dev/null; then
            echo_info "✓ アプリケーションは正常に動作しています"
        else
            echo_error "✗ アプリケーションが応答していません"
        fi
        ;;
    "clean")
        echo_warn "未使用のDockerリソースを削除します"
        read -p "続行しますか？ (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            docker system prune -af --volumes
            echo_info "クリーンアップ完了しました"
        fi
        ;;
    *)
        echo "Usage: $0 {build|start|stop|restart|logs|status|backup|restore|update|ssl-setup|security-check|monitor|clean}"
        echo ""
        echo "Commands:"
        echo "  build          - イメージをビルド"
        echo "  start          - 本番環境を起動"
        echo "  stop           - 本番環境を停止"
        echo "  restart        - 本番環境を再起動"
        echo "  logs           - ログを表示"
        echo "  status         - サービス状態を確認"
        echo "  backup         - MongoDBのバックアップを作成"
        echo "  restore        - MongoDBを復元"
        echo "  update         - 本番環境を更新"
        echo "  ssl-setup      - SSL証明書のセットアップ"
        echo "  security-check - セキュリティチェック"
        echo "  monitor        - システム監視情報を表示"
        echo "  clean          - 未使用リソースを削除"
        exit 1
        ;;
esac
