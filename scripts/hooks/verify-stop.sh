#!/usr/bin/env bash
# Stop hook = 品質ゲート:
# typecheck / lint / test がすべて通るまで Claude はターンを終了できない。
# 「動いたと思います」を「検証が通った」に置き換える、ハーネスの要。
set -uo pipefail

INPUT=$(cat)

# 無限ループ防止: すでに Stop hook 起因で継続中なら素通しする
ACTIVE=$(printf '%s' "$INPUT" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write(String(JSON.parse(d).stop_hook_active??false))}catch{process.stdout.write("false")}})')
[ "$ACTIVE" = "true" ] && exit 0

cd "$CLAUDE_PROJECT_DIR"

# プロジェクト未初期化 (scaffold 前) の間はゲートを開けておく
[ ! -f package.json ] && exit 0

# pnpm が無い環境 (CI 上の読み取り専用 claude セッション。書き込み可能な workflow —
# auto-resolve / claude / autofix — は pnpm をセットアップ済みなのでゲートは効き続ける)
# ではスキップする。そこで 3 点セットは実行できず、失敗が続くとエージェントの最終出力が
# 「ゲートを通せない」という釈明にすり替わる (#56)。CI の品質ゲートは ci.yml の
# verify / e2e ジョブが決定論的に担保している
command -v pnpm >/dev/null 2>&1 || exit 0

FAILED=""

TC=$(pnpm typecheck 2>&1) || FAILED="$FAILED
--- typecheck ---
$TC"
LT=$(pnpm lint 2>&1)      || FAILED="$FAILED
--- lint ---
$LT"
TS=$(pnpm test 2>&1)      || FAILED="$FAILED
--- test ---
$TS"

if [ -n "$FAILED" ]; then
  echo "品質ゲート未通過。以下をすべて修正してから完了してください。" >&2
  printf '%s\n' "$FAILED" | tail -n 60 >&2
  exit 2
fi

exit 0
