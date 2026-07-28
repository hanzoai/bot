#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/lib/docker-e2e-image.sh"

IMAGE_NAME="$(docker_e2e_resolve_image "bot-docker-e2e-bare:local")"
PACKAGE_TGZ="$(docker_e2e_prepare_package_tgz docker-package-install "${BOT_CURRENT_PACKAGE_TGZ:-}")"
IDENTITY_PATH="${BOT_DOCKER_ARTIFACT_IDENTITY_PATH:-$ROOT_DIR/.artifacts/docker-tests/docker-package-install-identities.json}"
CONTAINER_NAME="bot-package-proof-$$"
DOCKER_RUN_TIMEOUT="${BOT_DOCKER_PACKAGE_INSTALL_RUN_TIMEOUT:-120s}"

cleanup() {
  docker_e2e_docker_cmd rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  docker_e2e_cleanup_package_tgz "$PACKAGE_TGZ"
}
trap cleanup EXIT

docker_e2e_build_or_reuse "$IMAGE_NAME" docker-package-install "$ROOT_DIR/scripts/e2e/Dockerfile" "$ROOT_DIR" bare

echo "Installing the real Bot package artifact in the target container..."
DOCKER_COMMAND_TIMEOUT="$DOCKER_RUN_TIMEOUT" docker_e2e_docker_run_cmd run -d \
  --name "$CONTAINER_NAME" \
  -v "$PACKAGE_TGZ:/tmp/bot-current.tgz:ro" \
  "$IMAGE_NAME" \
  bash -lc '
    set -euo pipefail
    npm install -g --prefix /tmp/bot-proof /tmp/bot-current.tgz --no-fund --no-audit
    package_root=/tmp/bot-proof/lib/node_modules/bot
    "$package_root/bot.mjs" --version > /tmp/bot-version
    "$package_root/bot.mjs" --help > /tmp/bot-help
    test -s /tmp/bot-help
    touch /tmp/bot-proof-ready
    exec sleep infinity
  ' >/dev/null

for _ in $(seq 1 240); do
  if docker exec "$CONTAINER_NAME" test -f /tmp/bot-proof-ready; then
    break
  fi
  if [ "$(docker inspect --format '{{.State.Running}}' "$CONTAINER_NAME")" != "true" ]; then
    docker logs "$CONTAINER_NAME" >&2
    exit 1
  fi
  sleep 1
done
docker exec "$CONTAINER_NAME" test -f /tmp/bot-proof-ready

INSTALLED_VERSION="$(docker exec "$CONTAINER_NAME" cat /tmp/bot-version | tr -d '\r\n')"
PACKAGE_ROOT="/tmp/bot-proof/lib/node_modules/bot"
PACKAGE_VERSION="$(docker exec "$CONTAINER_NAME" node -p "require('$PACKAGE_ROOT/package.json').version")"
if [[ "$INSTALLED_VERSION" != *"$PACKAGE_VERSION"* ]]; then
  echo "installed CLI output $INSTALLED_VERSION does not contain package version $PACKAGE_VERSION" >&2
  exit 1
fi

node --import tsx "$ROOT_DIR/scripts/e2e/lib/docker-artifact-proof/write-identities.ts" \
  --scenario docker-package-install \
  --output "$IDENTITY_PATH" \
  --image "$IMAGE_NAME" \
  --package "$PACKAGE_TGZ" \
  --container "target=$CONTAINER_NAME" \
  --detail "target:installedPackageRoot=$PACKAGE_ROOT" \
  --detail "target:installedPackageVersion=$PACKAGE_VERSION" \
  --detail "target:botVersion=$INSTALLED_VERSION" \
  --detail "target:helpCommand=passed"

echo "Package artifact container proof passed."
