# セットアップ手順

順序: **先に Claude Code で実装 → 完了後にこの手順で環境準備 → 反映**。
Secrets 未設定の間に push しても、各ワークフローは自動スキップされる (赤くならない)。

## 0. 実装前に必要なもの

- GitHub リポジトリ k-portfolio (作成済み) と、ローカルから push できる git 設定のみ

## 1. 実装完了後の環境準備 (約15分)

### アカウント

- Cloudflare アカウント (無料プラン): <https://dash.cloudflare.com/sign-up>
- Anthropic API キー、または Claude Pro/Max なら `claude setup-token` で OAuth トークン生成

### GitHub 連携

1. Claude Code で `/install-github-app` を実行し、案内に従って GitHub App を導入
2. リポジトリの Settings > Secrets and variables > Actions に登録:

- `ANTHROPIC_API_KEY` (または workflows を `claude_code_oauth_token` に書き換えて `CLAUDE_CODE_OAUTH_TOKEN`)
- `CLOUDFLARE_API_TOKEN` — ダッシュボード > My Profile > API Tokens、
  テンプレート「Edit Cloudflare Workers」
- `CLOUDFLARE_ACCOUNT_ID` — Workers ページ右側の Account ID

### 反映

1. Actions タブから Deploy を手動再実行 (または空コミットを push) → 本番公開
2. 以降の無人運用が自動で始まる:

- Issue 起票 → 即時トリアージ (ラベル + 初期仮説)
- 毎日 03:00 JST → 未対応 Issue を自動処理 (修正 PR 作成 / 回答 / 計画コメント)
- 毎朝 09:00 JST → Cloudflare ヘルスチェック報告
- 毎週金曜 → 週次レポート
- merge は常に人間の担当

## 2. 課金リスクについて (重要)

**Cloudflare 無料プランは fail-closed**: 上限 (Workers 10万リクエスト/日など) を超えると
課金されるのではなく、その日の操作がエラーで止まるだけ。Workers Paid ($5/月) に自分で
加入しない限り請求は発生しない。静的アセットは無料・無制限。

- **GitHub Actions**: public リポジトリなら標準ランナー無制限無料。
  private でも支払い方法未登録なら無料枠で止まるだけ
- **Anthropic API**: プリペイド制のため残高が尽きれば止まる。Pro/Max の OAuth トークンなら定額内
- **スケジューラーの停止**: 放置する場合は Actions タブから
  claude-auto-resolve / claude-health / claude-weekly-report を Disable すれば止まる

アプリ側の防御 (仕様に実装済み): 1 ボード同時接続 100 上限、受信レート制限、
カーソルスロットル、ストローク上限 2000 本。
