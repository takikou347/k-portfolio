# ドキュメント案内

こくばん (KOKUBAN) のドキュメントの入口。目的別に読む場所を示す。

## まず読むもの

| ドキュメント | 内容 | 対象 |
|---|---|---|
| [../README.md](../README.md) | プロジェクト概要・機能一覧・環境構築・デプロイと Secrets・自動運用 | 全員 |
| [architecture.md](architecture.md) | システム構成・データフロー・Durable Object のライフサイクル・状態管理の設計 | コードを読み書きする人 |
| [protocol.md](protocol.md) | WebSocket メッセージプロトコル仕様 (全メッセージ型・検証・レート制限・上限値) | クライアント/サーバー間の通信に触れる人 |

## 目的別の参照先

- **ビジュアルを変更する** → [../design/DESIGN.md](../design/DESIGN.md) がビジュアルの単一の正。
  デザイントークン (色・字体) は `src/styles/tokens.css` に定義され、hex はそこ以外に書かない
- **開発フロー / Git 運用を知る** → [../CLAUDE.md](../CLAUDE.md) の「Git 運用」。
  1 Issue = 1 ブランチ = 1 PR、PR の base は develop、main はリリース専用
- **上限値・制限を変更する** → `shared/limits.ts` に全定数が集約されている。
  値の意味は [protocol.md の上限値一覧](protocol.md#上限値レート制限一覧) を参照
- **メッセージ型を追加する** → `shared/schema.ts` (zod スキーマ) と `shared/ops.ts` (reducer) が起点。
  手順は vertical-slice スキル (`.claude/skills/`)、仕様は [protocol.md](protocol.md)
- **テストを書く** → `tests/` はソース構造をミラーしている。テストの層構成は
  [architecture.md のテスト戦略](architecture.md#テスト戦略) を参照

## ドキュメントの保守

- コードと矛盾したドキュメントは負債になる。プロトコルや上限値を変更する PR では、
  [protocol.md](protocol.md) / [architecture.md](architecture.md) の該当箇所も同じ PR で更新する
- 数値 (上限・タイミング) の正は常に `shared/limits.ts`。ドキュメント側の表は転記なので、
  食い違ったらコードが正しい
