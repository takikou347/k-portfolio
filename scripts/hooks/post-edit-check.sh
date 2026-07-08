#!/usr/bin/env bash
# PostToolUse (Edit|Write) hook:
# 編集直後にそのファイルだけを Prettier + ESLint で検査。
# 「後でまとめて直す」を許さず、エラーを発生した瞬間に Claude へ返す。
set -uo pipefail

INPUT=$(cat)
FILE=$(printf '%s' "$INPUT" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write(JSON.parse(d).tool_input?.file_path??"")}catch{}})')

[ -z "$FILE" ] && exit 0
[[ "$FILE" != *.ts && "$FILE" != *.tsx ]] && exit 0
if [[ "$FILE" == */components/ui/* ]]; then
  echo "WARNING: components/ui/ は shadcn 生成物です。編集は禁止されています: $FILE" >&2
  exit 2
fi
[ ! -f "$FILE" ] && exit 0

cd "$CLAUDE_PROJECT_DIR"
[ ! -f package.json ] && exit 0

# フォーマットは黙って適用 (指摘ではなく自動修正)
pnpm exec prettier --write "$FILE" --log-level silent 2>/dev/null || true

# Lint エラーは exit 2 で Claude に差し戻す
LINT_OUT=$(pnpm exec eslint "$FILE" 2>&1)
if [ $? -ne 0 ]; then
  echo "ESLint エラーを検出しました。続行する前に修正してください:" >&2
  echo "$LINT_OUT" >&2
  exit 2
fi

exit 0
