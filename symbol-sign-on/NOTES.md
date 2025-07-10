# Symbol Sign Auth プロジェクト構成メモ

## ファイル構成

### コアファイル
- `src/index.ts`: メインエントリーポイント（旧app.ts）
- `src/routes/auth.ts`: 認証関連のルート（旧oauth.ts）
- `src/services/signature.ts`: Symbol署名検証サービス（旧oauth.ts）
- `src/db/database.ts`: データベース接続管理（旧mongo.ts）
- `src/types/auth.ts`: 型定義（旧oauth.ts）
- `src/utils/logger.ts`: ログ設定

### 設定・ドキュメント
- `package.json`: 依存関係とスクリプト設定
- `tsconfig.json`: TypeScript設定
- `docker-compose.yml`: 開発環境設定
- `Dockerfile`: 本番環境設定
- `.env`: 環境変数設定
- `README.md`: プロジェクト説明とAPI仕様
- `public/demo.html`: フロントエンド統合テスト

## 修正済みの項目

### 1. 依存関係の追加・修正
- Express v4に変更（v5の型問題を回避）
- winston, cors, @types等を追加
- package.jsonにスクリプトを追加

### 2. ファイル構成の修正と整理
- `src/index.ts`: メインアプリケーションファイル（app.tsからリネーム）
- `src/types/auth.ts`: 型定義ファイル（oauth.tsからリネーム）
- `src/routes/auth.ts`: 認証ルート（oauth.tsからリネーム）
- `src/services/signature.ts`: Symbol署名検証（oauth.tsからリネーム）
- `src/db/database.ts`: データベース管理（mongo.tsからリネーム）

### 3. 設定ファイル
- .env: MongoDB URI、ポート設定等を追加
- .gitignore: 包括的な設定に更新
- tsconfig.json: ESModuleに対応
- docker-compose.yml: 開発環境用（新規作成）
- Dockerfile: 本番環境用（新規作成）

### 4. ドキュメント・デモ
- README.md: 詳細な使用方法、API仕様を記載
- public/demo.html: フロントエンド統合テスト用デモページ

## 残っている課題（将来的な改善点）

### Symbol SDK v3の実装
- 現在は簡易的な署名検証のみ
- 実際のSymbol SDK v3 APIを調査して正しい実装に変更が必要

### セキュリティ強化
- HTTPS対応
- レート制限の実装
- CSRF保護
- セッション暗号化

### 運用面
- ヘルスチェックの拡張
- メトリクス収集
- 適切なロードバランシング設定

## 動作確認手順

1. MongoDB起動（Dockerまたはローカル）
2. `npm install` で依存関係インストール
3. `npm run dev` で開発サーバー起動
4. http://localhost:3000/demo.html でデモページアクセス
5. Symbol Walletとの連携テスト

## API エンドポイント

- GET /oauth/authorize - チャレンジ生成
- POST /oauth/verify-signature - 署名検証
- POST /oauth/token - トークン交換
- GET /oauth/userinfo - ユーザー情報取得
- GET /health - ヘルスチェック
- GET / - デモページ（静的ファイル）
