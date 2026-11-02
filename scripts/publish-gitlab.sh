#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

alibi_visibility=private
case "${1:-}" in
  --public) alibi_visibility=public ;;
  ''|--private) ;;
  *) printf 'Usage: bash scripts/publish-gitlab.sh [--private|--public]\n' >&2; exit 1 ;;
esac
command -v glab >/dev/null || { printf 'Install GitLab CLI first: brew install glab\n' >&2; exit 1; }
glab auth login --hostname gitlab.com --web --git-protocol https --setup-git-credential-helper
alibi_user="$(glab api user --jq .username)"
case "$alibi_user" in
  ''|*[!a-zA-Z0-9_.-]*) printf 'Could not verify the GitLab account.\n' >&2; exit 1 ;;
esac
alibi_repo="$alibi_user/alibi-arcade"
alibi_api_project="$alibi_user%2Falibi-arcade"
printf 'Publishing under GitLab account: %s\n' "$alibi_user"
npm test
npm run build:pages
npm run check:room-service

if git rev-parse --show-toplevel >/dev/null 2>&1; then
  alibi_git_root="$(git rev-parse --show-toplevel)"
  [ "$(cd "$alibi_git_root" && pwd -P)" = "$(pwd -P)" ] || { printf 'Run this from the project repository, outside another repository.\n' >&2; exit 1; }
else
  git init -b main
fi
if ! git config user.name >/dev/null; then git config user.name "$alibi_user"; fi
if ! git config user.email >/dev/null; then
  printf 'Set your commit email with git config user.email, then rerun this script.\n' >&2
  exit 1
fi
git add .
if ! git diff --cached --quiet; then git commit -m 'Prepare Alibi Arcade for GitLab Pages'; fi

if ! glab api "projects/$alibi_api_project" --jq .path_with_namespace; then
  glab api projects --method POST --field name=alibi-arcade --field path=alibi-arcade --field visibility="$alibi_visibility" --field default_branch=main --jq .web_url
fi
# Publish the game website without requiring GitLab sign-in. Source visibility is preserved.
glab api "projects/$alibi_api_project" --method PUT --field pages_access_level=public >/dev/null
if git remote get-url gitlab >/dev/null 2>&1; then
  case "$(git remote get-url gitlab)" in
    "https://gitlab.com/$alibi_repo.git"|"https://gitlab.com/$alibi_repo"|"git@gitlab.com:$alibi_repo.git") ;;
    *) printf 'The gitlab remote points to another repository. Review it before pushing.\n' >&2; exit 1 ;;
  esac
  git remote set-url gitlab "https://gitlab.com/$alibi_repo.git"
else
  git remote add gitlab "https://gitlab.com/$alibi_repo.git"
fi
git push gitlab HEAD:main
printf 'Code pushed. The .gitlab-ci.yml pipeline creates GitLab Pages automatically.\n'
glab ci status --repo "$alibi_repo" --branch main --live
printf 'Pages URL: '
glab api "projects/$alibi_api_project/pages" --jq .url
