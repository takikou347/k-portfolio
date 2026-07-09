# こくばん (KOKUBAN)

みんなで落書きできるリアルタイム共有黒板。複数人が同時に開き、チョーク描画・付箋・
カーソルが全員の画面に即時反映される。遊び用途。Cloudflare 無料枠で公開する。

## スタック

- クライアント: Vite + React 19 + TypeScript strict + zustand — ビジュアルは `design/DESIGN.md` に完全準拠
- サーバー: Cloudflare Worker (単一) + Durable Object (WebSocket Hibernation API)
- 永続化: Durable Object 内蔵の SQLite ストレージ (D1 は使わない)
- 共有ロジック: `shared/` のボード操作 (ops) モジュールをクライアントと DO の両方が使う
- 配信: Worker の static assets として SPA を配信。デプロイは wrangler
- Vitest (+ @cloudflare/vitest-pool-workers で DO をテスト) + Playwright (E2E) / pnpm

## コマンド

- `pnpm dev` — Vite 開発サーバー + `wrangler dev` (並行起動)
- `pnpm typecheck` / `pnpm lint` / `pnpm test` — 検証3点セット
- `pnpm test:e2e` — Playwright E2E (wrangler dev をローカル起動して 2 ページ間の同期を検証)
- `pnpm build` — SPA ビルド
- `pnpm preview` — build + wrangler dev で本番相当の動作確認
- `pnpm deploy` — 本番デプロイ (原則 CI が実行)

## ディレクトリ

- `src/` — React SPA (`src/board/` キャンバス描画、`src/store/` zustand、`src/ws/` 接続管理)
- `worker/` — Worker エントリと Durable Object (`worker/board-do.ts`)
- `shared/` — ops 型定義・reducer・zod スキーマ (クライアント/DO 共用。ここが単体テストの主戦場)
- `tests/` — テスト
- `docs/` — 開発者向けドキュメント (アーキテクチャ / WebSocket プロトコル仕様)
- `design/DESIGN.md` — デザインシステム / `.github/workflows/` — CI・デプロイ・@claude 応答

## 原則

- 実装前に必ず計画を立て、影響ファイルを列挙してから着手する
- 機能追加は vertical-slice スキルの縦切り手順に従う
- 仕様 (`shared/` / `worker/` / `src/ws/`) を変更する PR では `docs/` を同じ PR で更新する
  (CI の docs-sync ジョブが決定論的に検査。影響がない場合のみ PR ラベル `docs-not-needed` を付ける)
- 完了報告には必ず証拠を添える: `pnpm typecheck && pnpm lint && pnpm test` の実行結果
- 大きな調査やテスト全件実行はサブエージェントに委譲し、メインの文脈を汚さない
- デプロイと本番操作は CI (main への push) に委ねる
- 不可逆な操作 (履歴改変、リソース削除) はしない — hooks でも遮断される

## マルチエージェント運用とトークン最適化

- サブエージェントのモデルは役割で使い分ける (設定済み): レビュー = code-reviewer (sonnet)、
  テスト全件実行・集計 = test-runner (haiku)。新しいエージェントを足すときも同じ基準で選ぶ
- CI 側のモデルも用途別に固定済み: triage / health / 週次レポート = haiku、
  PR レビュー / 夜間実装 / @claude 応答 / CI 自動修復 = sonnet。ワークフローの `--model` を外さない。
  リリース PR 下書き (release-draft.yml) は LLM 不使用の決定論的スクリプト
- ダイナミックワークフローは明示的なオプトイン (「ワークフローで」/ ultracode) のときだけ使う。
  多数のエージェントを生みトークン消費が大きい — まず小さいスコープで試してから広げる
- 保存済みワークフロー `/exhaustive-review` — スライス完了時・push 前の多角レビュー
  (5 視点で並列レビュー → 指摘を敵対的検証)。機械的なステージは低 effort / 小モデルに寄せる
- 長時間の自律実行 (goal / 夜間バッチ) でも Stop hook の品質ゲートと Git 運用ルールは常に適用される。
  着手前に完了条件を明示し、検証はワークフローの verify ステージか code-reviewer に委ねる

## Git 運用 (Issue 駆動 + develop フロー)

### ブランチ戦略

