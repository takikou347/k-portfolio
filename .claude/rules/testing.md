---
paths:
  - "tests/**"
  - "**/*.test.ts"
  - "**/*.test.tsx"
---

# テスト規約

- テストは `tests/` 配下にソースのディレクトリ構造をミラーして置く
- 主戦場は `shared/`: reducer (`applyOp`) と zod スキーマを網羅する。
  各 op に対して最低限: 正常系 1 件 + 不正入力 (parse 失敗) 1 件 + 境界ケース
  (存在しない id への move、ストローク上限超過の間引き など)
- DO の結合テストは @cloudflare/vitest-pool-workers で「接続 → op 送信 → ブロードキャスト受信 →
  ストレージ反映」を最低 1 本。環境都合で動かない場合は reducer 単体で代替し、理由を報告する
- テスト名は日本語で「何を保証するか」を書く (例: `it("存在しない付箋への move は無視される")`)
- スナップショットテスト禁止。アサーションは具体的な値で書く
- モックは外部境界のみ。shared/ 内部同士のモックは設計の匂いなので、まず構造を疑う
- E2E (Playwright): `tests/e2e/` に配置。playwright.config の webServer で
  `pnpm build && wrangler dev` を起動する (ログイン不要のローカルモード)
- E2E の必須ケース: (1) 2 つの browser context 間でストロークが同期される
  (2) 付箋の作成・移動が同期される (3) 375px ビューポートでツールバー操作ができる
- E2E はネットワーク待ちを `waitForTimeout` で書かない。要素・状態の出現を待つ
