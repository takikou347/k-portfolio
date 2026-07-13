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
| --- | --- |
| `CLAUDE_CODE_OAUTH_TOKEN` | 手元の Claude Code で `claude setup-token` を実行して生成 (Claude Pro/Max のサブスクリプションが必要)。**定額内で消費され、従量課金は発生しない**。従量課金の API キーを使いたい場合のみ、Anthropic Console でキーを発行し、claude-*.yml の `claude_code_oauth_token` を `anthropic_api_key` に書き換えて `ANTHROPIC_API_KEY` を登録する |
| `CLOUDFLARE_API_TOKEN` | ダッシュボード > My Profile > API Tokens、テンプレート「Edit Cloudflare Workers」。**`deploy.yml`（本番デプロイ）専用** |
| `CLOUDFLARE_ANALYTICS_TOKEN` | **Analytics 読み取り専用**の別トークン（Permissions は Account > Account Analytics = Read のみ、Workers 編集権限は付与しない）。health / weekly レポートの LLM はこちらを参照する。デプロイ権限を持つ `CLOUDFLARE_API_TOKEN` を読み取り用途で使い回すと、プロンプトインジェクション時にデプロイ権限まで奪われるため分離する |
| `CLOUDFLARE_ACCOUNT_ID` | Workers ページ右側の Account ID |

## あわせて行うこと

