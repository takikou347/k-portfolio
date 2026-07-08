---
paths:
  - "wrangler.jsonc"
  - "wrangler.toml"
  - "vite.config.ts"
  - ".github/workflows/**"
---

# インフラ / CI 規約

- wrangler.jsonc: Durable Object のバインディングと `migrations` の `new_sqlite_classes` を必ず定義する
  (SQLite バックエンド指定。Free プランは SQLite バックの DO のみ利用可)
- SPA は Worker の `assets` として配信する。`not_found_handling: "single-page-application"` を設定
- Worker 無料枠: 10万リクエスト/日。WebSocket メッセージもリクエスト消費するため、
  カーソルのスロットル (80ms) とストロークのバッチ送信を外さない
- DO ストレージ無料枠は 1GB。盤面のストローク数に上限 (例: 2000本) を設け、超過時は古い順に間引く
- GitHub Actions のワークフローで secrets の値を echo などで出力するステップを絶対に書かない
- デプロイは main ブランチ経由のみ。ワークフローには timeout-minutes を必ず設定する
