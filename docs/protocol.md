# WebSocket プロトコル仕様

クライアント ⇔ Durable Object 間の通信仕様。スキーマの正は `shared/schema.ts` (zod)、
上限値の正は `shared/limits.ts`。この文書は転記なので、食い違ったらコードが正しい。

## 接続

```
GET wss://<host>/ws/<boardId>?name=<名前>&color=<色>
```

- `boardId`: `[A-Za-z0-9_-]{1,64}`。SPA 側は `/b/<boardId>` の URL から導出し、
  この形式にマッチしないパス (`/` など) はすべて `main` にフォールバックする。
  1 boardId = 1 Durable Object
- `name`: 2〜8 文字 / `color`: `red | blue | yellow | pink` (カーソルマグネットの色)。
  `joinSchema` の検証に失敗すると **400**
- WebSocket でない (Upgrade ヘッダなし) リクエストは **426**
- 全メッセージは JSON テキストフレーム。バイナリ・不正 JSON・スキーマ違反は
  **黙って破棄される** (エラー応答はない)

### 満席の扱い

- 参加者が 100 人 (`MAX_CONNECTIONS`) に達していると **spectator (読み取り専用)** として
  接続される。`snapshot` の `full: true` がその印。spectator の送信はすべて無視される
- spectator も 20 人 (`MAX_SPECTATORS`) を超えると、接続直後に close code
  **4003** (`CLOSE_CODE_FULL`) で切断される。クライアントはこのコードを見たら
  再接続してはならない

### 切断・再接続

- クライアントは指数バックオフ (`min(500 * 2^attempts, 8000)` ms ± 30% ジッター) で再接続する
- 再接続後はサーバーが `snapshot` で盤面全量を送り直す。差分同期はない

## クライアント → サーバー (`ClientMessage`)

`type` を discriminator とする 4 種。座標はすべて有限数で ±1,000,000 以内 (`coordSchema`)。

### `op` — 盤面変更 (永続化される)

```jsonc
{ "type": "op", "op": { /* 下記 Op のいずれか */ } }
```

### `cursor` — カーソル座標 (エフェメラル)

```jsonc
{ "type": "cursor", "x": 120.5, "y": -40 }
```

送信は 80ms (`CURSOR_THROTTLE_MS`) スロットル。永続化されない。

### `stroking` — 描画中プレビュー (エフェメラル)

```jsonc
{ "type": "stroking", "strokeId": "…", "color": "white", "points": [{ "x": 0, "y": 0 }] }
```

- `points`: 1〜600 点 (`MAX_STROKE_POINTS`)。描画中の**増分**を 16ms (`STROKE_BATCH_MS`)
  でバッチ送信する。描き終えたら確定の `op (addStroke)` を送る
- 受信側は draft として表示し、`addStroke` の到着または 6 秒の途絶で破棄する

### `reaction` — 絵文字リアクション (エフェメラル)

```jsonc
{ "type": "reaction", "emoji": "👏", "x": 0, "y": 0 }
```

`emoji` は `👏 ✨ 💮 ❤️` の 4 種 (`REACTION_EMOJIS`) のみ。

## 盤面操作 (`Op`)

`type` を discriminator とする 9 種。無効な op (存在しない id、上限超過、何にも触れない
消しゴム軌跡) は無視され、ブロードキャストもされない。

| type | フィールド | 挙動・制約 |
|---|---|---|
| `addStroke` | `stroke: Stroke` | 同一 id は冪等 (無視)。2000 本 (`MAX_STROKES`) 超過で古い順に間引き |
| `eraseStroke` | `strokeId` | ストローク単位の削除。存在しない id は無視。取り消し (Ctrl/Cmd+Z) もこの op を使う |
| `eraseArea` | `points, r` | 部分消し (GoodNotes 風)。軌跡 `points` (1〜40 点, `MAX_ERASE_POINTS`) と半径 `r` (1〜100) のカプセル領域に触れた区間だけを除去し、残存区間を断片ストロークに分割して盤面末尾に追加する。断片 id は `fragmentId(親id, 残存区間の開始 index)` (FNV ハッシュ) で決定的に生成され、クライアント / DO で一致する。どのストロークにも触れない op は無効扱い |
| `addSticky` | `sticky: Sticky` | 同一 id は冪等。200 枚 (`MAX_STICKIES`) 以上のときは無視 |
| `moveSticky` | `id, x, y` | 存在しない id は無視 |
| `editSticky` | `id, text` | text は 80 字まで (`STICKY_TEXT_MAX`) |
| `recolorSticky` | `id, color` | `cream \| rose \| sky` |
| `resizeSticky` | `id, w, h, fontSize` | 整数のみ。範囲は下表 |
| `deleteSticky` | `id` | 存在しない id は無視 |

### データ型

**Stroke**

| フィールド | 型 / 制約 |
|---|---|
| `id` | 文字列 1〜64 |
| `color` | `white \| pink \| yellow \| blue` (チョーク 4 色) |
| `points` | `{x, y}` の配列、1〜600 点 |

