#!/bin/bash

# MongoDB 自動バックアップスクリプト

set -e

# 環境変数の設定
MONGODB_URI="mongodb://${MONGODB_ROOT_USERNAME}:${MONGODB_ROOT_PASSWORD}@mongodb:27017/${MONGODB_DATABASE}?authSource=admin"
BACKUP_DIR="/backups"
BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-7}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="mongodb_backup_${TIMESTAMP}.gz"

# ログ関数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# バックアップ実行
log "Starting MongoDB backup..."

# バックアップディレクトリの作成
mkdir -p ${BACKUP_DIR}

# バックアップ実行
if mongodump --uri="${MONGODB_URI}" --archive="${BACKUP_DIR}/${BACKUP_FILE}" --gzip; then
    log "Backup completed successfully: ${BACKUP_FILE}"
    
    # バックアップファイルのサイズを確認
    BACKUP_SIZE=$(stat -c%s "${BACKUP_DIR}/${BACKUP_FILE}")
    log "Backup size: $(( BACKUP_SIZE / 1024 / 1024 )) MB"
    
    # 古いバックアップファイルを削除
    log "Cleaning up old backups (older than ${BACKUP_RETENTION_DAYS} days)..."
    find ${BACKUP_DIR} -name "mongodb_backup_*.gz" -type f -mtime +${BACKUP_RETENTION_DAYS} -delete
    
    # 現在のバックアップファイル数を確認
    BACKUP_COUNT=$(find ${BACKUP_DIR} -name "mongodb_backup_*.gz" -type f | wc -l)
    log "Current backup count: ${BACKUP_COUNT}"
    
else
    log "ERROR: Backup failed"
    exit 1
fi

log "Backup process completed"
