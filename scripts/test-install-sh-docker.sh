#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SMOKE_IMAGE="${BOT_INSTALL_SMOKE_IMAGE:-${BOT_INSTALL_SMOKE_IMAGE:-openclaw-install-smoke:local}}"
NONROOT_IMAGE="${BOT_INSTALL_NONROOT_IMAGE:-${BOT_INSTALL_NONROOT_IMAGE:-openclaw-install-nonroot:local}}"
INSTALL_URL="${BOT_INSTALL_URL:-${BOT_INSTALL_URL:-https://openclaw.bot/install.sh}}"
CLI_INSTALL_URL="${BOT_INSTALL_CLI_URL:-${BOT_INSTALL_CLI_URL:-https://openclaw.bot/install-cli.sh}}"
SKIP_NONROOT="${BOT_INSTALL_SMOKE_SKIP_NONROOT:-${BOT_INSTALL_SMOKE_SKIP_NONROOT:-0}}"
SKIP_SMOKE_IMAGE_BUILD="${BOT_INSTALL_SMOKE_SKIP_IMAGE_BUILD:-${BOT_INSTALL_SMOKE_SKIP_IMAGE_BUILD:-0}}"
SKIP_NONROOT_IMAGE_BUILD="${BOT_INSTALL_NONROOT_SKIP_IMAGE_BUILD:-${BOT_INSTALL_NONROOT_SKIP_IMAGE_BUILD:-0}}"
LATEST_DIR="$(mktemp -d)"
LATEST_FILE="${LATEST_DIR}/latest"

if [[ "$SKIP_SMOKE_IMAGE_BUILD" == "1" ]]; then
  echo "==> Reuse prebuilt smoke image: $SMOKE_IMAGE"
else
  echo "==> Build smoke image (upgrade, root): $SMOKE_IMAGE"
  docker build \
    -t "$SMOKE_IMAGE" \
    -f "$ROOT_DIR/scripts/docker/install-sh-smoke/Dockerfile" \
    "$ROOT_DIR/scripts/docker"
fi

echo "==> Run installer smoke test (root): $INSTALL_URL"
docker run --rm -t \
  -v "${LATEST_DIR}:/out" \
  -e BOT_INSTALL_URL="$INSTALL_URL" \
  -e BOT_INSTALL_METHOD=npm \
  -e BOT_INSTALL_LATEST_OUT="/out/latest" \
  -e BOT_INSTALL_SMOKE_PREVIOUS="${BOT_INSTALL_SMOKE_PREVIOUS:-${BOT_INSTALL_SMOKE_PREVIOUS:-}}" \
  -e BOT_INSTALL_SMOKE_SKIP_PREVIOUS="${BOT_INSTALL_SMOKE_SKIP_PREVIOUS:-${BOT_INSTALL_SMOKE_SKIP_PREVIOUS:-0}}" \
  -e BOT_NO_ONBOARD=1 \
  -e DEBIAN_FRONTEND=noninteractive \
  "$SMOKE_IMAGE"

LATEST_VERSION=""
if [[ -f "$LATEST_FILE" ]]; then
  LATEST_VERSION="$(cat "$LATEST_FILE")"
fi

if [[ "$SKIP_NONROOT" == "1" ]]; then
  echo "==> Skip non-root installer smoke (BOT_INSTALL_SMOKE_SKIP_NONROOT=1)"
else
  if [[ "$SKIP_NONROOT_IMAGE_BUILD" == "1" ]]; then
    echo "==> Reuse prebuilt non-root image: $NONROOT_IMAGE"
  else
    echo "==> Build non-root image: $NONROOT_IMAGE"
    docker build \
      -t "$NONROOT_IMAGE" \
      -f "$ROOT_DIR/scripts/docker/install-sh-nonroot/Dockerfile" \
      "$ROOT_DIR/scripts/docker"
  fi

  echo "==> Run installer non-root test: $INSTALL_URL"
  docker run --rm -t \
    -e BOT_INSTALL_URL="$INSTALL_URL" \
    -e BOT_INSTALL_METHOD=npm \
    -e BOT_INSTALL_EXPECT_VERSION="$LATEST_VERSION" \
    -e BOT_NO_ONBOARD=1 \
    -e DEBIAN_FRONTEND=noninteractive \
    "$NONROOT_IMAGE"
fi

if [[ "${BOT_INSTALL_SMOKE_SKIP_CLI:-${BOT_INSTALL_SMOKE_SKIP_CLI:-0}}" == "1" ]]; then
  echo "==> Skip CLI installer smoke (BOT_INSTALL_SMOKE_SKIP_CLI=1)"
  exit 0
fi

if [[ "$SKIP_NONROOT" == "1" ]]; then
  echo "==> Skip CLI installer smoke (non-root image skipped)"
  exit 0
fi

echo "==> Run CLI installer non-root test (same image)"
docker run --rm -t \
  --entrypoint /bin/bash \
  -e BOT_INSTALL_URL="$INSTALL_URL" \
  -e BOT_INSTALL_CLI_URL="$CLI_INSTALL_URL" \
  -e BOT_NO_ONBOARD=1 \
  -e DEBIAN_FRONTEND=noninteractive \
  "$NONROOT_IMAGE" -lc "curl -fsSL \"$CLI_INSTALL_URL\" | bash -s -- --set-npm-prefix --no-onboard"
