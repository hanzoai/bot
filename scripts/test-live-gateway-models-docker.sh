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

echo "==> Run gateway live model tests (profile keys)"
docker run --rm -t \
  --entrypoint bash \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e HOME=/home/node \
  -e NODE_OPTIONS=--disable-warning=ExperimentalWarning \
  -e BOT_LIVE_TEST=1 \
  -e BOT_LIVE_GATEWAY_MODELS="${BOT_LIVE_GATEWAY_MODELS:-${BOT_LIVE_GATEWAY_MODELS:-all}}" \
  -e BOT_LIVE_GATEWAY_PROVIDERS="${BOT_LIVE_GATEWAY_PROVIDERS:-${BOT_LIVE_GATEWAY_PROVIDERS:-}}" \
  -e BOT_LIVE_GATEWAY_MODEL_TIMEOUT_MS="${BOT_LIVE_GATEWAY_MODEL_TIMEOUT_MS:-${BOT_LIVE_GATEWAY_MODEL_TIMEOUT_MS:-}}" \
  -v "$CONFIG_DIR":/home/node/.bot \
  -v "$WORKSPACE_DIR":/home/node/.bot/workspace \
  "${PROFILE_MOUNT[@]}" \
  "$IMAGE_NAME" \
  -lc "set -euo pipefail; [ -f \"$HOME/.profile\" ] && source \"$HOME/.profile\" || true; cd /app && pnpm test:live"
