#!/usr/bin/env bash
# main / develop のブランチ保護 (Ruleset) を gh api で一括作成する補助スクリプト。
# README「デプロイと Secrets > ブランチ保護 (必須)」の手順を再現性のある形にしたもの。
#
# 前提: gh CLI が認証済み (gh auth login) で、対象リポジトリへの admin 権限があること。
# 使い方: bash scripts/setup-branch-protection.sh <owner>/<repo>
#
# 冪等性: 同名 Ruleset が既にあれば作成をスキップする (重複作成しない)。
set -euo pipefail

REPO="${1:-}"
if [ -z "$REPO" ]; then
  echo "usage: bash scripts/setup-branch-protection.sh <owner>/<repo>" >&2
  exit 1
fi
if ! command -v gh >/dev/null 2>&1; then
  echo "エラー: gh CLI が見つかりません。https://cli.github.com/ を参照してください。" >&2
  exit 1
fi

existing_rulesets() {
  gh api "repos/$REPO/rulesets" --jq '.[].name' 2>/dev/null || true
}

# $1: Ruleset 名, $2: 対象ブランチ (main/develop), $3: 必要な承認数
create_ruleset() {
  local name="$1" branch="$2" approvals="$3"
  if existing_rulesets | grep -qx "$name"; then
    echo "スキップ: Ruleset '$name' は既に存在します"
    return 0
  fi
  echo "作成: Ruleset '$name' (ブランチ $branch / 承認 $approvals 件 / 直 push・削除禁止)"
  gh api --method POST "repos/$REPO/rulesets" \
    --input - >/dev/null <<JSON
{
  "name": "$name",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": { "include": ["refs/heads/$branch"], "exclude": [] }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": $approvals,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false
      }
    }
  ]
}
JSON
}

# develop: PR 必須・直 push/削除禁止だが承認 0 件 (CI green + [must] ゼロなら Claude が merge)
create_ruleset "protect-develop" "develop" 0
# main: PR 必須・直 push/削除禁止に加え、人間の承認 1 件を必須 (リリースの最終ゲート)
create_ruleset "protect-main" "main" 1

echo "完了: main / develop のブランチ保護を設定しました。"
