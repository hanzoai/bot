#!/usr/bin/env bash
# Installs a packed plugin with a real npm dependency, exposes its tool to a
# live OpenAI agent turn, and verifies the model received the dependency-made string.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/lib/bot-e2e-instance.sh"
source "$ROOT_DIR/scripts/lib/docker-e2e-image.sh"
source "$ROOT_DIR/scripts/lib/docker-e2e-package.sh"

IMAGE_NAME="$(docker_e2e_resolve_image "bot-live-plugin-tool-e2e" BOT_LIVE_PLUGIN_TOOL_E2E_IMAGE)"
DOCKER_TARGET="${BOT_LIVE_PLUGIN_TOOL_DOCKER_TARGET:-bare}"
HOST_BUILD="${BOT_LIVE_PLUGIN_TOOL_HOST_BUILD:-1}"
PACKAGE_TGZ="${BOT_CURRENT_PACKAGE_TGZ:-}"
PROFILE_FILE="${BOT_LIVE_PLUGIN_TOOL_PROFILE_FILE:-${BOT_TESTBOX_PROFILE_FILE:-$HOME/.bot-testbox-live.profile}}"
AGENT_TURN_TIMEOUT_SECONDS="$(bot_e2e_read_positive_int_env BOT_LIVE_PLUGIN_TOOL_TIMEOUT_SECONDS 300)"
AGENT_OUTPUT_MAX_BYTES="$(bot_e2e_read_positive_int_env BOT_LIVE_PLUGIN_TOOL_AGENT_OUTPUT_MAX_BYTES 1048576)"
AGENT_OUTPUT_DUMP_BYTES="$(bot_e2e_read_nonnegative_int_env BOT_LIVE_PLUGIN_TOOL_AGENT_OUTPUT_DUMP_BYTES 16384)"
SESSION_SCAN_MAX_ENTRIES="$(bot_e2e_read_positive_int_env BOT_LIVE_PLUGIN_TOOL_SESSION_SCAN_MAX_ENTRIES 50000)"
run_log=""

cleanup() {
  if [ -n "${PACKAGE_TGZ:-}" ]; then
    docker_e2e_cleanup_package_tgz "$PACKAGE_TGZ"
  fi
  if [ -n "${run_log:-}" ]; then
    rm -f "$run_log"
  fi
}
trap cleanup EXIT

if [ ! -f "$PROFILE_FILE" ] && [ -f "$HOME/.profile" ]; then
  PROFILE_FILE="$HOME/.profile"
fi

docker_e2e_build_or_reuse "$IMAGE_NAME" live-plugin-tool "$ROOT_DIR/scripts/e2e/Dockerfile" "$ROOT_DIR" "$DOCKER_TARGET"

prepare_package_tgz() {
  if [ -n "$PACKAGE_TGZ" ]; then
    PACKAGE_TGZ="$(docker_e2e_prepare_package_tgz live-plugin-tool "$PACKAGE_TGZ")"
    return 0
  fi
  if [ "$HOST_BUILD" = "0" ] && [ -z "${BOT_CURRENT_PACKAGE_TGZ:-}" ]; then
    echo "BOT_LIVE_PLUGIN_TOOL_HOST_BUILD=0 requires BOT_CURRENT_PACKAGE_TGZ" >&2
    exit 1
  fi
  PACKAGE_TGZ="$(docker_e2e_prepare_package_tgz live-plugin-tool)"
}

prepare_package_tgz

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
AGENT_TURN_TIMEOUT_SECONDS="$(bot_e2e_read_positive_int_env BOT_LIVE_PLUGIN_TOOL_TIMEOUT_SECONDS "$AGENT_TURN_TIMEOUT_SECONDS")"
COMMAND_TIMEOUT="${BOT_E2E_COMMAND_TIMEOUT:-$((10#$AGENT_TURN_TIMEOUT_SECONDS + 60))s}"

