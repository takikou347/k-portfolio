---
name: issue-driven
description: Git 操作の標準手順。修正・機能追加・リファクタリングへの着手、ブランチ作成、コミット、PR 作成、リリースを行うときは必ずこのスキルに従うこと。
---

# Issue 駆動開発手順 (Issue-Driven Git Flow)

原則: **1 Issue = 1 ブランチ = 1 PR**。Issue に紐付かない変更を作らない。
ブランチ構成: **main = デプロイ (リリース PR のみ) / develop = 統合 (日々の PR の base)**。
main と develop へは直 push しない・削除しない。

> **リモートセッション (Claude Code on the Web) の単一ブランチ制約**: セッションの作業
> ブランチが 1 本に固定されている場合も 1 Issue = 1 PR を守る — PR を 1 件ずつ直列に出し、
> merge されたら同名ブランチを最新の develop から `git checkout -B` で切り直して次の Issue に
> 着手する (merge 済み履歴しか含まないので安全)。複数 Issue を 1 つの PR に束ねない。

## 日々の開発手順

1. **Issue の確認/作成**: 対応する Issue が既にあるか確認する。なければ着手前に作成する。
   タイトル・背景・完了条件を書き、ラベル (bug / enhancement / question) を付ける
2. **ブランチ作成**: develop を最新化してから `<type>/issue-<番号>-<説明>` で切る
   - type: feat / fix / docs / refactor / test / chore / ci / perf
   - 例: `git fetch origin develop && git switch -c feat/issue-12-reaction-emoji origin/develop`
3. **実装**: 機能追加・op 追加・画面/演出追加は vertical-slice スキルの縦切り手順に従う
4. **コミット**: Conventional Commits 形式 `<type>: <説明> (#<Issue番号>)`。
   1 コミット = 1 論理変更。フォーマット差分や無関係な修正を混ぜない
5. **PR 作成**: **base は develop**。対象 Issue 1 件のみを `Closes #<番号>` で紐付ける。
   PR 本文に変更概要と検証 3 点セット (`pnpm typecheck && pnpm lint && pnpm test`) の結果を貼る
6. **レビュー対応と merge**: code-reviewer エージェントと CI の [must] 指摘をすべて解消する。
   CI が green かつ [must] ゼロを確認できたら、develop 向け PR は Claude が merge してよい

## リリース手順 (develop → main)

対象マイルストーンの Issue がすべて develop に入ったら:

1. **リリース PR を作成**: base = main、head = develop。タイトルは `release: YYYY-MM-DD` 形式
2. **本文にリリースノートを書く**: 含まれる Issue / PR を列挙し、ユーザー影響のある変更を先頭に
3. merge は人間の担当。merge 後、deploy.yml のデプロイは **production 環境の承認待ち**になるので、
   Actions の「Review deployments」から人間が承認して本番デプロイを実行する。
   **リリースは merge で終わりではなく、この承認とデプロイ成功の確認までがリリース** —
   Claude がリリースを見届ける場合はデプロイ run の成否まで追跡して報告する。
   承認されないまま残った古い run は、次のリリース merge で自動キャンセルされる
   (`deploy.yml` の `cancel-in-progress: true`、#66)
4. **merge 後も develop は削除しない**。merge 後に GitHub Release を作成すると
   `.github/release.yml` のカテゴリ設定でリリースノートを自動生成できる

## 禁止事項

- リリース PR (develop → main) を Claude が merge すること — 本番デプロイの最終ゲートは人間
- CI とレビューの確認を経ずに PR を merge すること
- main / develop へ直接 push すること (hooks が遮断する)
- main / develop を削除すること
- main からブランチを切ること (作業ブランチは必ず develop 起点)
- Issue を作らずにブランチ・PR を作ること
- 複数 Issue の対応を 1 つのブランチ/PR に混ぜること
- `Closes #<番号>` のない機能/修正 PR を作ること (リリース PR は除く)