1. Claude Code で `/install-github-app` を実行して GitHub App を導入 (@claude 応答・自動レビュー用)
2. **ブランチ保護 (必須 — 環境準備の一部)**。Settings > Rulesets で `main` と `develop` に設定する:
   - **Require a pull request before merging** — 直 push 禁止（auto-resolve が直 push できない）
   - **Restrict deletions** — ブランチ削除禁止（リリース PR merge 後に develop が消えるのを防ぐ）
   - **Require status checks to pass** — `verify` と `e2e` (ci.yml のジョブ名) を required にする。
     CI green の確認を運用ルールではなく GitHub 側で決定論的に強制する。`docs-sync` はラベル
     (`docs-not-needed`) でスキップできる運用のため required に含めない (GitHub は skipped を
     pass 扱いにするが、ラベル運用との干渉を避けるため対象外とする)。
     strict モード (merge 前に PR ブランチの最新化を要求) は使わない — 頻繁な rebase を
     強いるコストに見合わないという運用判断
   - `develop` は **Require conversation resolution** (未解決のレビュースレッドがあると merge 不可)。
     Claude の自動 merge フロー (CI green + [must] ゼロで merge) とも相互作用する — レビューで
     スレッドが立った場合は解決 (resolve) するまで merge がブロックされる
   - `main` に **承認必須は設定しない** — ソロ運用では PR 作成者 = オーナー本人になり、
     GitHub は自己承認を許可しないため「承認 1 件必須」は誰も満たせず merge が構造的に
     不可能になる (#59 で実測)。本番の人間ゲートは下記の **production 環境のデプロイ承認**
     が代わりに担う
   - **Bypass actors は空のまま**にする (誰も保護を迂回できない)
   - `gh auth login` 済みなら補助スクリプトで一括適用できる:
     `bash scripts/setup-branch-protection.sh <owner>/<repo>`（冪等 create-or-update。
     既存 Ruleset があっても望ましい状態に上書きするので、設定ドリフトの復旧にも使える）
3. **production 環境 (デプロイ承認 — 本番の決定論的な最終ゲート)**。上記スクリプトが作成する:
   - `deploy.yml` のデプロイジョブは `environment: production` に紐づき、**required reviewers
     (オーナー) が Actions 画面で承認するまで実行されない**。リリース PR の merge を誰が
     行っても、本番反映の直前で必ず人間の判断が入る
   - リリース PR を merge すると Actions に「Review deployments」の承認待ちが現れるので、
     内容を確認して Approve する (却下すればデプロイされない)
   - 承認しないまま次のリリース PR を merge した場合、**承認待ち (waiting) のまま滞留した**古い run
     だけが `deploy.yml` の `cancel-stale-waiting` ジョブによって自動キャンセルされ、常に最新の run が
     承認待ちになる。承認忘れの run がスロットを塞ぎ、後続デプロイが `pending` で止まる事故 (#66) の
     再発防止。**承認済みで実行中 (in_progress) のデプロイはキャンセルされない** — workflow レベルの
     `cancel-in-progress: true` は waiting と in_progress を区別せず実行中の本番デプロイまで
     中断してしまうため使わず、デプロイの直列化は deploy ジョブ側の concurrency
     (cancel なし) で行う (#83)。なお concurrency は FIFO のため、承認待ち (waiting) に
     なれるのはキュー先頭の 1 run だけ — 複数リリースが滞留した場合は push のたびに
     先頭 1 件ずつキャンセルされ、最終的に最新 run に収束する (即座ではない)
   - **注意**: production 環境が存在しない状態でデプロイが走ると、GitHub が保護なしの環境を
     自動作成して素通りする。**スクリプトの適用を先に**行うこと
4. **リポジトリ設定** (上記スクリプトが Ruleset とあわせて適用する):
   - **default branch = `develop`** — PR の base 既定と schedule workflow の参照先を develop にする
   - **merge commit のみ有効** (squash / rebase merge は無効) — Conventional Commits の履歴を保つ
   - **head ブランチの自動削除** (`delete_branch_on_merge`) — Issue ブランチの掃除を自動化する
     (main / develop は Ruleset の Restrict deletions で保護されるため消えない)

   > **なぜ必須か**: ローカルでは `scripts/hooks/guard-bash.sh` が main/develop への直 push・不正ブランチ・
   > 非 Conventional コミットを 100% 遮断する。しかし `claude-auto-resolve.yml` は `contents: write` と
   > PR merge 能力を持ち、**CI ランナー上では guard-bash.sh は発火しない**。プロンプトの禁止事項だけでは
   > 逸脱経路が理論上残るため、決定論的な最後の砦を GitHub 側に置く: 直 push・削除・CI red の merge は
   > **ブランチ保護 Ruleset** が遮断し、本番反映は **production 環境のデプロイ承認** が遮断する
   > (仮に自動化がリリース PR を merge してしまっても、人間が承認するまで本番には出ない)。

## 外部入力からの保護 (public リポジトリの攻撃面)

public リポジトリでは誰でも Issue 起票・フォーク PR 作成ができる。Claude 系ワークフローは
書き込み権限とサブスクリプショントークンを持つため、信頼できない入力が届く経路を
決定論的に (LLM の判断に頼らず) 遮断している:

- **フォーク PR** — `claude-review.yml` は CI 成功時の `workflow_run` トリガーで動く
  (push ごとのフルレビューをやめ、CI green の push だけをレビューする消費最適化、#81)。
  `workflow_run` は base リポジトリの secrets で実行されるため、`head_repository` が
  本体リポジトリと一致する場合のみ起動するガードでフォーク PR を決定論的に除外する
  (`claude-autofix-ci.yml` と同じ pwn request 対策)。同一コミットの重複レビューは、
  投稿コメント末尾の `[claude-review-sha]` マーカーを gate ステップが検査して skip する。
  マーカーは**レビューが正常終了したときだけ**付与される — 失敗した実行に付けると
  そのコミットの再レビューが永久にスキップされるため (#85)。レビューが失敗した場合は
  Actions から CI を Re-run すれば再レビューされる
- **@claude メンション** (`claude.yml`) — 起動者を author_association
  (OWNER / MEMBER / COLLABORATOR) で限定し、フォーク PR 上のイベントは除外する
- **Issue トリアージ** (`claude-issue-triage.yml`) — 同じ author_association ゲートで
  外部者の起票では起動しない (#78)
- **日次バッチ** (`claude-auto-resolve.yml`) — Claude 起動前のシェルステップが起票者の
  author_association を検査し、通過した Issue 番号の許可リストをプロンプトに注入する。
  リスト外の Issue は本文に何が書かれていても処理されない (#78)。
  ラベル方式の許可リストは採用しない — `issues: write` を持つトリアージが
  プロンプトインジェクションでラベルを付けさせられると迂回できてしまうため。
  さらに、**信頼できない利用者のコメントが付いた Issue も除外する** (起票者が信頼できても
  コメント欄から指示を注入できるため)。除外された Issue は Actions の warning に出るので、
  コメントを確認して問題なければ人間が対応する。外部者のコメント連投で正当な Issue の
  自動処理を止めることは可能だが、fail-closed (安全側で止まる) を優先する設計。
  なお GitHub API の取得に失敗した場合もステップごと失敗し、その日のバッチ全体が
  スキップされる (これも fail-closed — バッチが黒く落ちていたらこれを疑う)
- **CI 自動修復** (`claude-autofix-ci.yml`) — `head_repository` が本体リポジトリと一致する
  場合のみ起動 (pwn request 対策) し、対象ブランチ名も正規表現で限定する

これらをすり抜けた場合の最後の砦は前節の通り: main / develop への直 push はブランチ保護
Ruleset が、本番反映は production 環境のデプロイ承認 (人間) が遮断する。

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
