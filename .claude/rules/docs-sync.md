---
paths:
  - "shared/**"
  - "worker/**"
  - "src/ws/**"
---

# 仕様とドキュメントの同期規約

これらのパスは docs/ に転記された仕様の正。変更したら**同じ PR で** docs/ の該当箇所を更新する。
CI の `docs-sync` ジョブが決定論的に検査する (仕様パスの変更があるのに docs/ が無変更なら fail)。

## 変更箇所とドキュメントの対応

| 変更するもの | 更新するドキュメント |
| --- | --- |
| `shared/schema.ts` (メッセージ型・フィールド・制約) | docs/protocol.md のメッセージ型の節 |
| `shared/ops.ts` (Op の種類・reducer の挙動) | docs/protocol.md「盤面操作 (Op)」 |
| `shared/limits.ts` (上限値・タイミング定数) | docs/protocol.md「上限値・レート制限一覧」 |
| `worker/board-do.ts` (接続受け入れ・満席・永続化・SQLite スキーマ) | docs/architecture.md「Durable Object のライフサイクル」、満席仕様は docs/protocol.md も |
| `worker/index.ts` (ルーティング) / `worker/rate-limit.ts` | docs/architecture.md、レート制限値は docs/protocol.md も |
| `src/ws/connection.ts` (再接続バックオフ・スロットル・満席時の挙動) | docs/architecture.md「再接続戦略」、docs/protocol.md「切断・再接続」 |

## 運用

- ドキュメントに影響しない変更 (内部リファクタ、コメント修正、テストのみ等) は、
  PR にラベル `docs-not-needed` を付けて明示的にスキップする。黙って CI を赤のまま放置しない
- 数値・フィールド名は docs 側が転記。変更時はドキュメントの表を必ず突き合わせる
