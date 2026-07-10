# 運用セットアップ (デプロイ・Secrets・ブランチ保護)

リポジトリを fork / 運用して本番デプロイや自動運用 (GitHub Actions) を動かす人向けのセットアップ手順。
ローカルの環境構築 ([../README.md](../README.md)「環境構築」) とは別物で、**ローカル開発だけなら
本ドキュメントの設定は一切不要**。

## デプロイの仕組み

デプロイは CI に委ねる: **main への push (= リリース PR の merge) で `deploy.yml` が本番デプロイを実行する**。
Secrets 未設定の間に push しても、各ワークフローは自動スキップされる (赤くならない)。

## Secrets の登録

リポジトリの Settings > Secrets and variables > Actions に登録するもの:

| Secret | 取得方法 |
|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | 手元の Claude Code で `claude setup-token` を実行して生成 (Claude Pro/Max のサブスクリプションが必要)。**定額内で消費され、従量課金は発生しない**。従量課金の API キーを使いたい場合のみ、Anthropic Console でキーを発行し、claude-*.yml の `claude_code_oauth_token` を `anthropic_api_key` に書き換えて `ANTHROPIC_API_KEY` を登録する |
| `CLOUDFLARE_API_TOKEN` | ダッシュボード > My Profile > API Tokens、テンプレート「Edit Cloudflare Workers」。**`deploy.yml`（本番デプロイ）専用** |
| `CLOUDFLARE_ANALYTICS_TOKEN` | **Analytics 読み取り専用**の別トークン（Permissions は Account > Account Analytics = Read のみ、Workers 編集権限は付与しない）。health / weekly レポートの LLM はこちらを参照する。デプロイ権限を持つ `CLOUDFLARE_API_TOKEN` を読み取り用途で使い回すと、プロンプトインジェクション時にデプロイ権限まで奪われるため分離する |
| `CLOUDFLARE_ACCOUNT_ID` | Workers ページ右側の Account ID |

## あわせて行うこと

1. Claude Code で `/install-github-app` を実行して GitHub App を導入 (@claude 応答・自動レビュー用)
2. **ブランチ保護 (必須 — 環境準備の一部)**。Settings > Rulesets で `main` と `develop` に設定する:
   - **Require a pull request before merging** — 直 push 禁止（auto-resolve が直 push できない）
   - **Restrict deletions** — ブランチ削除禁止（リリース PR merge 後に develop が消えるのを防ぐ）
   - `main` は加えて **人間の承認 1 件以上を必須 (Require approvals)** — develop → main のリリース PR
     merge の最終ゲートを人間に固定する
   - `gh auth login` 済みなら補助スクリプトで一括作成できる:
     `bash scripts/setup-branch-protection.sh <owner>/<repo>`（冪等。手動設定した場合は不要）

   > **なぜ必須か**: ローカルでは `scripts/hooks/guard-bash.sh` が main/develop への直 push・不正ブランチ・
   > 非 Conventional コミットを 100% 遮断する。しかし `claude-auto-resolve.yml` は `contents: write` と
   > PR merge 能力を持ち、**CI ランナー上では guard-bash.sh は発火しない**。「直 push しない」「リリース PR を
   > merge しない」がプロンプトの禁止事項だけで担保されている状態では逸脱経路が理論上残るため、ブランチ保護を
   > クラウド自動化レイヤーの決定論的な最後の砦として必須とする（ローカル hooks と合わせて二重の防御）。

## 課金リスクについて

**Cloudflare 無料プランは fail-closed**: 上限 (Workers 10万リクエスト/日など) を超えると
課金されるのではなく、その日の操作がエラーで止まるだけ。Workers Paid に自分で加入しない限り
請求は構造的に発生しない。静的アセットは無料・無制限。

- **GitHub Actions**: public リポジトリなら標準ランナー無制限無料
- **Claude (claude-*.yml)**: `CLAUDE_CODE_OAUTH_TOKEN` は Pro/Max の定額サブスクリプション内で
  消費され、追加請求は発生しない (上限到達時はレート制限で止まるだけ)。従量課金になるのは
  `ANTHROPIC_API_KEY` (プリペイド制) に自分で切り替えた場合のみ
- **スケジューラーの停止**: 放置する場合は Actions タブから
  claude-auto-resolve / claude-health / claude-weekly-report を Disable すればよい