docker_e2e_package_mount_args "$PACKAGE_TGZ"
run_log="$(docker_e2e_run_log live-plugin-tool)"
BOT_TEST_STATE_SCRIPT_B64="$(docker_e2e_test_state_shell_b64 live-plugin-tool empty)"

echo "Running live plugin tool Docker E2E..."
echo "Profile file: $PROFILE_STATUS"
if ! docker_e2e_run_with_harness \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e OPENAI_API_KEY \
  -e OPENAI_BASE_URL \
  -e BOT_LIVE_PLUGIN_TOOL_MODEL="${BOT_LIVE_PLUGIN_TOOL_MODEL:-openai/gpt-5.6-luna}" \
  -e "BOT_LIVE_PLUGIN_TOOL_AGENT_OUTPUT_DUMP_BYTES=$AGENT_OUTPUT_DUMP_BYTES" \
  -e "BOT_LIVE_PLUGIN_TOOL_AGENT_OUTPUT_MAX_BYTES=$AGENT_OUTPUT_MAX_BYTES" \
  -e "BOT_LIVE_PLUGIN_TOOL_SESSION_SCAN_MAX_ENTRIES=$SESSION_SCAN_MAX_ENTRIES" \
  -e "BOT_LIVE_PLUGIN_TOOL_TIMEOUT_SECONDS=$AGENT_TURN_TIMEOUT_SECONDS" \
  -e "BOT_E2E_COMMAND_TIMEOUT=$COMMAND_TIMEOUT" \
  -e "BOT_TEST_STATE_SCRIPT_B64=$BOT_TEST_STATE_SCRIPT_B64" \
  "${DOCKER_E2E_PACKAGE_ARGS[@]}" \
  "${PROFILE_MOUNT[@]}" \
  -i "$IMAGE_NAME" bash -s >"$run_log" 2>&1 <<'EOF'; then
set -euo pipefail

source scripts/lib/bot-e2e-instance.sh
bot_e2e_eval_test_state_from_b64 "${BOT_TEST_STATE_SCRIPT_B64:?missing BOT_TEST_STATE_SCRIPT_B64}"
export NPM_CONFIG_PREFIX="$HOME/.npm-global"
export npm_config_prefix="$NPM_CONFIG_PREFIX"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"
export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-$XDG_CACHE_HOME/npm}"
export npm_config_cache="$NPM_CONFIG_CACHE"
export PATH="$NPM_CONFIG_PREFIX/bin:$PATH"
export BOT_AGENT_HARNESS_FALLBACK=none

for profile_path in "$HOME/.profile" /home/appuser/.profile; do
  if [ -f "$profile_path" ] && [ -r "$profile_path" ]; then
    set +e +u
    source "$profile_path"
    set -euo pipefail
    break
  fi
done
if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "ERROR: OPENAI_API_KEY was not available after sourcing ~/.profile." >&2
  exit 1
fi
export OPENAI_API_KEY
if [ -n "${OPENAI_BASE_URL:-}" ]; then
  export OPENAI_BASE_URL
fi

MODEL_REF="${BOT_LIVE_PLUGIN_TOOL_MODEL:?missing BOT_LIVE_PLUGIN_TOOL_MODEL}"
PLUGIN_ID="e2e-slug-tool"
PLUGIN_NAME="@hanzo/bot-e2e-slug-tool"
PLUGIN_VERSION="0.0.0-e2e.1"
TOOL_NAME="e2e_slug_probe"
SEED="Bot E2E Plugin Tool $(date +%s)-$RANDOM"
EXPECTED_SLUG="$(printf '%s' "$SEED" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
export MODEL_REF PLUGIN_ID PLUGIN_NAME PLUGIN_VERSION TOOL_NAME SEED EXPECTED_SLUG

