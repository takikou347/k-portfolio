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

# --- Issue 駆動 Git 運用の決定論的チェック (CLAUDE.md「Git 運用」参照) ---

# main / develop の保護: 直 push・削除を禁止 (変更は PR 経由、merge は人間の担当)
PROTECT_PATTERNS=(
  'git[[:space:]]+push[[:space:]][^;&|]*([[:space:]:/])(main|develop)([[:space:]]|$)'  # 直 push (refspec 含む)
  'git[[:space:]]+push[[:space:]][^;&|]*--delete[[:space:]]+[^;&|]*(main|develop)'     # リモートブランチ削除
  'git[[:space:]]+branch[[:space:]]+-[a-zA-Z]*[dD][[:space:]]+(main|develop)([[:space:]]|$)' # ローカルブランチ削除
)
for pattern in "${PROTECT_PATTERNS[@]}"; do
  if printf '%s' "$CMD" | grep -qE "$pattern"; then
    echo "BLOCKED: main / develop への直 push・削除は禁止されています。" >&2
    echo "変更は develop から切ったブランチの PR (base: develop) で行い、merge は人間が行います。" >&2
    echo "リリースは develop → main の PR で行います (issue-driven スキル参照)。" >&2
    exit 2
  fi
done

# 引数なしの push (現在ブランチへの push) も main / develop 上では禁止
if printf '%s' "$CMD" | grep -qE '(^|[[:space:];&|(])git[[:space:]]+push([[:space:]]+(-u|--set-upstream|origin))*[[:space:]]*($|[;&|])'; then
  CURRENT_BRANCH=$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
  if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "develop" ]; then
    echo "BLOCKED: 現在 $CURRENT_BRANCH 上にいます。main / develop への直 push は禁止されています。" >&2
    exit 2
  fi
fi

# 新規ブランチ名: <type>/issue-<番号>-<説明> / auto/issue-<番号> / claude/* / develop のみ許可
# (-B / -C の強制作成でもすり抜けないように大文字も検査する)
NEW_BRANCH=$(printf '%s' "$CMD" | grep -oE '(checkout[[:space:]]+-[bB]|switch[[:space:]]+-[cC])[[:space:]]+[^[:space:]]+' | head -n1 | awk '{print $NF}' || true)
if [ -n "$NEW_BRANCH" ]; then
  if ! printf '%s' "$NEW_BRANCH" | grep -qE '^((feat|fix|docs|style|refactor|perf|test|chore|ci)/issue-[0-9]+(-[A-Za-z0-9._-]+)?|auto/issue-[0-9]+|claude/[^[:space:]]+|develop)$'; then
    echo "BLOCKED: ブランチ名がルール違反です: $NEW_BRANCH" >&2
    echo "ブランチは '<type>/issue-<番号>-<説明>' 形式にしてください (例: feat/issue-12-reaction-emoji)。" >&2
    echo "対応する Issue がない場合は、先に Issue を作成してから着手してください (issue-driven スキル参照)。" >&2
    exit 2
  fi
fi

# 作業ブランチの起点は develop (main からの分岐を禁止)
NEW_BASE=$(printf '%s' "$CMD" | grep -oE '(checkout[[:space:]]+-[bB]|switch[[:space:]]+-[cC])[[:space:]]+[^[:space:]]+[[:space:]]+[^[:space:];&|]+' | head -n1 | awk '{print $NF}' || true)
if [ -n "$NEW_BASE" ] && printf '%s' "$NEW_BASE" | grep -qE '^(origin/)?main$'; then
  echo "BLOCKED: 作業ブランチは main ではなく develop から切ってください。" >&2
  echo "例: git fetch origin develop && git switch -c feat/issue-12-reaction-emoji origin/develop" >&2
  exit 2
fi

# コミットメッセージ: Conventional Commits プレフィックスを強制 (-m 指定時)
if printf '%s' "$CMD" | grep -qE '(^|[[:space:];&|(])git[[:space:]]+commit([[:space:]]|$)'; then
  if printf '%s' "$CMD" | grep -qE '(^|[[:space:]])-m([[:space:]]|$)'; then
    if ! printf '%s' "$CMD" | grep -qE '(feat|fix|docs|style|refactor|perf|test|chore|ci|build|revert)(\([^)]*\))?!?: |(^|[[:space:]"'"'"'])(Merge|Revert) '; then
      echo "BLOCKED: コミットメッセージがルール違反です。" >&2
      echo "Conventional Commits のプレフィックスを付けてください: feat: / fix: / docs: / style: / refactor: / perf: / test: / chore: / ci:" >&2
      echo "例: git commit -m \"feat: リアクションに 🎉 を追加 (#12)\"" >&2
      exit 2
    fi
  fi
fi

exit 0
