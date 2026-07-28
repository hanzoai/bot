#!/usr/bin/env bash
# Verifies embedded Bot bundle MCP tool materialization and tool-policy behavior
# inside the package-installed functional E2E image.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/lib/docker-e2e-image.sh"
IMAGE_NAME="$(docker_e2e_resolve_image "bot-agent-bundle-mcp-tools-e2e" BOT_IMAGE)"
CONTAINER_NAME="bot-agent-bundle-mcp-tools-e2e-$$"
RUN_LOG="$(mktemp -t bot-agent-bundle-mcp-tools-log.XXXXXX)"

cleanup() {
  docker_e2e_docker_cmd rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  rm -f "$RUN_LOG"
}
trap cleanup EXIT

docker_e2e_build_or_reuse "$IMAGE_NAME" agent-bundle-mcp-tools
BOT_TEST_STATE_SCRIPT_B64="$(docker_e2e_test_state_shell_b64 agent-bundle-mcp-tools empty)"

echo "Running in-container Bot bundle MCP tool availability smoke..."
# Harness files are mounted read-only; the app under test comes from /app/dist.
set +e
docker_e2e_run_with_harness \
  --name "$CONTAINER_NAME" \
  -e "BOT_TEST_STATE_SCRIPT_B64=$BOT_TEST_STATE_SCRIPT_B64" \
  "$IMAGE_NAME" \
  bash -lc "set -euo pipefail
    source scripts/lib/bot-e2e-instance.sh
    bot_e2e_eval_test_state_from_b64 \"\${BOT_TEST_STATE_SCRIPT_B64:?missing BOT_TEST_STATE_SCRIPT_B64}\"
    tsx test/e2e/qa-lab/runtime/agent-bundle-mcp-tools-docker-client.ts
  " >"$RUN_LOG" 2>&1
status=${PIPESTATUS[0]}
set -e

if [ "$status" -ne 0 ]; then
  echo "Docker Bot bundle MCP tool availability smoke failed"
  docker_e2e_print_log "$RUN_LOG"
  exit "$status"
fi

docker_e2e_print_log "$RUN_LOG"
echo "OK"