dump_debug_logs() {
  local status="$1"
  local agent_output_dump_bytes="${BOT_LIVE_PLUGIN_TOOL_AGENT_OUTPUT_DUMP_BYTES:-16384}"
  echo "Live plugin tool scenario failed with exit code $status" >&2
  if [ -f /tmp/bot-agent.json ]; then
    echo "--- /tmp/bot-agent.json (last ${agent_output_dump_bytes} bytes) ---" >&2
    tail -c "$agent_output_dump_bytes" /tmp/bot-agent.json >&2 || true
    echo >&2
  fi
  bot_e2e_dump_logs \
    /tmp/bot-install.log \
    /tmp/bot-plugin-install.log \
    /tmp/bot-plugin-enable.log \
    /tmp/bot-plugins-list.json \
    /tmp/bot-plugin-inspect.json \
    /tmp/bot-live-plugin-tool-pack.log \
    /tmp/bot-agent.err
}
trap 'status=$?; dump_debug_logs "$status"; exit "$status"' ERR

mkdir -p "$NPM_CONFIG_PREFIX" "$XDG_CACHE_HOME" "$NPM_CONFIG_CACHE"
chmod 700 "$XDG_CACHE_HOME" "$NPM_CONFIG_CACHE" || true

bot_e2e_install_package /tmp/bot-install.log
command -v bot >/dev/null
bot_e2e_enable_bot_cli_timeout

fixture_dir="$(mktemp -d /tmp/bot-live-plugin-tool.XXXXXX)"
plugin_dir="$fixture_dir/package"
mkdir -p "$plugin_dir"
node --disable-warning=ExperimentalWarning scripts/e2e/lib/live-plugin-tool/assertions.mjs write-fixture "$plugin_dir"
(cd "$plugin_dir" && npm pack --pack-destination "$fixture_dir" --silent) \
  >/tmp/bot-live-plugin-tool-pack.log 2>&1
plugin_tgzs=()
while IFS= read -r packed_file; do
  plugin_tgzs+=("$packed_file")
done < <(find "$fixture_dir" -maxdepth 1 -type f -name '*.tgz' | sort)
if [ "${#plugin_tgzs[@]}" -ne 1 ]; then
  echo "Expected one packed fixture plugin tarball; found ${#plugin_tgzs[@]}." >&2
  bot_e2e_dump_logs /tmp/bot-live-plugin-tool-pack.log
  exit 1
fi
plugin_tgz="${plugin_tgzs[0]}"

echo "Installing fixture plugin from npm-pack: $plugin_tgz"
bot plugins install "npm-pack:$plugin_tgz" --force >/tmp/bot-plugin-install.log 2>&1
node --disable-warning=ExperimentalWarning scripts/e2e/lib/live-plugin-tool/assertions.mjs configure
bot plugins enable "$PLUGIN_ID" >/tmp/bot-plugin-enable.log 2>&1
bot plugins list --json >/tmp/bot-plugins-list.json
bot plugins inspect "$PLUGIN_ID" --runtime --json >/tmp/bot-plugin-inspect.json
node --disable-warning=ExperimentalWarning scripts/e2e/lib/live-plugin-tool/assertions.mjs assert-installed

echo "Running live OpenAI agent turn that must call $TOOL_NAME..."
bot agent --local \
  --agent main \
  --session-id live-plugin-tool \
  --model "$MODEL_REF" \
  --message "Call the tool named ${TOOL_NAME}. Reply with only the exact text returned by that tool. Do not compute, transform, or explain it." \
  --thinking off \
  --timeout "${BOT_LIVE_PLUGIN_TOOL_TIMEOUT_SECONDS:-300}" \
  --json >/tmp/bot-agent.json 2>/tmp/bot-agent.err

node --disable-warning=ExperimentalWarning scripts/e2e/lib/live-plugin-tool/assertions.mjs assert-agent-turn

echo "Live plugin tool Docker E2E passed"
EOF
  docker_e2e_print_log "$run_log"
  exit 1
fi

echo "Live plugin tool Docker E2E passed"
