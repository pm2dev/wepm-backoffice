#!/usr/bin/env bash
# Build the sample-data prototype as a static site and publish it to the
# gh-pages branch (GitHub Pages → "Deploy from a branch" → gh-pages / root).
# Usage: scripts/deploy-pages.sh [base-path]   (default: /wepm-backoffice)
set -euo pipefail

BASE_PATH="${1:-/wepm-backoffice}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="$(git -C "$ROOT" remote get-url origin)"
SOURCE_SHA="$(git -C "$ROOT" rev-parse --short HEAD)"
SOURCE_BRANCH="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)"

cd "$ROOT"
rm -rf out
STATIC_EXPORT=1 BASE_PATH="$BASE_PATH" npx next build
touch out/.nojekyll   # serve the _next/ directory as-is

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
if git ls-remote --exit-code --heads "$REMOTE" gh-pages >/dev/null 2>&1; then
  git clone --quiet --depth 1 --branch gh-pages "$REMOTE" "$WORK/site"
else
  git init --quiet "$WORK/site"
  git -C "$WORK/site" checkout --quiet --orphan gh-pages
  git -C "$WORK/site" remote add origin "$REMOTE"
fi

# Replace the published files with the new build.
find "$WORK/site" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R out/. "$WORK/site/"

cd "$WORK/site"
git add -A
if git diff --cached --quiet; then
  echo "gh-pages already up to date."
  exit 0
fi
git commit --quiet -m "Deploy ${SOURCE_BRANCH}@${SOURCE_SHA} (sample-data prototype)"
git push --quiet origin HEAD:gh-pages
echo "Published ${SOURCE_BRANCH}@${SOURCE_SHA} to gh-pages."
