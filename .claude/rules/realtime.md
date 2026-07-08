---
paths:
  - "worker/**"
  - "shared/**"
---

# Worker / Durable Object / 共有 ops 規約

- WebSocket は Hibernation API のみ: `ctx.acceptWebSocket(ws)` + `webSocketMessage` / `webSocketClose` ハンドラ
- 接続ごとのユーザー情報 (id, 名前, 色) は `ws.serializeAttachment()` に保存し、
  ハンドラ側では毎回 `deserializeAttachment()` で復元する。DO のインスタンス変数に依存しない
- 盤面 (付箋・ストローク) は DO の SQLite ストレージ (`this.ctx.storage.sql`) に永続化。
  スキーマ初期化は constructor 内の `blockConcurrencyWhile` で行う
- DO 内で `setTimeout` / `setInterval` 禁止。時限処理は Alarm API
- すべての受信メッセージは `shared/schema.ts` の zod スキーマで parse し、失敗したら黙って破棄する
- 盤面への変更は `shared/ops.ts` の reducer (`applyOp(state, op)`) を通す。
  DO とクライアントで同じ reducer を使い、二重実装しない
- cursor / reaction は ephemeral: ブロードキャストのみで永続化しない
- ブロードキャストは送信元を除く。`ctx.getWebSockets()` で列挙する
- 1 ボード = 1 DO。ボード ID から `getByName()` で決定的にルーティングする
- サージ防御 (無料枠保護):
  - 1 ボードの同時接続数に上限 (100)。超過時は接続を拒否し、クライアントは「満席です」を表示
  - 接続ごとに受信レート上限 (op は 20 件/秒、cursor は 15 件/秒)。超過分は黙って破棄
  - 上限値は shared/limits.ts に定数として集約する
