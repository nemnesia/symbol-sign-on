FROM node:18-alpine

# セキュリティアップデート
RUN apk update && apk upgrade && apk add --no-cache \
    curl \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Package files をコピー
COPY package.json package-lock.json* ./

# 依存関係をインストール
RUN npm ci --only=production && npm cache clean --force

# ソースコードをコピー
COPY . .

# TypeScriptをビルド
RUN npm run build

# 不要なファイルを削除
RUN rm -rf src tsconfig.json

# ログディレクトリを作成
RUN mkdir -p logs backups

# 非rootユーザーを作成
RUN addgroup -g 1001 -S nodejs
RUN adduser -S appuser -u 1001

# ファイルの所有権を変更
RUN chown -R appuser:nodejs /app
USER appuser

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-4510}/health || exit 1

EXPOSE 4510

CMD ["npm", "start"]
