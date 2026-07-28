#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/lib/docker-e2e-image.sh"

IMAGE_NAME="$(docker_e2e_resolve_image "bot-openai-web-search-minimal-e2e" BOT_OPENAI_WEB_SEARCH_MINIMAL_E2E_IMAGE)"
SKIP_BUILD="${BOT_OPENAI_WEB_SEARCH_MINIMAL_E2E_SKIP_BUILD:-0}"
PORT="$(docker_e2e_read_tcp_port_env BOT_OPENAI_WEB_SEARCH_MINIMAL_PORT 18789)"
# Keep the TLS mock on the canonical official endpoint used by native web_search.
MOCK_PORT="443"
TOKEN="openai-web-search-minimal-e2e-$$"

docker_e2e_build_or_reuse "$IMAGE_NAME" openai-web-search-minimal "$ROOT_DIR/scripts/e2e/Dockerfile" "$ROOT_DIR" "" "$SKIP_BUILD"
BOT_TEST_STATE_SCRIPT_B64="$(docker_e2e_test_state_shell_b64 openai-web-search-minimal empty)"

echo "Running OpenAI web_search minimal reasoning Docker E2E..."
docker_e2e_run_logged_with_harness openai-web-search-minimal \
  --add-host api.openai.com:127.0.0.1 \
  -e "BOT_GATEWAY_TOKEN=$TOKEN" \
  -e "OPENAI_API_KEY=sk-bot-web-search-minimal-e2e" \
  -e "BOT_TEST_STATE_SCRIPT_B64=$BOT_TEST_STATE_SCRIPT_B64" \
  -e "PORT=$PORT" \
  -e "MOCK_PORT=$MOCK_PORT" \
  "$IMAGE_NAME" \
  bash scripts/e2e/lib/openai-web-search-minimal/scenario.sh