**Sticky**

| フィールド | 型 / 制約 | 省略時 |
|---|---|---|
| `id` | 文字列 1〜64 | — |
| `x`, `y` | 座標 | — |
| `color` | `cream \| rose \| sky` | — |
| `text` | 0〜80 字 | — |
| `w` | 整数 120〜360 | 180 |
| `h` | 整数 100〜360 | 140 |
| `fontSize` | 整数 12〜28 | 15 |

`w` / `h` / `fontSize` の default は後方互換のため — これらのフィールドが導入される前に
永続化された付箋も、読み出し時にデフォルト値が補完される。

## サーバー → クライアント (`ServerMessage`)

`type` を discriminator とする 6 種。

### `snapshot` — 接続直後の全量同期

```jsonc
{
  "type": "snapshot",
  "self": { "id": "…", "name": "たろう", "color": "red" },
  "users": [ /* User の配列 (自分含む。spectator は含まれない) */ ],
  "full": false,          // true = 満席のため読み取り専用 (spectator)
  "state": { "strokes": [ /* Stroke */ ], "stickies": [ /* Sticky */ ] }
}
```

受信したら盤面・参加者を全量差し替え、カーソル・draft をクリアする。

### `presence` — 入退室通知

```jsonc
{ "type": "presence", "event": "join", "user": { /* User */ }, "users": [ /* 最新一覧 */ ] }
```

`event` は `join | leave`。`leave` では該当ユーザーのカーソルと draft を掃除する。

### `op` — 他クライアントの盤面変更

```jsonc
{ "type": "op", "op": { /* Op */ } }
```

送信元以外にのみ配信される (送信元は楽観適用済み)。共有 reducer `applyOp` で適用する。

### `cursor` / `stroking` / `reaction` — エフェメラルの中継

クライアントの送信内容に `userId` (送信者の接続 id) を付加したもの。

```jsonc
{ "type": "cursor",   "userId": "…", "x": 0, "y": 0 }
{ "type": "stroking", "userId": "…", "strokeId": "…", "color": "white", "points": [ /* 増分 */ ] }
{ "type": "reaction", "userId": "…", "emoji": "👏", "x": 0, "y": 0 }
```

## 上限値・レート制限一覧

正は `shared/limits.ts`。レート制限は DO 側で**接続ごと・1 秒窓**で数え、超過分は
黙って破棄される (`worker/rate-limit.ts`)。

| 定数 | 値 | 適用 |
|---|---|---|
| `MAX_CONNECTIONS` | 100 | 1 ボードの参加者上限。超過は spectator |
| `MAX_SPECTATORS` | 20 | spectator 上限。超過は close 4003 |
| `CLOSE_CODE_FULL` | 4003 | 満席拒否の close code (再接続禁止の合図) |
| `OPS_PER_SECOND` | 20 | op 受信レート (件/秒・接続ごと) |
| `CURSORS_PER_SECOND` | 15 | cursor 受信レート |
| `REACTIONS_PER_SECOND` | 3 | reaction 受信レート (クライアント側でも自主制限) |
| `STROKINGS_PER_SECOND` | 70 | stroking 受信レート (16ms バッチ ≈ 60 件/秒を許容) |
| `MAX_STROKES` | 2000 | 盤面のストローク上限 (超過は古い順に間引き) |
| `MAX_STROKE_POINTS` | 600 | 1 ストロークの点数上限 (スキーマで拒否) |
| `MAX_ERASE_POINTS` | 40 | eraseArea の軌跡点数上限 (スキーマで拒否) |
| `ERASE_RADIUS_MIN` / `ERASE_RADIUS_MAX` | 1 / 100 | eraseArea の半径の許容範囲 |
| `ERASE_BATCH_MS` | 60 | 消しゴム軌跡のバッチ送信間隔 (クライアント側) |
| `MAX_STICKIES` | 200 | 盤面の付箋上限 (超過の addSticky は無視) |
| `STICKY_TEXT_MAX` | 80 | 付箋テキスト文字数 |
| `NAME_MIN` / `NAME_MAX` | 2 / 8 | 入室名の文字数 |
| `CURSOR_THROTTLE_MS` | 80 | カーソル送信スロットル |
| `STROKE_BATCH_MS` | 16 | stroking のバッチ送信間隔 |
| `ZOOM_MIN` / `ZOOM_MAX` | 0.5 / 2 | クライアントのズーム範囲 |

## 設計上の約束

- **受信メッセージは必ず zod スキーマで検証してから適用する** — DO は
  `clientMessageSchema`、クライアントは `serverMessageSchema`。検証失敗は黙殺
- エラー応答は返さない。プロトコル違反・レート超過・無効 op はすべて黙って破棄する
  (遊び用途のため、攻撃者に情報を返さないシンプルな設計)
- メッセージ型を追加するときは `shared/schema.ts` → `shared/ops.ts` (盤面に触るなら) →
  DO / クライアント両方のハンドラ → この文書、の順で更新する
