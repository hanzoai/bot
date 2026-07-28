#!/usr/bin/env bash
# Installs a prepared Bot npm tarball in Docker, runs non-interactive
# onboarding for a channel, and verifies one mocked model turn through Gateway.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE_ROOT="$(cd "${BOT_NPM_ONBOARD_SOURCE_ROOT:-${BOT_LIVE_DOCKER_REPO_ROOT:-$ROOT_DIR}}" && pwd)"
source "$ROOT_DIR/scripts/lib/docker-e2e-image.sh"
source "$ROOT_DIR/scripts/lib/docker-e2e-package.sh"

IMAGE_NAME="$(docker_e2e_resolve_image "bot-npm-onboard-channel-agent-e2e" BOT_NPM_ONBOARD_E2E_IMAGE)"
DOCKER_TARGET="${BOT_NPM_ONBOARD_DOCKER_TARGET:-bare}"
HOST_BUILD="${BOT_NPM_ONBOARD_HOST_BUILD:-1}"
PACKAGE_TGZ="${BOT_CURRENT_PACKAGE_TGZ:-}"
CHANNEL="${BOT_NPM_ONBOARD_CHANNEL:-telegram}"
USE_SOURCE_PLUGIN_PACKAGE="${BOT_NPM_ONBOARD_USE_SOURCE_PLUGIN_PACKAGE:-0}"
JSON_ARTIFACT_MAX_BYTES="$(
  docker_e2e_read_positive_int_env BOT_NPM_ONBOARD_JSON_ARTIFACT_MAX_BYTES 1048576
)"
STATUS_TEXT_MAX_BYTES="$(
  docker_e2e_read_positive_int_env BOT_NPM_ONBOARD_STATUS_TEXT_MAX_BYTES 1048576
)"
run_log=""
plugin_pack_dir=""
plugin_package_args=()

cleanup() {
  if [ -n "${PACKAGE_TGZ:-}" ]; then
    docker_e2e_cleanup_package_tgz "$PACKAGE_TGZ"
  fi
  if [ -n "${run_log:-}" ]; then
    rm -f "$run_log"
  fi
  if [ -n "${plugin_pack_dir:-}" ]; then
    rm -rf "$plugin_pack_dir"
  fi
}
trap cleanup EXIT

case "$CHANNEL" in
telegram | discord | slack) ;;
*)
  echo "BOT_NPM_ONBOARD_CHANNEL must be telegram, discord, or slack, got: $CHANNEL" >&2
  exit 1
  ;;
esac

docker_e2e_build_or_reuse "$IMAGE_NAME" npm-onboard-channel-agent "$ROOT_DIR/scripts/e2e/Dockerfile" "$ROOT_DIR" "$DOCKER_TARGET"

prepare_package_tgz() {
  if [ -n "$PACKAGE_TGZ" ]; then
    PACKAGE_TGZ="$(docker_e2e_prepare_package_tgz npm-onboard-channel-agent "$PACKAGE_TGZ")"
    return 0
  fi
  if [ "$HOST_BUILD" = "0" ] && [ -z "${BOT_CURRENT_PACKAGE_TGZ:-}" ]; then
    echo "BOT_NPM_ONBOARD_HOST_BUILD=0 requires BOT_CURRENT_PACKAGE_TGZ" >&2
    exit 1
  fi
  PACKAGE_TGZ="$(docker_e2e_prepare_package_tgz npm-onboard-channel-agent)"
}

prepare_package_tgz

