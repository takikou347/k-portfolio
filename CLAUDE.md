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
  PR レビュー / 日次バッチ実装 / @claude 応答 / CI 自動修復 = sonnet。ワークフローの `--model` を外さない。
  リリース PR 下書き (release-draft.yml) は LLM 不使用の決定論的スクリプト
- ダイナミックワークフローは明示的なオプトイン (「ワークフローで」/ ultracode) のときだけ使う。
  多数のエージェントを生みトークン消費が大きい — まず小さいスコープで試してから広げる
- 保存済みワークフロー `/exhaustive-review` — スライス完了時・push 前の多角レビュー
  (5 視点で並列レビュー → 指摘を敵対的検証)。機械的なステージは低 effort / 小モデルに寄せる
- 長時間の自律実行 (goal / 日次バッチ) でも Stop hook の品質ゲートと Git 運用ルールは常に適用される。
  着手前に完了条件を明示し、検証はワークフローの verify ステージか code-reviewer に委ねる

## Git 運用 (Issue 駆動 + develop フロー)

ブランチ作成・PR・リリースの具体的な手順は issue-driven スキルに従う。常に守る要点のみここに置く:

- **main = デプロイ / develop = 統合**。両方とも直 push・削除は禁止 (hooks + ブランチ保護 Ruleset が
  決定論的に遮断。→ docs/operations.md / `scripts/setup-branch-protection.sh`)。変更は必ず PR 経由で、
  **PR の base は develop**
- **1 Issue = 1 ブランチ = 1 PR**。Issue を先に作成してから、最新の develop から
  `<type>/issue-<番号>-<説明>` でブランチを切る (日次バッチは `auto/issue-<番号>`)。
  PR 本文に `Closes #<番号>` を必ず書く
- コミットは Conventional Commits + 末尾 `(#<Issue番号>)` (hooks が決定論的に検査)。
  1 コミット = 1 論理変更
- **merge の担当**: develop 向け PR は CI green + レビュー [must] ゼロを確認して Claude が merge してよい。
  **develop → main のリリース PR の merge は必ず人間** (本番デプロイの最終ゲート)。
  リリース PR は release-draft.yml が毎週金曜 18:00 JST に自動下書きする
- **CI が落ちた AI ブランチの PR** は claude-autofix-ci.yml が自動修復する (同一 PR 2 回まで、
  超えたら人間へ引き継ぎ)

## リアルタイム設計の要点 (必読)

- DO は必ず WebSocket Hibernation API (`ctx.acceptWebSocket`) を使う。`ws.accept()` は禁止
- DO のメモリ上の状態はハイバネーションで消える。セッション情報は
  `serializeAttachment` / `deserializeAttachment`、盤面は SQLite ストレージに置く
- DO 内で `setTimeout` / `setInterval` を使わない (ハイバネーションを妨げる)。時限処理は Alarm
- カーソル座標は 80ms スロットルで送信し、永続化しない
- 受信メッセージは必ず shared/ の zod スキーマで検証してから適用する

## 知らないことは調べる

Durable Objects / Hibernation / wrangler / Vite の API に確信が持てない場合は、推測せず
公式ドキュメントを WebFetch で確認してから実装する。一次情報:
<https://developers.cloudflare.com/durable-objects/> (llms.txt あり)
