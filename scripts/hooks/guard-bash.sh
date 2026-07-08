#!/usr/bin/env bash
# PreToolUse (Bash) hook:
# CLAUDE.md の「禁止」は確率的にしか守られない。
# 破壊的コマンドはここで 100% 遮断する (exit 2 = ブロックし、理由を Claude に返す)。
set -euo pipefail

INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write(JSON.parse(d).tool_input?.command??"")}catch{}})')

[ -z "$CMD" ] && exit 0

BLOCKLIST=(
  'rm[[:space:]]+-rf[[:space:]]+[/~]'         # ルート・ホーム配下の再帰削除
  'git[[:space:]]+push[[:space:]]+.*--force'  # force push
  'git[[:space:]]+reset[[:space:]]+--hard'    # 履歴の破壊的リセット
  'git[[:space:]]+checkout[[:space:]]+\.[[:space:]]*$'
  'git[[:space:]]+clean[[:space:]]+-[a-z]*f'
  'chmod[[:space:]]+777'
  'curl[[:space:]]+.*\|[[:space:]]*(ba)?sh'   # パイプ実行
  'wrangler[[:space:]]+delete'                # Worker 削除
  'd1[[:space:]]+delete'                      # D1 データベース削除
  'd1[[:space:]]+execute[[:space:]]+.*--remote' # 本番 D1 への直接 SQL 実行
  'secret[[:space:]]+put'                     # シークレット操作は人間の担当
)

for pattern in "${BLOCKLIST[@]}"; do
  if printf '%s' "$CMD" | grep -qE "$pattern"; then
    echo "BLOCKED: このコマンドはハーネスのポリシーで禁止されています: $CMD" >&2
    echo "本番リソースの操作・破壊的操作は、ユーザーへの説明と手動実行、または CI 経由で行ってください。" >&2
    exit 2
  fi
done

exit 0
