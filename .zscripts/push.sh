#!/usr/bin/env bash
# ─── FinWise Quick Push ───────────────────────────────────────────────────
# Usage:  bash .zscripts/push.sh "your commit message"
# Effect: stages all changes, commits, and pushes to GitHub
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

MSG="${1:-update: $(date '+%Y-%m-%d %H:%M')}"

echo "📦 Staging all changes..."
git add .

echo "💬 Committing: \"$MSG\""
git commit -m "$MSG" || { echo "✅ Nothing new to commit."; exit 0; }

echo "🚀 Pushing to GitHub..."
git push

echo ""
echo "✅ Done! Live at: https://www.xnocode.qzz.io"
echo "   GitHub:        https://github.com/xnocode/FinWise"
