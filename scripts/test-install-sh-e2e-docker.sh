#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${BOT_INSTALL_E2E_IMAGE:-${BOT_INSTALL_E2E_IMAGE:-bot-install-e2e:local}}"
INSTALL_URL="${BOT_INSTALL_URL:-https://raw.githubusercontent.com/hanzoai/bot/main/scripts/install.sh}"

OPENAI_API_KEY="${OPENAI_API_KEY:-}"
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
ANTHROPIC_API_TOKEN="${ANTHROPIC_API_TOKEN:-}"
BOT_E2E_MODELS="${BOT_E2E_MODELS:-${BOT_E2E_MODELS:-}}"

echo "==> Build image: $IMAGE_NAME"
docker build \
  -t "$IMAGE_NAME" \
  -f "$ROOT_DIR/scripts/docker/install-sh-e2e/Dockerfile" \
  "$ROOT_DIR/scripts/docker/install-sh-e2e"

echo "==> Run E2E installer test"
docker run --rm \
  -e BOT_INSTALL_URL="$INSTALL_URL" \
  -e BOT_INSTALL_TAG="${BOT_INSTALL_TAG:-${BOT_INSTALL_TAG:-latest}}" \
  -e BOT_E2E_MODELS="$BOT_E2E_MODELS" \
  -e BOT_INSTALL_E2E_PREVIOUS="${BOT_INSTALL_E2E_PREVIOUS:-${BOT_INSTALL_E2E_PREVIOUS:-}}" \
  -e BOT_INSTALL_E2E_SKIP_PREVIOUS="${BOT_INSTALL_E2E_SKIP_PREVIOUS:-${BOT_INSTALL_E2E_SKIP_PREVIOUS:-0}}" \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  -e ANTHROPIC_API_TOKEN="$ANTHROPIC_API_TOKEN" \
  "$IMAGE_NAME"
