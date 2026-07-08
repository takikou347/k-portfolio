export const meta = {
  name: 'exhaustive-review',
  description: '変更差分を 5 視点で並列レビューし、各指摘を敵対的に検証してから報告する',
  whenToUse:
    'スライス完了時や push 前に、code-reviewer 単体より広く深いレビューが必要なとき。args に比較先 (省略時 origin/main) を渡せる',
  phases: [
    { title: 'Review', detail: '規約/正当性/セキュリティ/テスト/設計の 5 視点で並列レビュー' },
    { title: 'Verify', detail: '各指摘を敵対的に検証し、誤検知を除外' },
  ],
}

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'line', 'summary', 'severity'],
        properties: {
          file: { type: 'string' },
          line: { type: 'integer' },
          summary: { type: 'string' },
          severity: { type: 'string', enum: ['must', 'nits'] },
          suggestion: { type: 'string' },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['isReal', 'reason'],
  properties: { isReal: { type: 'boolean' }, reason: { type: 'string' } },
}

const base = typeof args === 'string' && args.trim() ? args.trim() : 'origin/main'

const DIMENSIONS = [
  {
    key: 'rules',
    prompt:
      '変更ファイルに対応する .claude/rules/ の規約 (client/realtime/components/testing/infra) を読み、規約からの逸脱をすべて洗い出す',
  },
  {
    key: 'correctness',
    prompt:
      'ロジックの正当性を検証する。特にリアルタイム同期の境界ケース: 再接続時の状態不整合、楽観的適用とサーバーエコーの二重適用、レート制限やストローク上限の off-by-one、ハイバネーション復帰後の状態喪失',
  },
  {
    key: 'security',
    prompt:
      'セキュリティ観点で検証する: zod 検証を通らない受信経路、入力の未検証利用、上限 (接続数/レート/文字数) の欠落、秘匿情報の露出',
  },
  {
    key: 'tests',
    prompt:
      '.claude/rules/testing.md の基準でテスト欠落を洗い出す: 追加された op/reducer/スキーマに正常系・不正入力・境界ケースのテストがあるか',
  },
  {
    key: 'design',
    prompt:
      '設計を検証する: shared/ の reducer をクライアント/DO で二重実装していないか、責務の混在、座標系 (ボード座標) の一貫性',
  },
]

const reviews = await pipeline(
  DIMENSIONS,
  (d) =>
    agent(
      `このリポジトリの差分をレビューしてください。対象: git diff ${base}...HEAD (git diff で差分全体を把握してから該当ファイルを読むこと)。\n観点: ${d.prompt}\n確信が持てない指摘も含めてすべて報告する (重要度でのフィルタは後段が行う)。指摘ゼロなら findings: [] を返す。`,
      { label: `review:${d.key}`, phase: 'Review', schema: FINDINGS_SCHEMA },
    ),
  (review, d) =>
    parallel(
      (review?.findings ?? []).map((f) => () =>
        agent(
          `次のレビュー指摘を敵対的に検証してください。反証を探し、実際のコード (${f.file}:${f.line} 付近) を読んで裏付けを確認すること。誤検知・仕様通り・既に対処済みなら isReal: false。\n指摘 (観点 ${d.key}): [${f.severity}] ${f.summary}`,
          { label: `verify:${f.file}:${f.line}`, phase: 'Verify', schema: VERDICT_SCHEMA, effort: 'low' },
        ).then((v) => ({ ...f, dimension: d.key, verdict: v })),
      ),
    ),
)

const confirmed = reviews
  .filter(Boolean)
  .flat()
  .filter(Boolean)
  .filter((f) => f.verdict?.isReal)

return {
  base,
  must: confirmed.filter((f) => f.severity === 'must'),
  nits: confirmed.filter((f) => f.severity === 'nits'),
}
