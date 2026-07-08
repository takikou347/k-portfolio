# Claude Code ハーネスエンジニアリング デモ (k-portfolio)

人間はハーネス (制御構造) とアカウントだけを用意し、リアルタイム共有黒板「こくばん」の
実装からテスト、Cloudflare Workers への無料デプロイまでを Claude Code が自律完走するデモ。

## 作るもの: こくばん

複数人が同じ URL を開いて遊べるリアルタイム黒板。チョーク描画・画用紙の付箋・
名前入りマグネットのライブカーソル・絵文字リアクションが全員に即時同期される。
「放課後の黒板」がデザインコンセプト (design/DESIGN.md)。

## アーキテクチャ (すべて無料枠)

```
[ブラウザ] Vite + React SPA (zustand / canvas)
    ↕ WebSocket
[Cloudflare Worker] 静的アセット配信 + /ws を Durable Object へルーティング
[Durable Object]   1 ボード = 1 DO。Hibernation API で接続維持、SQLite ストレージに盤面永続化
```

- shared/ の ops reducer + zod スキーマをクライアントと DO が共用 → ここを厚くテストする
- D1 不要。DO の SQLite ストレージ (無料プランで利用可) に集約

## 中心となる設計原則

「決定論 (deterministic) と確率論 (probabilistic) の使い分け」。

| 仕組み | 性質 | 担当 |
|---|---|---|
| hooks | 決定論的 (100%実行) | 破壊的操作の遮断、Stop 品質ゲート (検証が通るまで完了不可) |
| GitHub Actions | 決定論的 | CI 検証、デプロイ (本番操作はローカルの Claude に触らせない) |
| CLAUDE.md | 常時ロード / 確率的 | コマンド、構造、リアルタイム設計の要点 |
| rules | glob 一致時のみロード | client / realtime (DO) / components / testing / infra の各規約 |
| skills | 呼び出し時のみロード | 縦切り実装手順 |
| agents | 隔離コンテキスト | レビュー (実装者と採点者の分離)、テスト全件実行 |
| DESIGN.md | 参照ドキュメント | ビジュアルの単一の正 (rules から強制参照) |

## ファイル構成

```
CLAUDE.md / KICKOFF.md / SETUP.md / CHANGEOVER.md
design/DESIGN.md                  デザインシステム (チョークの描き味がシグネチャ)
design/mockup.html                黒板のモックアップ (実際に描ける・発表スライド用)
.claude/
  settings.json                   hooks + Bash 許可リスト + .env 読み取り拒否
  rules/{client,realtime,components,testing,infra}.md
  agents/{code-reviewer,test-runner}.md
  skills/vertical-slice/SKILL.md
scripts/hooks/{guard-bash,post-edit-check,verify-stop}.sh
.github/workflows/
  ci.yml / deploy.yml            検証と自動デプロイ
  claude-review.yml              PR 自動レビュー
  claude-issue-triage.yml        Issue 起票を即時トリアージ (ラベル + 初期仮説コメント)
  claude-auto-resolve.yml        毎日 03:00 JST: 未対応 Issue を自動処理 (修正 PR / 回答 / 計画)
  claude-health.yml              毎朝: Cloudflare の稼働・無料枠使用率を点検し Issue に報告 / 異常時は alert 起票
  claude-weekly-report.yml       毎週金曜: 変更・稼働・Issue 状況の週次レポートを自動作成
```

## 発表デモのシナリオ (推奨順)

1. **ローカル自律実装**: KICKOFF.md を貼り、計画承認後に放置 → hooks が品質を強制する様子
2. **Stop ゲートの実演**: テストが落ちる状態で「完了して」→ verify-stop.sh が終了を拒否、自己修正
3. **無人運用の実演**: 「リアクションに 🎉 を追加してほしい」と普通の Issue を書く
   → 即時トリアージ → claude-auto-resolve を workflow_dispatch で手動発火 (本来は毎日 03:00 JST)
   → 実装 PR が自動で立つ → 自動レビュー → 人間は merge を押すだけ → 自動デプロイ。
   毎朝のヘルスチェックと週次レポートも Issue に積まれていく
4. **クライマックス**: 公開 URL の QR を聴衆に配り、全員でその場の黒板に落書きする。
   「この会場の全員が今、Claude が一人で作ったインフラの上で同時接続しています」で締める

## 注意

- hooks はローカルでシェルを実行する。settings.json を共有する際はチームレビューを通すこと
- claude.yml は書き込み権限を持つ。フォークからの PR で secrets が漏れない設計を維持すること
- Workers 無料枠は 10万リクエスト/日。超過しても課金はされず止まるだけ (fail-closed)。
  Workers Paid に加入しない限り Cloudflare からの請求は構造的に発生しない
- アプリ側のサージ防御 (接続数上限 100 / 受信レート制限 / スロットル) を外さないこと
- 仕様は更新が速い。導入前に公式ドキュメントで最新を確認:
  https://code.claude.com/docs / https://developers.cloudflare.com/durable-objects/
