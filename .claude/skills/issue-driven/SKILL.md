---
name: issue-driven
description: Git 操作の標準手順。修正・機能追加・リファクタリングへの着手、ブランチ作成、コミット、PR 作成、リリースを行うときは必ずこのスキルに従うこと。
---

# Issue 駆動開発手順 (Issue-Driven Git Flow)

原則: **1 Issue = 1 ブランチ = 1 PR**。Issue に紐付かない変更を作らない。
ブランチ構成: **main = デプロイ (リリース PR のみ) / develop = 統合 (日々の PR の base)**。
main と develop へは直 push しない・削除しない。

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
6. **レビュー対応**: code-reviewer エージェントと CI の [must] 指摘をすべて解消する。
   merge は人間の担当 — 自分で merge しない

## リリース手順 (develop → main)

対象マイルストーンの Issue がすべて develop に入ったら:

1. **リリース PR を作成**: base = main、head = develop。タイトルは `release: YYYY-MM-DD` 形式
2. **本文にリリースノートを書く**: 含まれる Issue / PR を列挙し、ユーザー影響のある変更を先頭に
3. merge は人間の担当。merge されると deploy.yml が本番デプロイを実行する
4. **merge 後も develop は削除しない**。merge 後に GitHub Release を作成すると
   `.github/release.yml` のカテゴリ設定でリリースノートを自動生成できる

## 禁止事項

- main / develop へ直接 push すること (hooks が遮断する)
- main / develop を削除すること
- main からブランチを切ること (作業ブランチは必ず develop 起点)
- Issue を作らずにブランチ・PR を作ること
- 複数 Issue の対応を 1 つのブランチ/PR に混ぜること
- `Closes #<番号>` のない機能/修正 PR を作ること (リリース PR は除く)
