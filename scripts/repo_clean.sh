#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Removing node_modules..."
find . -name "node_modules" -type d -prune -exec rm -rf {} + 2>/dev/null || true

echo "Removing Python caches..."
find . -name "__pycache__" -type d -prune -exec rm -rf {} + 2>/dev/null || true
find . -name "*.pyc" -not -path "*/node_modules/*" -delete 2>/dev/null || true

echo "Removing build artifacts..."
rm -rf \
  contracts/mars/build \
  contracts/mars/Move.lock \
  walrus-uploader/dist \
  seal-access/dist

echo "Repo clean. Run 'pnpm install' to reinstall dependencies."
