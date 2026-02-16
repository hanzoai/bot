#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${BOT_IMAGE:-${BOT_IMAGE:-bot:local}}"
CONFIG_DIR="${BOT_CONFIG_DIR:-${BOT_CONFIG_DIR:-$HOME/.bot}}"
WORKSPACE_DIR="${BOT_WORKSPACE_DIR:-${BOT_WORKSPACE_DIR:-$HOME/.bot/workspace}}"
PROFILE_FILE="${BOT_PROFILE_FILE:-${BOT_PROFILE_FILE:-$HOME/.profile}}"

PROFILE_MOUNT=()
if [[ -f "$PROFILE_FILE" ]]; then
  PROFILE_MOUNT=(-v "$PROFILE_FILE":/home/node/.profile:ro)
fi

echo "==> Build image: $IMAGE_NAME"
docker build -t "$IMAGE_NAME" -f "$ROOT_DIR/Dockerfile" "$ROOT_DIR"

echo "==> Run live model tests (profile keys)"
docker run --rm -t \
  --entrypoint bash \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e HOME=/home/node \
  -e NODE_OPTIONS=--disable-warning=ExperimentalWarning \
  -e BOT_LIVE_TEST=1 \
  -e BOT_LIVE_MODELS="${BOT_LIVE_MODELS:-${BOT_LIVE_MODELS:-all}}" \
  -e BOT_LIVE_PROVIDERS="${BOT_LIVE_PROVIDERS:-${BOT_LIVE_PROVIDERS:-}}" \
  -e BOT_LIVE_MODEL_TIMEOUT_MS="${BOT_LIVE_MODEL_TIMEOUT_MS:-${BOT_LIVE_MODEL_TIMEOUT_MS:-}}" \
  -e BOT_LIVE_REQUIRE_PROFILE_KEYS="${BOT_LIVE_REQUIRE_PROFILE_KEYS:-${BOT_LIVE_REQUIRE_PROFILE_KEYS:-}}" \
  -v "$CONFIG_DIR":/home/node/.bot \
  -v "$WORKSPACE_DIR":/home/node/.bot/workspace \
  "${PROFILE_MOUNT[@]}" \
  "$IMAGE_NAME" \
  -lc "set -euo pipefail; [ -f \"$HOME/.profile\" ] && source \"$HOME/.profile\" || true; cd /app && pnpm test:live"
