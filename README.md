# こくばん (KOKUBAN)

みんなで落書きできるリアルタイム共有黒板。複数人が同じ URL を開くと、チョーク描画・
画用紙の付箋・名前入りマグネットのライブカーソル・絵文字リアクションが全員の画面に
即時同期される。認証なし (入室時に名前だけ入力)。デザインコンセプトは「放課後の黒板」
([design/DESIGN.md](design/DESIGN.md))。

このリポジトリは同時に、**Claude Code のハーネスエンジニアリングのポートフォリオ**でもある。
実装・テスト・レビュー・デプロイ・日々の運用を Claude Code が自律で回し、人間はハーネス
(制御構造) の設計とリリースの最終承認だけを担当する (→ [ハーネス構成](#ハーネス構成))。

## 機能

- **チョーク描画**: 4色。かすれ・粉の粒子つきのフリーハンドストローク。黒板消しで
  ストローク単位の削除、Ctrl/Cmd+Z で自分の直近ストロークの取り消し
- **付箋 (画用紙)**: 追加・テキスト編集 (80字)・ドラッグ移動・色変更 (3色)・削除
- **ライブカーソル**: 全員のカーソルが名前入りマグネットとして見える (80ms スロットル)
- **リアクション**: 絵文字 4 種がカーソル位置で舞う (永続化しない・秒 3 回まで)
- **永続化**: ストローク (上限 2000 本) と付箋を Durable Object の SQLite に保存
- **複数ボード**: `/b/<boardId>` で別の黒板を開ける (未指定は "main")
- **状態 UX**: 接続人数・参加者一覧・再接続バナー・満席表示 (1 ボード同時接続 100 まで)

## アーキテクチャ (すべて Cloudflare 無料枠)

```
[ブラウザ] Vite + React 19 SPA (zustand / canvas)
    ↕ WebSocket
[Cloudflare Worker] 静的アセット配信 + /ws を Durable Object へルーティング
[Durable Object]   1 ボード = 1 DO。Hibernation API で接続維持、SQLite ストレージに盤面永続化
```

- `shared/` の ops reducer + zod スキーマをクライアントと DO が共用 → ここを厚くテストする
- D1 は使わない。DO 内蔵の SQLite ストレージ (無料プランで利用可) に集約
- サージ防御を実装済み: 接続数上限 100 / 受信レート制限 (op 20件/秒・cursor 15件/秒) /
  カーソルスロットル。上限値は `shared/limits.ts` に集約

詳細は開発者向けドキュメントを参照: [docs/architecture.md](docs/architecture.md)
(データフロー・DO のライフサイクル・状態管理) / [docs/protocol.md](docs/protocol.md)
(WebSocket メッセージプロトコル仕様)。入口は [docs/README.md](docs/README.md)。

## 環境構築

### 前提

| ツール | バージョン | 備考 |
|---|---|---|
| Node.js | 22 (CI と同一) | Vite 8 の要件上 20.19 以上 |
| pnpm | 9 | `corepack enable pnpm` で導入するのが楽 |

Cloudflare アカウントは**ローカル開発には不要** (wrangler はログイン不要のローカルモードで動く)。

### 手順

```bash
git clone https://github.com/takikou347/k-portfolio.git
cd k-portfolio
pnpm install
pnpm dev        # → http://localhost:5173 を開く
```

`pnpm dev` は Vite (5173) と `wrangler dev` (8787: Worker + DO) を並行起動し、
Vite が `/ws` の WebSocket を 8787 へプロキシする。同期を確認するにはタブを 2 つ開けばよい。

> fresh clone 直後は `dist/` が無く、`wrangler dev` の `assets.directory` 検証で起動が失敗する。
> これを防ぐため `predev` フックが **`dist/` が無いときだけ** 初回 `vite build` を自動実行する。
> よって `pnpm install && pnpm dev` だけで両サーバーが起動する（2 回目以降は `dist/` を再利用して速い）。

本番相当 (ビルド済み SPA を Worker の static assets として配信) で確認する場合:

```bash
pnpm preview    # build + wrangler dev → http://localhost:8788
```

### コマンド一覧

| コマンド | 内容 |
|---|---|
| `pnpm dev` | Vite 開発サーバー + `wrangler dev` (並行起動) |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | 検証 3 点セット (完了報告の必須証拠) |
| `pnpm test:e2e` | Playwright E2E (後述) |
| `pnpm build` | SPA ビルド (`dist/`) |
| `pnpm preview` | build + `wrangler dev` で本番相当の動作確認 |
| `pnpm deploy` | 本番デプロイ (原則 CI が実行。手元では使わない) |
| `pnpm cf-typegen` | `worker-configuration.d.ts` の再生成 |

### テスト

- **単体**: `shared/` の reducer・zod スキーマ・limits (Vitest)
- **DO 結合**: `@cloudflare/vitest-pool-workers` で Durable Object を実際に起動して検証
- **E2E**: Playwright。webServer が `pnpm build && wrangler dev --port 8788` を自動起動し、
  2 コンテキスト間のストローク同期・付箋同期・375px でのツールバー操作を検証

E2E の初回のみブラウザの取得が必要:

```bash
pnpm exec playwright install --with-deps chromium
```

プリインストール済み Chromium を使う環境では、ダウンロードの代わりに
`PLAYWRIGHT_CHROMIUM_EXECUTABLE=<path>` で実行バイナリを指定できる。

## デプロイ

デプロイは CI に委ねる: **main への push (= リリース PR の merge) で `deploy.yml` が本番デプロイを実行する**。
Secrets の登録・GitHub App の導入・ブランチ保護といったリポジトリ運用者向けのセットアップと
課金リスクの説明は [docs/operations.md](docs/operations.md) にまとめている (ローカル開発には不要)。

## 自動運用 (GitHub Actions)

| ワークフロー | トリガー | 内容 |
|---|---|---|
| `ci.yml` | PR / push | typecheck・lint・test・E2E |
| `deploy.yml` | main への push | 本番デプロイ |
| `claude-review.yml` | PR 作成 | Claude による自動コードレビュー |
| `claude-issue-triage.yml` | Issue 起票 | 即時トリアージ (ラベル + 初期仮説コメント) |
| `claude-auto-resolve.yml` | 毎日 03:00 JST | 未対応 Issue を自動処理 (修正 PR / 回答 / 計画) |
| `claude-autofix-ci.yml` | CI 失敗 (AI ブランチの PR) | 失敗ログを診断して修正 push。同一ブランチ 2 回まで、超えたら人間へ引き継ぎ |
| `claude.yml` | @claude メンション | Issue / PR コメントからの依頼に応答 (調査・回答・実装) |
| `claude-health.yml` | 毎朝 09:00 JST | Cloudflare の稼働・無料枠使用率を点検し Issue に報告 |
| `claude-weekly-report.yml` | 毎週金曜 | 変更・稼働・Issue 状況の週次レポート |
| `release-draft.yml` | 毎週金曜 18:00 JST / 手動 | develop → main のリリース PR を自動下書き (LLM 不使用。merge は人間) |

Git 運用は Issue 駆動 + develop フロー (**1 Issue = 1 ブランチ = 1 PR**、PR の base は develop、
develop → main のリリース PR の merge だけが人間の担当 = 本番デプロイの最終ゲート)。
詳細は [CLAUDE.md](CLAUDE.md) の「Git 運用」を参照。

## ハーネス構成

中心となる設計原則は「**決定論 (deterministic) と確率論 (probabilistic) の使い分け**」。
守らせたいことは LLM への指示 (確率的) ではなく、hooks と CI (決定論的) に置く。

| 仕組み | 性質 | 担当 |
|---|---|---|
| hooks | 決定論的 (100%実行) | セッション開始時の環境整備 (依存の自動インストール)、破壊的操作の遮断、Git 運用ルールの強制、Stop 品質ゲート (検証が通るまで完了不可) |
| GitHub Actions | 決定論的 | CI 検証、デプロイ (本番操作はローカルの Claude に触らせない) |
| CLAUDE.md | 常時ロード / 確率的 | コマンド、構造、リアルタイム設計の要点 |
| rules | glob 一致時のみロード | client / realtime (DO) / components / testing / infra の各規約 |
| skills | 呼び出し時のみロード | 縦切り実装手順 (vertical-slice)、Issue 駆動 Git 手順 (issue-driven) |
| agents | 隔離コンテキスト | レビュー (実装者と採点者の分離)、テスト全件実行 |
| design/DESIGN.md | 参照ドキュメント | ビジュアルの単一の正 (rules から強制参照) |

## ディレクトリ構成

```
src/                    React SPA
  board/                キャンバス描画 (チョーク質感・ヒットテスト・パン/ズーム)
  components/           UI コンポーネント (ツールバー・付箋・カーソル・ダイアログ)
  store/                zustand ストア
  ws/                   WebSocket 接続管理 (再接続)
  styles/               tokens.css (デザイントークン。hex はここ以外に書かない)
worker/                 Worker エントリ + Durable Object (board-do.ts) + レート制限
shared/                 ops 型定義・zod スキーマ・reducer・limits (クライアント/DO 共用)
tests/                  単体 (shared / src / worker) + E2E (Playwright)
docs/                   開発者向けドキュメント (アーキテクチャ / WebSocket プロトコル)
design/DESIGN.md        デザインシステム (ビジュアルの単一の正)
scripts/hooks/          Claude Code hooks (session-start / guard-bash / post-edit-check / verify-stop)
.claude/                settings.json / rules / agents / skills / workflows
.github/workflows/      CI・デプロイ・自動運用 (上表)
CLAUDE.md               Claude Code へのプロジェクト指示 (常時ロード)
```

## 注意

- hooks はローカルでシェルを実行する。`.claude/settings.json` を共有する際はチームレビューを通すこと
- claude-*.yml のワークフローは書き込み権限を持つ。フォークからの PR で secrets が
  漏れない設計を維持すること
- クラウド自動化の「直 push / リリース PR merge 禁止」は、プロンプトだけでなく GitHub のブランチ保護でも
  担保する（必須設定。`guard-bash.sh` は CI ランナー上では発火しないため。→ [docs/operations.md](docs/operations.md)）
- アプリ側のサージ防御 (接続数上限 / 受信レート制限 / スロットル) を外さないこと
- 仕様の一次情報: https://code.claude.com/docs / https://developers.cloudflare.com/durable-objects/
