# Symbol Transaction Test Guide

このプロジェクトで作成したSymbolトランザクション生成ライブラリをテストするためのガイドです。

## テスト方法

### 1. プロジェクトのビルド

```powershell
yarn build
```

### 2. テストサーバーの起動

```powershell
yarn test-server
```

または、ビルドとテストサーバー起動を一度に行う場合：

```powershell
yarn test
```

### 3. ブラウザでテスト

テストサーバーが起動したら、ブラウザで以下のURLにアクセスします：

```
http://localhost:3000
```

## テストページの機能

### 主な機能
- **ネットワーク選択**: Mainnet (104) または Testnet (152) を選択
- **メッセージ入力**: 送信するメッセージを入力
- **トランザクション生成**: `createSingTx` 関数を使用してトランザクションを生成
- **結果表示**: 生成されたトランザクションの詳細情報と16進数データを表示

### 表示される情報
- ネットワーク情報 (Mainnet/Testnet)
- 入力されたメッセージ
- メッセージサイズ (バイト)
- トランザクションサイズ (バイト)
- トランザクションタイプ (Transfer: 0x5441)
- 受信者アドレス
- 生成されたトランザクションの16進数データ (整形済み)

## ライブラリの使用方法

生成されたライブラリは以下のように使用できます：

```javascript
import { createSingTx } from './dist/symbol-sign-tx.js';

// Testnetでメッセージ付きトランザクションを生成
const transaction = createSingTx(152, "Hello Symbol!");

// Mainnetでメッセージ付きトランザクションを生成
const transaction = createSingTx(104, "Production message");
```

## トランザクション構造

生成されるトランザクションには以下の要素が含まれます：

- **Size**: トランザクション全体のサイズ (4バイト)
- **VerifiableEntityHeaderReserved_1**: 予約領域 (4バイト)
- **Signature**: 署名データ (64バイト、ゼロ初期化)
- **SignerPublicKey**: 署名者の公開鍵 (32バイト、ゼロ初期化)
- **EntityBodyReserved_1**: 予約領域 (4バイト)
- **Version**: バージョン情報 (1バイト)
- **Network**: ネットワーク識別子 (1バイト)
- **Type**: トランザクションタイプ (2バイト、0x5441 = Transfer)
- **Fee**: 手数料 (8バイト、ゼロ初期化)
- **Deadline**: 期限 (8バイト、ゼロ初期化)
- **RecipientAddress**: 受信者アドレス (25バイト)
- **MessageSize**: メッセージサイズ (2バイト)
- **TransferTransactionBodyReserved_1**: 予約領域 (1バイト)
- **TransferTransactionBodyReserved_2**: 予約領域 (4バイト)
- **MosaicsCount**: モザイク数 (1バイト、0)
- **MessageHex**: メッセージの16進数データ (可変長)

## 注意事項

- このライブラリで生成されるトランザクションは、署名や実際の送信には使用できません
- 署名フィールドと公開鍵フィールドはゼロで初期化されています
- 手数料と期限もゼロで設定されています
- テスト目的でのトランザクション構造の確認に使用してください

## トラブルシューティング

### モジュールが読み込めない場合
- プロジェクトが正しくビルドされているか確認してください
- テストサーバーが起動しているか確認してください
- ブラウザの開発者ツールでエラーメッセージを確認してください

### CORS エラーが発生する場合
- テストサーバーを使用してください（直接HTMLファイルを開かないでください）
- ブラウザのキャッシュをクリアしてください
