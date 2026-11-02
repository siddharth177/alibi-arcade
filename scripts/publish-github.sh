#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

alibi_visibility=private
alibi_repo_only=false
for alibi_option in "$@"; do
  case "$alibi_option" in
    --public) alibi_visibility=public ;;
    --private) alibi_visibility=private ;;
    --repo-only) alibi_repo_only=true ;;
    *) printf 'Usage: bash scripts/publish-github.sh [--private|--public] [--repo-only]\n' >&2; exit 1 ;;
  esac
done
command -v gh >/dev/null || { printf 'Install GitHub CLI (gh): brew install gh\n' >&2; exit 1; }
if ! gh auth status --hostname github.com >/dev/null 2>&1; then
  gh auth login --hostname github.com --git-protocol https --web --scopes workflow
fi
alibi_login="$(gh api user --jq .login)"
[ "$alibi_login" = siddharth177 ] || { printf 'Sign into GitHub as siddharth177 before creating the repository.\n' >&2; exit 1; }
alibi_repo=siddharth177/alibi-arcade

npm test
npm run build:pages
if git rev-parse --show-toplevel >/dev/null 2>&1; then
  alibi_git_root="$(git rev-parse --show-toplevel)"
  [ "$(cd "$alibi_git_root" && pwd -P)" = "$(pwd -P)" ] || { printf 'Run this from the project repository, outside another repository.\n' >&2; exit 1; }
else
  git init -b main
fi
if ! git config user.name >/dev/null; then git config user.name "$alibi_login"; fi
if ! git config user.email >/dev/null; then
  alibi_noreply="$(gh api user --jq '"\(.id)+\(.login)@users.noreply.github.com"')"
  git config user.email "$alibi_noreply"
fi
git add .
if ! git diff --cached --quiet; then git commit -m 'Prepare Alibi Arcade for GitHub Pages'; fi

alibi_git_remote=github
if ! git remote get-url github >/dev/null 2>&1 && git remote get-url origin >/dev/null 2>&1; then
  case "$(git remote get-url origin)" in
    https://github.com/siddharth177/alibi-arcade|https://github.com/siddharth177/alibi-arcade.git|git@github.com:siddharth177/alibi-arcade.git) alibi_git_remote=origin ;;
  esac
fi
if git remote get-url "$alibi_git_remote" >/dev/null 2>&1; then
  alibi_remote="$(git remote get-url "$alibi_git_remote")"
  case "$alibi_remote" in
    https://github.com/siddharth177/alibi-arcade|https://github.com/siddharth177/alibi-arcade.git|git@github.com:siddharth177/alibi-arcade.git) ;;
    *) printf 'The selected remote points to another repository; review it before publishing.\n' >&2; exit 1 ;;
  esac
  if ! gh repo view "$alibi_repo" --json nameWithOwner --jq .nameWithOwner; then
    gh repo create "$alibi_repo" "--$alibi_visibility" --description 'Alibi Arcade — multiplayer party games, starting with Mafia'
  fi
else
  gh repo create "$alibi_repo" "--$alibi_visibility" --description 'Alibi Arcade — multiplayer party games, starting with Mafia' --source . --remote github
fi
gh auth setup-git --hostname github.com
# Normalize this project's remote to HTTPS so gh supplies Git credentials.
git remote set-url "$alibi_git_remote" "https://github.com/$alibi_repo.git"
git push "$alibi_git_remote" HEAD:main
printf 'Repository created or updated: '
gh repo view "$alibi_repo" --json url --jq .url
if [ "$alibi_repo_only" = true ]; then exit 0; fi

if ! npm run check:room-service; then
  printf 'Your source is pushed. Pages publishing is paused until the shared room service is available to players.\n' >&2
  exit 2
fi
if gh api "repos/$alibi_repo/pages" >/dev/null 2>&1; then
  gh api "repos/$alibi_repo/pages" --method PUT --field build_type=workflow >/dev/null
else
  if ! gh api "repos/$alibi_repo/pages" --method POST --field build_type=workflow >/dev/null; then
    printf 'Source is saved. Pages could not be enabled. Check repository permissions and Pages eligibility; this script does not change an existing repository visibility.\n' >&2
    exit 1
  fi
fi
gh workflow run publish-pages.yml --repo "$alibi_repo" --ref main
alibi_sha="$(git rev-parse HEAD)"
alibi_run="$(gh run list --repo "$alibi_repo" --workflow publish-pages.yml --event workflow_dispatch --commit "$alibi_sha" --limit 1 --json databaseId --jq '.[0].databaseId // empty')"
if [ -n "$alibi_run" ]; then
  gh run watch "$alibi_run" --repo "$alibi_repo" --exit-status
  printf 'GitHub Pages deployment succeeded: '
  gh api "repos/$alibi_repo/pages" --jq .html_url
else
  printf 'Deployment requested. Check it with: gh run list --repo %s --workflow publish-pages.yml\n' "$alibi_repo"
fi