prepare_source_plugin_package() {
  if [ "$USE_SOURCE_PLUGIN_PACKAGE" != "1" ] || [ "$CHANNEL" = "telegram" ]; then
    return 0
  fi

  local package_dir="extensions/$CHANNEL"
  if [ ! -f "$SOURCE_ROOT/$package_dir/package.json" ]; then
    echo "Missing source plugin package for $CHANNEL: $package_dir" >&2
    exit 1
  fi

  plugin_pack_dir="$(mktemp -d "${TMPDIR:-/tmp}/bot-npm-onboard-plugin.XXXXXX")"
  (
    cd "$SOURCE_ROOT"
    BOT_PLUGIN_NPM_PACK_OUTPUT_DIR="$plugin_pack_dir" \
      bash scripts/plugin-npm-publish.sh --pack "$package_dir"
  )

  local archives=("$plugin_pack_dir"/*.tgz)
  if [ "${#archives[@]}" -ne 1 ] || [ ! -f "${archives[0]}" ]; then
    echo "Expected exactly one packed source plugin for $CHANNEL" >&2
    exit 1
  fi

  local container_package="/tmp/bot-channel-plugin.tgz"
  plugin_package_args=(
    -v "${archives[0]}:$container_package:ro"
    -e BOT_ALLOW_PLUGIN_INSTALL_OVERRIDES=1
    -e "BOT_PLUGIN_INSTALL_OVERRIDES={\"$CHANNEL\":\"npm-pack:$container_package\"}"
  )
}

prepare_source_plugin_package

docker_e2e_package_mount_args "$PACKAGE_TGZ"
run_log="$(docker_e2e_run_log npm-onboard-channel-agent)"
BOT_TEST_STATE_SCRIPT_B64="$(docker_e2e_test_state_shell_b64 npm-onboard-channel-agent empty)"

echo "Running npm tarball onboard/channel/agent Docker E2E ($CHANNEL)..."
if ! docker_e2e_run_with_harness \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e BOT_NPM_ONBOARD_CHANNEL="$CHANNEL" \
  -e "BOT_NPM_ONBOARD_JSON_ARTIFACT_MAX_BYTES=$JSON_ARTIFACT_MAX_BYTES" \
  -e "BOT_NPM_ONBOARD_STATUS_TEXT_MAX_BYTES=$STATUS_TEXT_MAX_BYTES" \
  -e "BOT_TEST_STATE_SCRIPT_B64=$BOT_TEST_STATE_SCRIPT_B64" \
  "${DOCKER_E2E_PACKAGE_ARGS[@]}" \
  "${plugin_package_args[@]}" \
  -i "$IMAGE_NAME" bash -s >"$run_log" 2>&1 <<'EOF'; then
set -Eeuo pipefail

source scripts/lib/bot-e2e-instance.sh
bot_e2e_eval_test_state_from_b64 "${BOT_TEST_STATE_SCRIPT_B64:?missing BOT_TEST_STATE_SCRIPT_B64}"
export NPM_CONFIG_PREFIX="$HOME/.npm-global"
export PATH="$NPM_CONFIG_PREFIX/bin:$PATH"
export OPENAI_API_KEY="sk-bot-npm-onboard-e2e"
export BOT_GATEWAY_TOKEN="npm-onboard-channel-agent-token"

CHANNEL="${BOT_NPM_ONBOARD_CHANNEL:?missing BOT_NPM_ONBOARD_CHANNEL}"
PORT="18789"
MOCK_PORT="44080"
SUCCESS_MARKER="BOT_AGENT_E2E_OK_ASSISTANT"
scenario_tmp="$(mktemp -d "${TMPDIR:-/tmp}/bot-npm-onboard-channel-agent.XXXXXX")"
MOCK_REQUEST_LOG="$scenario_tmp/mock-openai-requests.jsonl"
export SUCCESS_MARKER MOCK_REQUEST_LOG
mock_pid=""

case "$CHANNEL" in
  telegram)
    CHANNEL_TOKEN="123456:bot-npm-onboard-token"
    DEP_SENTINEL="grammy"
    CHANNEL_ADD_ARGS=(--token "$CHANNEL_TOKEN")
    CHANNEL_CONFIG_TOKENS=("$CHANNEL_TOKEN")
    ;;
  discord)
    CHANNEL_TOKEN="bot-npm-onboard-discord-token"
    DEP_SENTINEL="discord-api-types"
    CHANNEL_ADD_ARGS=(--token "$CHANNEL_TOKEN")
    CHANNEL_CONFIG_TOKENS=("$CHANNEL_TOKEN")
    ;;
  slack)
    SLACK_BOT_TOKEN="xoxb-bot-npm-onboard-slack-token"
    SLACK_APP_TOKEN="xapp-bot-npm-onboard-slack-token"
    DEP_SENTINEL="@slack/bolt"
    CHANNEL_ADD_ARGS=(--bot-token "$SLACK_BOT_TOKEN" --app-token "$SLACK_APP_TOKEN")
    CHANNEL_CONFIG_TOKENS=("$SLACK_BOT_TOKEN" "$SLACK_APP_TOKEN")
    ;;
  *)
    echo "unsupported channel: $CHANNEL" >&2
    exit 1
    ;;
esac

cleanup() {
  bot_e2e_stop_process "${mock_pid:-}"
  rm -rf "$scenario_tmp"
}
trap cleanup EXIT

dump_debug_logs() {
  local status="$1"
  echo "npm onboard/channel/agent scenario failed with exit code $status" >&2
  bot_e2e_dump_logs \
    /tmp/bot-install.log \
    /tmp/bot-onboard.json \
    /tmp/bot-channel-add.log \
    /tmp/bot-channels-status.json \
    /tmp/bot-channels-status.err \
    /tmp/bot-status.txt \
    /tmp/bot-status.err \
    /tmp/bot-doctor.log \
    /tmp/bot-agent.combined \
    /tmp/bot-agent.err \
    /tmp/bot-agent.json \
    /tmp/bot-mock-openai.log \
    "$MOCK_REQUEST_LOG" \
    "$BOT_HOME/.hanzoai/bot.json" \
    "$BOT_HOME/.bot/agents/main/agent/auth-profiles.json"
}
trap 'status=$?; dump_debug_logs "$status"; exit "$status"' ERR

bot_e2e_install_package /tmp/bot-install.log

command -v bot >/dev/null
bot_e2e_enable_bot_cli_timeout
package_root="$(bot_e2e_package_root)"
if [ -d "$package_root/dist/extensions/$CHANNEL" ]; then
  CHANNEL_PACKAGE_MODE="bundled"
else
  CHANNEL_PACKAGE_MODE="external"
  echo "$CHANNEL is not packaged with core Bot; expecting channel selection to install it on demand."
fi

mock_pid="$(bot_e2e_start_mock_openai "$MOCK_PORT" /tmp/bot-mock-openai.log)"
bot_e2e_wait_mock_openai "$MOCK_PORT"

echo "Running non-interactive onboarding..."
bot onboard --non-interactive --accept-risk \
  --mode local \
  --auth-choice openai-api-key \
  --secret-input-mode ref \
  --gateway-port "$PORT" \
  --gateway-bind loopback \
  --skip-daemon \
  --skip-ui \
  --skip-skills \
  --skip-health \
  --json >/tmp/bot-onboard.json

node scripts/e2e/lib/npm-onboard-channel-agent/assertions.mjs assert-onboard-state "$HOME"

bot_e2e_assert_dep_absent "$DEP_SENTINEL" "$HOME/.bot"

echo "Configuring $CHANNEL..."
bot channels add --channel "$CHANNEL" "${CHANNEL_ADD_ARGS[@]}" >/tmp/bot-channel-add.log 2>&1
node scripts/e2e/lib/npm-onboard-channel-agent/assertions.mjs assert-channel-config "$CHANNEL" "${CHANNEL_CONFIG_TOKENS[@]}"

echo "Checking status surfaces for $CHANNEL..."
bot channels status --json >/tmp/bot-channels-status.json 2>/tmp/bot-channels-status.err
bot status >/tmp/bot-status.txt 2>/tmp/bot-status.err
node scripts/e2e/lib/npm-onboard-channel-agent/assertions.mjs assert-status-surfaces "$CHANNEL" /tmp/bot-channels-status.json /tmp/bot-status.txt

echo "Running doctor after channel activation..."
bot doctor --repair --non-interactive >/tmp/bot-doctor.log 2>&1
if [ "$CHANNEL_PACKAGE_MODE" = "external" ]; then
  bot_e2e_assert_dep_present "$DEP_SENTINEL" "$HOME/.bot"
else
  bot_e2e_assert_dep_absent "$DEP_SENTINEL" "$HOME/.bot"
fi

node scripts/e2e/lib/npm-onboard-channel-agent/assertions.mjs configure-mock-model "$MOCK_PORT"
node scripts/e2e/lib/npm-onboard-channel-agent/assertions.mjs assert-mock-model-config "$MOCK_PORT"

echo "Running local agent turn against mocked OpenAI..."
if bot agent --local \
  --agent main \
  --session-id npm-onboard-channel-agent \
  --message "Return the success marker from the test server." \
  --thinking off \
  --json >/tmp/bot-agent.combined 2>&1; then
  agent_status=0
else
  agent_status=$?
fi
if [ "$agent_status" -ne 0 ]; then
  dump_debug_logs "$agent_status"
  exit "$agent_status"
fi

node scripts/e2e/lib/npm-onboard-channel-agent/assertions.mjs assert-agent-turn "$SUCCESS_MARKER" "$MOCK_REQUEST_LOG"

echo "npm tarball onboard/channel/agent Docker E2E passed for $CHANNEL"
EOF
  docker_e2e_print_log "$run_log"
  exit 1
fi

echo "npm tarball onboard/channel/agent Docker E2E passed ($CHANNEL)"
