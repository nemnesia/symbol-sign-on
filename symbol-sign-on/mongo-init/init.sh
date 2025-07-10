#!/bin/bash
set -e

# データベースとコレクションの初期化
mongosh <<EOF
use symbol_sign_auth

// auth_codesコレクションの作成とインデックス設定
db.createCollection("auth_codes")
db.auth_codes.createIndex({ "code": 1 }, { unique: true })
db.auth_codes.createIndex({ "expiresAt": 1 }, { expireAfterSeconds: 0 })

// refresh_tokensコレクションの作成とインデックス設定
db.createCollection("refresh_tokens")
db.refresh_tokens.createIndex({ "token": 1 }, { unique: true })
db.refresh_tokens.createIndex({ "expiresAt": 1 }, { expireAfterSeconds: 0 })

// user_sessionsコレクションの作成とインデックス設定
db.createCollection("user_sessions")
db.user_sessions.createIndex({ "sessionId": 1 }, { unique: true })
db.user_sessions.createIndex({ "expiresAt": 1 }, { expireAfterSeconds: 0 })

// 初期化完了のログ
print("Database and collections initialized successfully")
EOF
