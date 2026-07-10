# アーキテクチャ

こくばんのシステム構成と設計判断の解説。通信メッセージの仕様は [protocol.md](protocol.md) を参照。

## 全体像

すべて Cloudflare 無料枠で動く 3 層構成。1 ボード = 1 Durable Object (DO) がそのボードの
「正」を持ち、クライアントは楽観適用 + サーバーブロードキャストで同期する。

```text
[ブラウザ]  Vite + React 19 SPA
  ├─ zustand ストア (src/store/store.ts) — 盤面・接続状態・UI 状態
  ├─ canvas 描画 (src/board/) — チョーク質感・ヒットテスト・パン/ズーム
  └─ BoardConnection (src/ws/connection.ts) — WebSocket 接続・再接続
        ↕ WebSocket  /ws/:boardId
[Cloudflare Worker] (worker/index.ts)
  ├─ /ws/:boardId → env.BOARD.getByName(boardId) で DO へルーティング
  └─ それ以外     → static assets (dist/ の SPA、SPA fallback あり)
[Durable Object] BoardDO (worker/board-do.ts)
  ├─ WebSocket Hibernation API で接続維持
  ├─ SQLite ストレージに盤面 (strokes / stickies) を永続化
  └─ RateLimiter (worker/rate-limit.ts) で受信レート制限
```

- **D1 は使わない**。DO 内蔵の SQLite ストレージ (無料プランで利用可) に集約する
  (`wrangler.jsonc` の `migrations` で `new_sqlite_classes: ["BoardDO"]`)
- 配信は Worker の static assets (`assets.binding: ASSETS`、`not_found_handling:
  "single-page-application"`)。`/b/<boardId>` への直アクセスも SPA fallback で index.html が返る

## データフロー

### 盤面変更 (op) — 永続化される

```text
ユーザー操作
  → store.applyLocalOp(op)          ... 楽観適用 (shared/ops.ts の applyOp)
  → connection.send({type:'op', op}) ... WebSocket で DO へ
  → DO: zod 検証 → レート制限 → applyOp (同じ reducer) → SQLite へ永続化
  → DO: 変更があった場合のみ、送信元以外へ {type:'op', op} をブロードキャスト
  → 他クライアント: store.handleServerMessage → applyOp で反映
```

要点:

- **reducer の二重実装禁止**: `shared/ops.ts` の `applyOp` をクライアント (楽観適用) と
  DO (正) が共用する。無効な op (存在しない id、上限超過の addSticky など) は無視され、
  変更がなければ**同一参照**の state を返す — DO はこれを利用して、無変更の op は
  ブロードキャストしない
- **楽観適用のガード**: `applyLocalOp` は `full` (満席で読み取り専用) または
  `status !== 'open'` (再接続中) のとき op を受け付けない。ローカルにだけ反映されて
  サーバーに届かない「無音ロールバック」を防ぐため
- **取り消し (Ctrl/Cmd+Z)**: 専用の undo op は存在しない。クライアントが自分の
  ストローク id を `myStrokeIds` に記録しておき、`eraseStroke` を発行するだけ。
  部分消し (`eraseArea`) で自分のストロークが分割されたときは、`myStrokeIds` を
  断片 id に付け替えて追従する (分割判定は reducer と同じ `eraseStrokePath` を共用)

### エフェメラル (cursor / stroking / reaction) — 永続化されない

カーソル座標・描画中プレビュー・リアクションは SQLite に書かず、送信元以外へ
そのままブロードキャストするだけ。切断・再接続で消えてよい情報はストレージに置かない。

- cursor: クライアントが 80ms スロットルで送信 (`CURSOR_THROTTLE_MS`)
- stroking: 描画中の点を 16ms (`STROKE_BATCH_MS`) でバッチ送信。受信側は draft として
  重ね描きし、確定 op (`addStroke`) が届いたら draft を破棄する。6 秒 (`DRAFT_TTL_MS`)
  更新が途絶えた draft はクライアント側で掃除する
- reaction: 演出のみ。クライアント側でも秒 3 回 (`REACTIONS_PER_SECOND`) に自主制限する

## Durable Object のライフサイクル

### Hibernation API (必須)

`ctx.acceptWebSocket(server)` (WebSocket Hibernation API) を使う。`ws.accept()` は禁止。
ハイバネーション中は DO がメモリから消えるため、**メモリ上のインスタンス変数は
いつ消えてもよい前提**で設計する:

| データ | 置き場所 | 理由 |
| --- | --- | --- |
| セッション情報 (id / name / color / spectator) | `ws.serializeAttachment()` | ハイバネーションを越えて WebSocket に紐づく |
| 盤面 (strokes / stickies) | SQLite ストレージ | 正。メモリの `#board` は遅延ロードするキャッシュにすぎない |
| レート制限カウンタ | メモリ (WeakMap) | 消えてもカウンタがリセットされるだけで安全側 |

- セッションは毎回 `ws.deserializeAttachment()` から復元する (`session(ws)`)。
  インスタンス変数にセッション表を持たない
- 接続一覧は `ctx.getWebSockets()` から都度列挙する (`members()` / `broadcast()`)
- **DO 内で `setTimeout` / `setInterval` を使わない** (ハイバネーションを妨げる)。
  時限処理が必要になったら Alarm API を使う — 現行実装にタイマー処理はなく
  (draft の掃除はクライアント側)、Alarm は未使用

