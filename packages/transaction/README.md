# symbol-sign-tx

Symbol ブロックチェーン用のトランザクション作成・署名ライブラリです。

## 機能

- Symbol トランザクションの作成
- SSS (Symbol Simple Signer) との連携
- testnet/mainnet 対応

## インストール

```bash
yarn install
```

## ビルド

```bash
yarn build
```

## 使用方法

### 基本的な使用方法

```typescript
import { createSingTx, sssSignTx } from 'symbol-sign-tx';

// トランザクション作成
const payload = createSingTx('testnet', 'Hello, Symbol!');

// SSS署名
sssSignTx(payload);
```

### HTMLから使用

```html
<script type="module">
  import * as SymbolSignTx from './dist/symbol-sign-tx.js';
  
  const payload = SymbolSignTx.createSingTx('testnet', 'Hello, Symbol!');
  SymbolSignTx.sssSignTx(payload);
</script>
```

## テスト

### ビルドしたライブラリのHTMLテスト

テストページを使用してビルドされたライブラリが正常に動作することを確認できます：

```bash
# ビルドとテストサーバーを一度に実行
yarn test

# または個別に実行
yarn build
yarn test-server
```

テストサーバーが起動したら、ブラウザで `http://localhost:3000` にアクセスしてください。

テストページでは以下のことができます：
- ネットワーク選択（Mainnet/Testnet）
- メッセージ入力
- トランザクション生成の確認
- 生成されたトランザクションの詳細表示

詳細な使用方法は `test-page/TEST_PAGE_GUIDE.md` を参照してください。

```bash
# ビルドしてテストサーバーを起動
yarn test:build

# または別々に実行
yarn build
yarn test:server
```

テストサーバー起動後、以下のURLにアクセス：

- **メインテストページ**: http://localhost:3000/test/index.html
- **バンドル分析**: http://localhost:3000/dist/bundle-stats.html

### テスト内容

#### メインテストページ (test/index.html)

- 📦 **ライブラリ読み込みテスト**: ES Moduleとしての読み込み確認
- 🔐 **トランザクション作成テスト**: ネットワーク別、カスタムメッセージでのテスト
- 🧪 **包括的テストスイート**:
  - 基本機能テスト
  - ネットワークバリエーション (testnet/mainnet)
  - メッセージバリエーション (空文字列、日本語、絵文字、長文など)
  - パフォーマンステスト (100回実行での平均時間測定)
  - エラーハンドリングテスト

#### テスト機能

- ✅ **リアルタイムテスト実行**: ブラウザ上で即座に結果確認
- 📊 **詳細レポート**: 成功率、実行時間、エラー詳細
- 🎨 **見やすいUI**: 成功/失敗の色分け表示
- 🔄 **自動テスト**: 全テストを順次実行

#### ファイル構成

```text
test/
├── index.html      # メインテストページ
├── test-suite.js   # 高度なテストスイート
└── server.cjs      # 開発用サーバー
```

### テストで確認できること

- ✅ ライブラリの正常な読み込み
- ✅ testnet/mainnet での動作確認
- ✅ 日本語メッセージ対応
- ✅ 空文字・長文メッセージ対応
- ✅ ペイロード生成の確認
- ✅ SSS連携機能

## API

### `createSingTx(networkName: string, message: string): string`

Symbol トランザクションを作成し、シリアライズされたペイロードを返します。

- `networkName`: 'testnet' または 'mainnet'
- `message`: 送信するメッセージ
- **戻り値**: 16進数文字列のペイロード

### `sssSignTx(payload: string): void`

SSS (Symbol Simple Signer) に署名リクエストを送信します。

- `payload`: `createSingTx` で生成されたペイロード

## 開発

```bash
# 開発時のファイル実行
yarn start

# リント
yarn lint

# フォーマット
yarn format
```