- **main = デプロイブランチ**。main への push で本番デプロイが走る。リリース以外で触らない
- **develop = 統合ブランチ**。日々の修正・機能追加はすべて develop に集める
- **main と develop への直 push は禁止** (ローカルは hooks、クラウド (Actions) は GitHub の
  ブランチ保護 Ruleset が決定論的に遮断)。変更は必ず PR 経由。`guard-bash.sh` は CI ランナー上では
  発火しないため、auto-resolve の直 push / リリース PR merge 禁止はブランチ保護でも担保する
  (README「デプロイと Secrets」/ `scripts/setup-branch-protection.sh`)
- **main / develop はマージ後も削除しない** (永続ブランチ)。Issue ブランチはマージ後に消してよい

### 日々の開発

- **1 Issue = 1 ブランチ = 1 PR**。PR 本文に `Closes #<番号>` を必ず書き、複数 Issue を 1 PR にまとめない
- **Issue がない修正・機能追加は、先に Issue を作成してから着手する** (背景と完了条件を書く)。
  タイポ修正などの些末な変更でも省略しない — Issue が作業の記録になる
- ブランチは**最新の develop から**切り、`<type>/issue-<番号>-<説明>` 形式にする
  (例: `feat/issue-12-reaction-emoji`)。夜間バッチは `auto/issue-<番号>` を使う。**PR の base は develop**
- コミットメッセージは Conventional Commits 形式: `feat: / fix: / docs: / style: / refactor: /
  perf: / test: / chore: / ci:` + 末尾に `(#<Issue番号>)` (例: `feat: リアクションに 🎉 を追加 (#12)`)。
  プレフィックスは hooks (guard-bash.sh) が決定論的に検査する
- 1 コミット = 1 論理変更。無関係な変更を混ぜない
- **merge の担当**: develop 向けの PR は、CI が green かつレビュー指摘 [must] がゼロであることを
  確認したうえで Claude が merge してよい (作成直後の PR を検証確認なしに merge しない)。
  **develop → main のリリース PR の merge は必ず人間が行う** (本番デプロイの最終ゲート)
- **CI が落ちた AI ブランチの PR** は claude-autofix-ci.yml が自動修復する (同一ブランチ 2 回まで。
  修復コミットには `[ci-autofix]` マーカーを付ける — 試行回数の決定論的カウントに使う)

### リリース (develop → main)

- リリース PR は release-draft.yml が**毎週金曜 18:00 JST に自動で下書き・更新**する
  (workflow_dispatch で随時実行可)。手動で作る場合も同じ形式にする
- 対象の Issue がすべて develop に入ったタイミングで、**develop → main のリリース PR** を作成する
- リリース PR の本文に含まれる Issue / PR を列挙する — これがリリースノートになる
  (merge 後に GitHub Release を作成すると `.github/release.yml` のカテゴリで自動生成できる)
- merge は人間の担当。merge されると deploy.yml が本番デプロイを実行する
- 具体的な手順は issue-driven スキルに従う (実装部分は vertical-slice スキル)

## リアルタイム設計の要点 (必読)

- DO は必ず WebSocket Hibernation API (`ctx.acceptWebSocket`) を使う。`ws.accept()` は禁止
- DO のメモリ上の状態はハイバネーションで消える。セッション情報は
  `serializeAttachment` / `deserializeAttachment`、盤面は SQLite ストレージに置く
- DO 内で `setTimeout` / `setInterval` を使わない (ハイバネーションを妨げる)。時限処理は Alarm
- カーソル座標は 80ms スロットルで送信し、永続化しない
- 受信メッセージは必ず shared/ の zod スキーマで検証してから適用する

## UI の自己検証

playwright MCP が設定済み (.mcp.json)。UI を実装したら MCP のブラウザで実際に開き、
スクリーンショットを撮って design/DESIGN.md との一致 (質感・レイアウト・レスポンシブ) を
自分の目で確認してから完了報告する。375px / 768px / 1920px の 3 幅で確認する。

## 知らないことは調べる

Durable Objects / Hibernation / wrangler / Vite の API に確信が持てない場合は、推測せず
公式ドキュメントを WebFetch で確認してから実装する。一次情報:
https://developers.cloudflare.com/durable-objects/ (llms.txt あり)
