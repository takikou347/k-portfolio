#!/usr/bin/env bash
# main / develop のブランチ保護 (Ruleset) と関連リポジトリ設定を gh api で一括適用する補助スクリプト。
# docs/operations.md「あわせて行うこと > ブランチ保護 (必須)」の手順を再現性のある形にしたもの。
#
# 前提: gh CLI が認証済み (gh auth login) で、対象リポジトリへの admin 権限があること。
# 使い方: bash scripts/setup-branch-protection.sh <owner>/<repo>
#
# 冪等性: 同名 Ruleset が既にあれば PUT で望ましい状態に上書きし、なければ POST で作成する
# (create-or-update)。リポジトリ設定の PATCH も同値なら変化しないため、何度実行しても安全。
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

ruleset_id_by_name() {
  gh api "repos/$REPO/rulesets" --jq ".[] | select(.name == \"$1\") | .id" 2>/dev/null || true
}

# $1: Ruleset 名, $2: 対象ブランチ (main/develop), $3: 必要な承認数,
# $4: conversation resolution を必須にするか (true/false)
apply_ruleset() {
  local name="$1" branch="$2" approvals="$3" thread_resolution="$4"
  local payload id
  # required status checks の context 名は ci.yml のジョブ名 (verify / e2e) と一致させること。
  # docs-sync はラベル (docs-not-needed) でスキップできる運用のため required に含めない。
  payload=$(cat <<JSON
{
  "name": "$name",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
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
        "required_review_thread_resolution": $thread_resolution
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [
          { "context": "verify" },
          { "context": "e2e" }
        ]
      }
    }
  ]
}
JSON
)
  id="$(ruleset_id_by_name "$name")"
  if [ -n "$id" ]; then
    echo "更新: Ruleset '$name' (id=$id) を望ましい状態に上書き"
    printf '%s' "$payload" | gh api --method PUT "repos/$REPO/rulesets/$id" --input - >/dev/null
  else
    echo "作成: Ruleset '$name' (ブランチ $branch / 承認 $approvals 件 / status checks: verify, e2e)"
    printf '%s' "$payload" | gh api --method POST "repos/$REPO/rulesets" --input - >/dev/null
  fi
}

# develop: PR 必須・直 push/削除禁止・CI (verify/e2e) green 必須・会話解決必須。
#          承認 0 件 (CI green + [must] ゼロなら Claude が merge できる)
apply_ruleset "protect-develop" "develop" 0 true
# main: 上記に加えて人間の承認 1 件を必須 (リリースの最終ゲート)。会話解決は必須にしない
apply_ruleset "protect-main" "main" 1 false

# リポジトリ設定: default branch = develop / merge commit のみ / head ブランチ自動削除
echo "適用: リポジトリ設定 (default_branch=develop, merge commit のみ, head ブランチ自動削除)"
gh api --method PATCH "repos/$REPO" \
  -f default_branch=develop \
  -F allow_squash_merge=false \
  -F allow_rebase_merge=false \
  -F allow_merge_commit=true \
  -F delete_branch_on_merge=true >/dev/null

echo "完了: main / develop のブランチ保護とリポジトリ設定を適用しました。"
