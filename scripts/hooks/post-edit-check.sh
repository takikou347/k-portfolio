#!/usr/bin/env bash
# PostToolUse (Edit|Write) hook:
# 編集直後にそのファイルだけを Prettier + ESLint で検査。
# 「後でまとめて直す」を許さず、エラーを発生した瞬間に Claude へ返す。
set -uo pipefail

INPUT=$(cat)
FILE=$(printf '%s' "$INPUT" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write(JSON.parse(d).tool_input?.file_path??"")}catch{}})')

[ -z "$FILE" ] && exit 0
[[ "$FILE" != *.ts && "$FILE" != *.tsx && "$FILE" != *.md ]] && exit 0
[ ! -f "$FILE" ] && exit 0

cd "$CLAUDE_PROJECT_DIR"
[ ! -f package.json ] && exit 0

# markdown は markdownlint で検査する (--fix で直せるものは黙って直す)
if [[ "$FILE" == *.md ]]; then
  pnpm exec markdownlint-cli2 --fix "$FILE" >/dev/null 2>&1
  MD_OUT=$(pnpm exec markdownlint-cli2 "$FILE" 2>&1)
  if [ $? -ne 0 ]; then
    echo "markdownlint エラーを検出しました。続行する前に修正してください:" >&2
    echo "$MD_OUT" >&2
    exit 2
  fi
  exit 0
fi

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
