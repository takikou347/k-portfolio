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

# 新規ブランチ名: <type>/issue-<番号>-<説明> / auto/issue-<番号> / claude/* のみ許可
NEW_BRANCH=$(printf '%s' "$CMD" | grep -oE '(checkout[[:space:]]+-b|switch[[:space:]]+-c)[[:space:]]+[^[:space:]]+' | head -n1 | awk '{print $NF}' || true)
if [ -n "$NEW_BRANCH" ]; then
  if ! printf '%s' "$NEW_BRANCH" | grep -qE '^((feat|fix|docs|style|refactor|perf|test|chore|ci)/issue-[0-9]+(-[A-Za-z0-9._-]+)?|auto/issue-[0-9]+|claude/[^[:space:]]+)$'; then
    echo "BLOCKED: ブランチ名がルール違反です: $NEW_BRANCH" >&2
    echo "ブランチは '<type>/issue-<番号>-<説明>' 形式にしてください (例: feat/issue-12-reaction-emoji)。" >&2
    echo "対応する Issue がない場合は、先に Issue を作成してから着手してください (issue-driven スキル参照)。" >&2
    exit 2
  fi
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
