# 起動プロンプト (Claude Code に貼り付ける)

前提: 環境準備 (Cloudflare アカウント / GitHub App / Secrets) は実装完了後に行う。
そのため、このセッションでは認証が必要な操作 (wrangler login、デプロイ、--remote) を行わない。
ローカル検証は wrangler dev のローカルモード (ログイン不要) で完結させる。

---

リアルタイム共有黒板「こくばん」を CLAUDE.md と .claude/ のハーネスに従ってゼロから実装し、
デプロイ設定 (wrangler.jsonc / ワークフロー) の整備まで完了させてください。実デプロイは行わない。
まず計画モードで全体計画を提示し、承認後に自律的に最後まで進めてください。

## プロダクト仕様

複数人が同じ URL を開くと同じ黒板が表示され、チョーク描画・付箋・カーソル・リアクションが
全員の画面へ即時反映される遊び用アプリ。認証なし (入室時に名前だけ入力)。
ビジュアルと操作感は design/DESIGN.md に完全準拠すること (黒板の質感・チョークの描き味・マグネット)。

### 機能

1. **入室**: `/` でボード表示。初回に名前 (2〜8字) を入力。`/b/[boardId]` で別黒板も開ける
   (boardId 未指定は "main")
2. **ライブカーソル**: 全員のカーソルが名前付きマグネットとして見える (80ms スロットル)
3. **チョーク描画**: 4色。フリーハンドストローク。黒板消しでストローク単位の削除。
   取り消し (自分の直近ストロークに eraseStroke を送る。専用 op は作らない)
4. **付箋 (画用紙)**: 追加・テキスト編集 (80字以内)・ドラッグ移動・色変更 (3色)・削除。
   移動は全員にリアルタイム同期
5. **リアクション**: 絵文字 4 種がカーソル位置で舞う。ephemeral (永続化しない)。秒 3 回まで
6. **人数表示**: 接続中の人数を表示
7. **永続化**: ストロークと付箋は DO の SQLite に保存。再訪しても黒板が残っている。
   ストローク上限 2000 本 (超過時は古い順に間引き)
8. **状態 UX**: 再接続バナー・満席表示・参加者一覧ポップオーバー (DESIGN.md 準拠)

### データ/プロトコル (shared/ に定義)

- op: addStroke / eraseStroke / addSticky / moveSticky / editSticky / recolorSticky / deleteSticky
- ephemeral message: cursor / reaction / presence (join・leave・人数)
- すべて zod スキーマで定義し、`applyOp(state, op)` reducer をクライアント/DO 共用にする
- 接続時にサーバーから snapshot (全ストローク + 全付箋) を送る

### 非機能

- CLAUDE.md「リアルタイム設計の要点」と .claude/rules/realtime.md を厳守
  (Hibernation API、serializeAttachment、zod 検証、スロットル/バッチ)
- shared/ の reducer・スキーマにテストを網羅 (境界ケース含む)。
  DO 結合テストを @cloudflare/vitest-pool-workers で最低 1 本
- E2E: Playwright を導入し `pnpm test:e2e` を整備。webServer で wrangler dev を起動し、
  (1) 2 context 間のストローク同期 (2) 付箋の作成・移動の同期 (3) 375px でのツールバー操作
  の 3 本を必須とする。UI の見た目確認には playwright MCP を使い、DESIGN.md 準拠を
  スクリーンショットで自己検証すること
- 依存は最小限: react, zustand, zod, lucide-react + 開発系 (@playwright/test 含む)。UI ライブラリ・canvas ライブラリは入れない
- サージ防御: 1 ボード同時接続 100 まで (超過は「満席です」表示)、接続ごとの受信レート上限
  (op 20件/秒・cursor 15件/秒、超過は破棄)。上限は shared/limits.ts に集約し、テストも書く

## 進め方の指定 (スライス順)

各スライス完了時に検証 3 点セットの結果を貼ってから次へ進むこと。

1. **scaffold**: Vite + React + TS strict / Worker + DO の雛形 / wrangler.jsonc
   (DO バインディング + new_sqlite_classes + assets + SPA fallback) / Vitest / ESLint / prettier
2. **デザイン基盤**: tokens.css、黒板の盤面 (質感・木枠・チョーク受けツールバーの器)、パン/ズーム
3. **リアルタイム基盤**: WS 接続・再接続、presence (入室名・人数)、ライブカーソル
4. **チョーク描画**: ストロークの描画・同期・永続化・黒板消し
5. **付箋**: CRUD + ドラッグ同期
6. **リアクション**: ephemeral ブロードキャスト + 演出
7. **仕上げ**: プレースホルダー、reduced-motion、取り消し、再接続/満席 UX、
   レスポンシブ検証 (375px / 768px / 1920px。DESIGN.md の検証基準に従う)、
   E2E 3 本をグリーンにし、`pnpm preview` で 2 タブ同時接続の動作を確認して報告。
   コミットを整理して push (Secrets 未設定でも各ワークフローは自動スキップされるので push してよい)

## 完了条件

- `pnpm typecheck && pnpm lint && pnpm test` と `pnpm test:e2e` 全パス (結果を貼る)
- `pnpm preview` で 2 クライアント間の同期 (描画・付箋・カーソル・リアクション) を確認 (報告)
- 375px / 768px / 1920px でのレスポンシブ動作確認 (報告)
- code-reviewer エージェントの最終レビューで [must] ゼロ
