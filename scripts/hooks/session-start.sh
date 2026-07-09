#!/usr/bin/env bash
# SessionStart hook:
# フレッシュクローンのセッション (クラウド実行・CI) でも、ESLint hook と
# 検証 3 点セットが最初のターンから動くように依存関係を自動で整える。
set -uo pipefail

cd "$CLAUDE_PROJECT_DIR"

# scaffold 前は何もしない (verify-stop.sh と同じ基準)
[ -f package.json ] || exit 0

if [ ! -d node_modules ]; then
  if command -v pnpm >/dev/null 2>&1; then
    echo "node_modules がないため pnpm install --frozen-lockfile を実行します..."
    if LOG=$(pnpm install --frozen-lockfile 2>&1); then
      echo "依存関係をインストールしました。検証 3 点セット (pnpm typecheck / lint / test) が実行可能です。"
    else
      echo "警告: pnpm install に失敗しました。作業前に手動で実行してください: pnpm install --frozen-lockfile"
      printf '%s\n' "$LOG" | tail -n 5
    fi
  else
    echo "警告: pnpm が見つかりません。作業前にインストールしてください (corepack enable など)。"
  fi
fi

# Playwright: ピン留めバージョンのブラウザが無くプリインストール Chromium がある環境
# (クラウドセッション) では、playwright.config.ts が自動フォールバックする旨を知らせる
if [ -e /opt/pw-browsers/chromium ]; then
  echo "E2E はプリインストール Chromium (/opt/pw-browsers/chromium) に自動フォールバックします。'playwright install' は実行しないでください。"
fi

exit 0
