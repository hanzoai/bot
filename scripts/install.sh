#!/usr/bin/env bash
# Hanzo Bot installer — https://hanzo.bot
# Usage: curl -fsSL https://hanzo.bot/install.sh | bash
set -euo pipefail

PACKAGE="${BOT_PACKAGE:-@hanzo/bot}"
VERSION="${BOT_VERSION:-latest}"

command -v node >/dev/null 2>&1 || {
  echo "Error: Node.js is required. Install from https://nodejs.org" >&2
  exit 1
}

command -v npm >/dev/null 2>&1 || {
  echo "Error: npm is required." >&2
  exit 1
}

echo "Installing ${PACKAGE}@${VERSION}..."
npm install -g "${PACKAGE}@${VERSION}"

echo "Done. Run 'bot' to get started."
