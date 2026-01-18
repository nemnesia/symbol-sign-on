<!--
仕様: Symbol Sign-On / Auth Message Format
ステータス: Draft
作成日: 2026-01-19
-->

# Auth Message Format (Draft)

このドキュメントは、[RFC 0001](../rfcs/0001-symbol-sign-on-rfc.md) におけるオフチェーン署名認証で使用する「署名対象メッセージ（正規形）」と、`/auth/challenge`・`/auth/verify` 間で取り交わす最小フィールドを定義します。

## 目的

- 実装間で署名検証が一致するよう、署名対象データの正規形（canonical form）を固定する。
- 将来の拡張に備え、バージョン付け可能なフォーマットにする。

## 用語

- **Challenge**: サーバが発行する一時的なチャレンジ。
- **Signing input**: クライアントが署名するバイト列。
- **DID**: `did:symbol:<master-account-address>`。

## バージョニング

- 本ドキュメントで定義するフォーマットは **v1** とする。
- 署名対象には必ず `version` を含め、将来 v2 以降と衝突しないようにする。

## フィールド（v1）

### Challenge

サーバは少なくとも次のフィールドを返すこと。

- `nonce` (string, required): 乱数（推奨: 32 bytes 相当以上）。
- `server_id` (string, required): サーバ識別子（推奨: ドメイン名など）。
- `issued_at` (string, required): RFC3339 UTC。
- `expires_at` (string, required): RFC3339 UTC。
- `version` (string, required): 固定値 `"v1"`。

### Verify request

クライアントは少なくとも次のフィールドを送ること。

- `did` (string, required)
- `nonce` (string, required)
- `signature` (string, required): `signing_input` に対する署名。
- `public_key` (string, optional): オフチェーンで提示する場合に利用（運用方針による）。
- `meta` (object, optional)

## Signing input（正規形）

### 要件

- 署名対象には常に `nonce + server_id + issued_at + expires_at + did + version` を含めること。
- エンコーディングは UTF-8 とし、正規形の定義により余分な空白・改行の差異を排除すること。

### 方式（v1・提案）

相互運用性を優先し、v1 は「改行区切りのキー=値形式」を推奨する。

```
SYMBOL-SSO\n
version=v1\n
did=<did>\n
nonce=<nonce>\n
server_id=<server_id>\n
issued_at=<issued_at>\n
expires_at=<expires_at>\n
```

- キー順序は固定。
- 末尾は改行あり。
- 値はそのまま（URLエンコード等は行わない）。値に改行が含まれることは禁止。

> 注: JSON 正規化（JCS 等）を採用する場合は、この節を置き換えること。

## 例（v1）

- Challenge例（概念）
  - `nonce`: `"c8e3..."`
  - `server_id`: `"auth.example"`
  - `issued_at`: `"2026-01-19T00:00:00Z"`
  - `expires_at`: `"2026-01-19T00:05:00Z"`

- Signing input例（概念）

```
SYMBOL-SSO
version=v1
did=did:symbol:TA6...
nonce=c8e3...
server_id=auth.example
issued_at=2026-01-19T00:00:00Z
expires_at=2026-01-19T00:05:00Z

```

## 未確定事項（このファイルで決める）

- `nonce` の文字種（base64 / hex）と長さ
- `server_id` の正規形（FQDN固定、環境別、マルチテナント時の扱い）
- 許容クロックスキュー
- `public_key` 同梱の要否（オンチェーン参照を必須にするか）