### 接続の受け入れと退出

1. Worker が `/ws/:boardId` (`[A-Za-z0-9_-]{1,64}`) を DO へ転送。非 WebSocket は 426
2. DO はクエリの `name` / `color` を `joinSchema` で検証 (失敗は 400)
3. 参加者が 100 人 (`MAX_CONNECTIONS`) に達していたら **spectator (読み取り専用)** として
   受け入れる。spectator も 20 人 (`MAX_SPECTATORS`) を超えたら close code 4003
   (`CLOSE_CODE_FULL`) で拒否 — クライアントはこのコードを見て再接続を止める
4. 受け入れ直後に `snapshot` (自分・参加者一覧・盤面全量・満席フラグ) を送り、
   参加者なら他の接続へ `presence (join)` をブロードキャスト
5. 切断 (`webSocketClose` / `webSocketError`) では attachment に `left: true` を書いて
   二重 leave をブロックしてから `presence (leave)` を流す

### SQLite スキーマ

```sql
CREATE TABLE IF NOT EXISTS strokes (
  seq  INTEGER PRIMARY KEY AUTOINCREMENT,  -- 描画順。上限超過時に古い順で間引く
  id   TEXT UNIQUE NOT NULL,
  data TEXT NOT NULL                       -- Stroke の JSON
);
CREATE TABLE IF NOT EXISTS stickies (
  id   TEXT PRIMARY KEY,
  data TEXT NOT NULL                       -- Sticky の JSON
);
```

- ストロークが 2000 本 (`MAX_STROKES`) を超えたら `seq` の古い順に DELETE
  (reducer の間引き規則と同一)
- 部分消し (`eraseArea`) は reducer 適用前後の id 集合の差分を取り、消えた親ストロークを
  DELETE・生まれた断片を INSERT で差分反映する。断片 id は決定的 (`fragmentId`) なので
  クライアント側の楽観適用結果と一致する
- 付箋の読み出しは `stickySchema.safeParse` を通す — `w` / `h` / `fontSize` を持たない
  旧データにデフォルト値を補完する後方互換のため。壊れた行は黙って捨てる

## クライアントの状態管理

zustand ストア (`src/store/store.ts`) が単一の状態置き場。主な区画:

- **ビュー**: `view` (パン/ズーム、scale 0.5〜2)、`tool` (`chalk | eraser | sticky`)、`chalkColor`
- **接続**: `connection` / `status` (`connecting | open | reconnecting`) / `self` / `users` / `full`
- **盤面**: `board` (共有 reducer で更新)、`drafts` (他人の描画中プレビュー)、
  `myStrokeIds` (取り消し用)
- **エフェメラル UI**: `cursors`、`reactions`、付箋のボトムシート・編集リクエスト

再接続で `snapshot` を受けたら盤面・参加者を全量差し替え、`cursors` / `drafts` を
クリアして取り直す。描画そのもの (チョーク質感・粉・拭き跡) は React の外で
canvas 2D に直接描く (`src/board/BoardCanvas.tsx`)。

### 再接続戦略 (src/ws/connection.ts)

- 指数バックオフ: `min(500 * 2^attempts, 8000)` ms に ±30% のジッター
- close code 4003 (満席拒否) を受けたら再接続せず `onFull` を通知
- 送信キューは持たない — WebSocket が OPEN でなければ送信は破棄する。
  盤面の整合性は再接続時の `snapshot` 全量同期で回復する

## サージ防御 (無料枠の保護)

上限値はすべて `shared/limits.ts` に集約。適用箇所:

| 防御 | 実装場所 |
| --- | --- |
| 同時接続 100 / spectator 20 | DO の接続受け入れ (`board-do.ts`) |
| 受信レート制限 (op 20 / cursor 15 / reaction 3 / stroking 70 件/秒・接続ごと) | `worker/rate-limit.ts` (1 秒窓、超過は黙って破棄) |
| カーソル 80ms スロットル・ストローク 16ms バッチ | クライアント (`connection.ts` / `BoardCanvas.tsx`) |
| 盤面上限 (ストローク 2000 / 付箋 200 / 1 ストローク 600 点 / テキスト 80 字) | zod スキーマ + reducer + SQLite の間引き |

Cloudflare 無料プランは fail-closed (超過で課金ではなく停止) だが、防御は
「1 ユーザーの暴走が他ユーザーの体験を壊さない」ためにも必要。外さないこと。

## テスト戦略

`tests/` はソース構造をミラーする。層ごとに検証手段を変える:

| 層 | 手段 | 主な対象 |
| --- | --- | --- |
| `tests/shared/` | Vitest (単体) | reducer の全 op・zod スキーマの受入/拒否・limits の値 |
| `tests/src/` | Vitest (単体) | ヒットテスト・座標変換・store のガード (applyLocalOp) |
| `tests/worker/` | Vitest + `@cloudflare/vitest-pool-workers` | DO を実起動して接続〜永続化〜ブロードキャスト、満席・レート制限 |
| `tests/e2e/` | Playwright | 2 ブラウザコンテキスト間の同期 (ストローク・付箋)、375px のツールバー操作 |

単体テストの主戦場は `shared/` — クライアントと DO の両方の挙動をここで一度に保証できる。
