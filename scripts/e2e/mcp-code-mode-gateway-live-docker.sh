#!/usr/bin/env bash
# Runs the packaged Gateway/code-mode/MCP API-file smoke against a live OpenAI
# provider so the real agent has to discover and use the virtual declarations.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/lib/docker-e2e-image.sh"

IMAGE_NAME="$(docker_e2e_resolve_image "bot-mcp-code-mode-gateway-live-e2e" BOT_IMAGE)"
PORT="$(docker_e2e_read_tcp_port_env BOT_MCP_CODE_MODE_LIVE_GATEWAY_PORT 18789)"
CLIENT_TIMEOUT_MS="$(docker_e2e_read_positive_int_env BOT_MCP_CODE_MODE_CLIENT_TIMEOUT_MS 300000)"
CLIENT_BODY_MAX_BYTES="$(docker_e2e_read_positive_int_env BOT_MCP_CODE_MODE_CLIENT_BODY_MAX_BYTES 1048576)"
TOKEN="mcp-code-mode-live-e2e-$(date +%s)-$$"
CONTAINER_NAME="bot-mcp-code-mode-live-e2e-$$"
PROFILE_FILE="${BOT_MCP_CODE_MODE_LIVE_PROFILE_FILE:-${BOT_TESTBOX_PROFILE_FILE:-$HOME/.bot-testbox-live.profile}}"

CLIENT_LOG="$(mktemp -t bot-mcp-code-mode-live-log.XXXXXX)"

cleanup() {
  docker_e2e_docker_cmd rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  rm -f "$CLIENT_LOG"
}
trap cleanup EXIT

if [ ! -f "$PROFILE_FILE" ] && [ -f "$HOME/.profile" ]; then
  PROFILE_FILE="$HOME/.profile"
fi

PROFILE_MOUNT=()
PROFILE_STATUS="none"
if [ -f "$PROFILE_FILE" ] && [ -r "$PROFILE_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$PROFILE_FILE"
  set +a
  PROFILE_MOUNT=(-v "$PROFILE_FILE":/home/appuser/.profile:ro)
  PROFILE_STATUS="$PROFILE_FILE"
fi

if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "ERROR: OPENAI_API_KEY was not available after sourcing $PROFILE_STATUS." >&2
  exit 1
fi
docker_e2e_build_or_reuse "$IMAGE_NAME" mcp-code-mode-gateway-live
BOT_TEST_STATE_SCRIPT_B64="$(docker_e2e_test_state_shell_b64 mcp-code-mode-gateway-live empty)"

# The profile is only a credential source. Keep this lane's Bot runtime
# isolated from host/testbox mode flags that can change packaged behavior.
unset BOT_TESTBOX

echo "Running live Docker Gateway code-mode MCP API-file smoke..."
echo "Profile file: $PROFILE_STATUS"
set +e
docker_e2e_run_with_harness \
  --name "$CONTAINER_NAME" \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e OPENAI_API_KEY \
  -e OPENAI_BASE_URL \
  -e "BOT_DOCKER_OPENAI_BASE_URL=${OPENAI_BASE_URL:-https://api.openai.com/v1}" \
  -e "BOT_GATEWAY_TOKEN=$TOKEN" \
  -e "BOT_SKIP_CHANNELS=1" \
  -e "BOT_SKIP_GMAIL_WATCHER=1" \
  -e "BOT_SKIP_CRON=1" \
  -e "BOT_SKIP_CANVAS_HOST=1" \
  -e "BOT_SKIP_ACPX_RUNTIME=1" \
  -e "BOT_SKIP_ACPX_RUNTIME_PROBE=1" \
  -e "BOT_TEST_STATE_SCRIPT_B64=$BOT_TEST_STATE_SCRIPT_B64" \
  -e "GW_URL=http://127.0.0.1:$PORT" \
  -e "GW_TOKEN=$TOKEN" \
  -e "BOT_MCP_CODE_MODE_CLIENT_TIMEOUT_MS=$CLIENT_TIMEOUT_MS" \
  -e "BOT_MCP_CODE_MODE_CLIENT_BODY_MAX_BYTES=$CLIENT_BODY_MAX_BYTES" \
  -e "BOT_ALLOW_INSECURE_PRIVATE_WS=1" \
  -e "BOT_MCP_CODE_MODE_MODEL=${BOT_MCP_CODE_MODE_LIVE_MODEL:-bot/main}" \
  "${PROFILE_MOUNT[@]}" \
  "$IMAGE_NAME" \
  bash -lc "set -euo pipefail
    source scripts/lib/bot-e2e-instance.sh
    for profile_path in \"\$HOME/.profile\" /home/appuser/.profile; do
      if [ -f \"\$profile_path\" ] && [ -r \"\$profile_path\" ]; then
        set +e +u
        source \"\$profile_path\"
        set -euo pipefail
        break
      fi
    done
    unset BOT_TESTBOX
    if [ -z \"\${OPENAI_API_KEY:-}\" ]; then
      echo \"ERROR: OPENAI_API_KEY was not available inside the container.\" >&2
      exit 1
    fi
    bot_e2e_eval_test_state_from_b64 \"\${BOT_TEST_STATE_SCRIPT_B64:?missing BOT_TEST_STATE_SCRIPT_B64}\"
    entry=\"\$(bot_e2e_resolve_entrypoint)\"
    gateway_pid=
    cleanup_inner() {
      bot_e2e_stop_process \"\${gateway_pid:-}\"
    }
    dump_logs_on_error() {
      status=\$?
      if [ \"\$status\" -ne 0 ]; then
        bot_e2e_dump_logs \
          /tmp/mcp-code-mode-live-gateway.log \
          /tmp/mcp-code-mode-live-seed.log
        if [ -d \"\${BOT_STATE_DIR:-}/agents/main/sessions\" ]; then
          echo \"--- session MCP/code-mode excerpts ---\" >&2
          grep -R -n -E 'API\\.|MCP\\.fixture|fixture__lookup_note|Unknown API file|\"telemetry\"|\"sources\"' \
            \"\$BOT_STATE_DIR/agents/main/sessions\" >&2 || true
        fi
      fi
      cleanup_inner
      exit \"\$status\"
    }
    trap cleanup_inner EXIT
    trap dump_logs_on_error ERR
    tsx scripts/e2e/mcp-code-mode-gateway-seed.ts >/tmp/mcp-code-mode-live-seed.log
    gateway_pid=\"\$(bot_e2e_start_gateway \"\$entry\" $PORT /tmp/mcp-code-mode-live-gateway.log)\"
    bot_e2e_wait_gateway_ready \"\$gateway_pid\" /tmp/mcp-code-mode-live-gateway.log 480 $PORT
    tsx scripts/e2e/mcp-code-mode-gateway-client.ts
  " >"$CLIENT_LOG" 2>&1
status=${PIPESTATUS[0]}
set -e

if [ "$status" -ne 0 ]; then
  echo "Live Docker MCP code-mode API-file smoke failed"
  docker_e2e_print_log "$CLIENT_LOG"
  exit "$status"
fi

docker_e2e_print_log "$CLIENT_LOG"
echo "OK"
