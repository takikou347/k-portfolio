---
name: issue-driven
description: Git 操作の標準手順。修正・機能追加・リファクタリングへの着手、ブランチ作成、コミット、PR 作成を行うときは必ずこのスキルに従うこと。
---

# Issue 駆動開発手順 (Issue-Driven Git Flow)

原則: **1 Issue = 1 ブランチ = 1 PR**。Issue に紐付かない変更を作らない。

## 手順

1. **Issue の確認/作成**: 対応する Issue が既にあるか確認する。なければ着手前に作成する。
   タイトル・背景・完了条件を書き、ラベル (bug / enhancement / question) を付ける
2. **ブランチ作成**: main を最新化してから `<type>/issue-<番号>-<説明>` で切る
   - type: feat / fix / docs / refactor / test / chore / ci / perf
   - 例: `git fetch origin main && git switch -c feat/issue-12-reaction-emoji origin/main`
3. **実装**: 機能追加・op 追加・画面/演出追加は vertical-slice スキルの縦切り手順に従う
4. **コミット**: Conventional Commits 形式 `<type>: <説明> (#<Issue番号>)`。
   1 コミット = 1 論理変更。フォーマット差分や無関係な修正を混ぜない
5. **PR 作成**: 対象 Issue 1 件のみを `Closes #<番号>` で紐付ける。
   PR 本文に変更概要と検証 3 点セット (`pnpm typecheck && pnpm lint && pnpm test`) の結果を貼る
6. **レビュー対応**: code-reviewer エージェントと CI の [must] 指摘をすべて解消する。
   merge は人間の担当 — 自分で merge しない

## 禁止事項

- Issue を作らずにブランチ・PR を作ること
- 複数 Issue の対応を 1 つのブランチ/PR に混ぜること
- main へ直接 push すること
- `Closes #<番号>` のない PR を作ること
