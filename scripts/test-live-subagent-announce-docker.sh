#!/usr/bin/env bash
set -euo pipefail

SCRIPT_ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="${BOT_LIVE_DOCKER_REPO_ROOT:-$SCRIPT_ROOT_DIR}"
ROOT_DIR="$(cd "$ROOT_DIR" && pwd)"
TRUSTED_HARNESS_DIR="${BOT_LIVE_DOCKER_TRUSTED_HARNESS_DIR:-$SCRIPT_ROOT_DIR}"
if [[ -z "$TRUSTED_HARNESS_DIR" || ! -d "$TRUSTED_HARNESS_DIR" ]]; then
  echo "ERROR: trusted live Docker harness directory not found: ${TRUSTED_HARNESS_DIR:-<empty>}." >&2
  exit 1
fi
TRUSTED_HARNESS_DIR="$(cd "$TRUSTED_HARNESS_DIR" && pwd)"
source "$TRUSTED_HARNESS_DIR/scripts/lib/live-docker-auth.sh"

IMAGE_NAME="${BOT_IMAGE:-bot:local}"
LIVE_IMAGE_NAME="${BOT_LIVE_IMAGE:-${IMAGE_NAME}-live}"
CONFIG_DIR="${BOT_CONFIG_DIR:-$HOME/.bot}"
WORKSPACE_DIR="${BOT_WORKSPACE_DIR:-$HOME/.bot/workspace}"
PROFILE_FILE="$(bot_live_default_profile_file)"
DOCKER_USER="${BOT_DOCKER_USER:-node}"
DOCKER_HOME_MOUNT=()
DOCKER_EXTRA_ENV_FILES=()
DOCKER_TRUSTED_HARNESS_CONTAINER_DIR="/trusted-harness"
DOCKER_TRUSTED_HARNESS_MOUNT=(-v "$TRUSTED_HARNESS_DIR":"$DOCKER_TRUSTED_HARNESS_CONTAINER_DIR":ro)
TEMP_DIRS=()

cleanup_temp_dirs() {
  if ((${#TEMP_DIRS[@]} > 0)); then
    rm -rf "${TEMP_DIRS[@]}"
  fi
}
trap cleanup_temp_dirs EXIT

if [[ -n "${BOT_DOCKER_CACHE_HOME_DIR:-}" ]]; then
  CACHE_HOME_DIR="${BOT_DOCKER_CACHE_HOME_DIR}"
elif bot_live_is_ci; then
  CACHE_HOME_DIR="$(mktemp -d "${RUNNER_TEMP:-/tmp}/bot-docker-cache.XXXXXX")"
  TEMP_DIRS+=("$CACHE_HOME_DIR")
else
  CACHE_HOME_DIR="$HOME/.cache/bot/docker-cache"
fi
bot_live_prepare_bind_dir_for_container_user "$CACHE_HOME_DIR"

if bot_live_uses_managed_bind_dirs; then
  DOCKER_USER="$(id -u):$(id -g)"
  DOCKER_HOME_DIR="$(mktemp -d "${RUNNER_TEMP:-/tmp}/bot-docker-home.XXXXXX")"
  TEMP_DIRS+=("$DOCKER_HOME_DIR")
  bot_live_prepare_bind_dir_for_container_user "$DOCKER_HOME_DIR"
  DOCKER_HOME_MOUNT=(-v "$DOCKER_HOME_DIR":/home/node)
fi

PROFILE_MOUNT=()
PROFILE_STATUS="none"
if [[ -f "$PROFILE_FILE" && -r "$PROFILE_FILE" ]]; then
  if [[ -n "${DOCKER_HOME_DIR:-}" ]]; then
    bot_live_stage_profile_into_home "$DOCKER_HOME_DIR" "$PROFILE_FILE"
  else
    PROFILE_MOUNT=(-v "$PROFILE_FILE":/home/node/.profile:ro)
  fi
  PROFILE_STATUS="$PROFILE_FILE"
fi

if [[ -n "${OPENAI_API_KEY:-}" || -n "${OPENAI_BASE_URL:-}" || -n "${GEMINI_API_KEY:-}" || -n "${GOOGLE_API_KEY:-}" ]]; then
  docker_env_dir="$(mktemp -d "${RUNNER_TEMP:-/tmp}/bot-subagent-live-env.XXXXXX")"
  TEMP_DIRS+=("$docker_env_dir")
  docker_env_file="$docker_env_dir/provider.env"
  {
    if [[ -n "${OPENAI_API_KEY:-}" ]]; then
      printf 'BOT_DOCKER_LIVE_OPENAI_API_KEY=%s\n' "${OPENAI_API_KEY}"
    fi
    if [[ -n "${OPENAI_BASE_URL:-}" ]]; then
      printf 'BOT_DOCKER_LIVE_OPENAI_BASE_URL=%s\n' "${OPENAI_BASE_URL}"
    fi
    if [[ -n "${GEMINI_API_KEY:-}" ]]; then
      printf 'BOT_DOCKER_LIVE_GEMINI_API_KEY=%s\n' "${GEMINI_API_KEY}"
    fi
    if [[ -n "${GOOGLE_API_KEY:-}" ]]; then
      printf 'BOT_DOCKER_LIVE_GOOGLE_API_KEY=%s\n' "${GOOGLE_API_KEY}"
    fi
  } >"$docker_env_file"
  DOCKER_EXTRA_ENV_FILES+=(--env-file "$docker_env_file")
fi

CONTAINER_NODE_OPTIONS="$(bot_live_container_node_options)"

read -r -d '' LIVE_TEST_CMD <<'EOF' || true
set -euo pipefail
[ -f "$HOME/.profile" ] && [ -r "$HOME/.profile" ] && source "$HOME/.profile" || true
if [ -n "${BOT_DOCKER_LIVE_OPENAI_API_KEY:-}" ]; then
  export OPENAI_API_KEY="$BOT_DOCKER_LIVE_OPENAI_API_KEY"
  unset BOT_DOCKER_LIVE_OPENAI_API_KEY
fi
if [ -n "${BOT_DOCKER_LIVE_OPENAI_BASE_URL:-}" ]; then
  export OPENAI_BASE_URL="$BOT_DOCKER_LIVE_OPENAI_BASE_URL"
  unset BOT_DOCKER_LIVE_OPENAI_BASE_URL
fi
if [ -n "${BOT_DOCKER_LIVE_GEMINI_API_KEY:-}" ]; then
  export GEMINI_API_KEY="$BOT_DOCKER_LIVE_GEMINI_API_KEY"
  unset BOT_DOCKER_LIVE_GEMINI_API_KEY
fi
if [ -n "${BOT_DOCKER_LIVE_GOOGLE_API_KEY:-}" ]; then
  export GOOGLE_API_KEY="$BOT_DOCKER_LIVE_GOOGLE_API_KEY"
  unset BOT_DOCKER_LIVE_GOOGLE_API_KEY
fi
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"
export COREPACK_HOME="${COREPACK_HOME:-$XDG_CACHE_HOME/node/corepack}"
export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-$XDG_CACHE_HOME/npm}"
export npm_config_cache="$NPM_CONFIG_CACHE"
mkdir -p "$XDG_CACHE_HOME" "$COREPACK_HOME" "$NPM_CONFIG_CACHE"
chmod 700 "$XDG_CACHE_HOME" "$COREPACK_HOME" "$NPM_CONFIG_CACHE" || true
tmp_dir="$(mktemp -d)"
trusted_scripts_dir="${BOT_LIVE_DOCKER_SCRIPTS_DIR:-/src/scripts}"
source "$trusted_scripts_dir/lib/live-docker-stage.sh"
bot_live_stage_source_tree "$tmp_dir"
bot_live_stage_node_modules "$tmp_dir"
bot_live_link_runtime_tree "$tmp_dir"
bot_live_stage_state_dir "$tmp_dir/.bot-state"
bot_live_prepare_staged_config
cd "$tmp_dir"
BOT_LIVE_TEST=1 \
BOT_LIVE_SUBAGENT_E2E=1 \
BOT_VITEST_MAX_WORKERS="${BOT_VITEST_MAX_WORKERS:-1}" \
node scripts/test-live.mjs -- src/agents/subagent-announce.live.test.ts -- --reporter=verbose
EOF

BOT_LIVE_DOCKER_REPO_ROOT="$ROOT_DIR" "$TRUSTED_HARNESS_DIR/scripts/test-live-build-docker.sh"
if bot_live_uses_managed_bind_dirs; then
  bot_live_chown_bind_dirs_for_container_user \
    "$LIVE_IMAGE_NAME" \
    "$DOCKER_USER" \
    "$CACHE_HOME_DIR" \
    "${DOCKER_HOME_DIR:-}"
fi

echo "==> Run subagent announce live test in Docker"
echo "==> Target: src/agents/subagent-announce.live.test.ts"
echo "==> Model: ${BOT_LIVE_SUBAGENT_E2E_MODEL:-openai/gpt-5.6-luna}"
echo "==> Profile file: $PROFILE_STATUS"
DOCKER_RUN_ARGS=()
bot_live_init_docker_run_args DOCKER_RUN_ARGS "${BOT_LIVE_SUBAGENT_DOCKER_RUN_TIMEOUT:-1200s}"
DOCKER_RUN_ARGS+=(--rm -t \
  -u "$DOCKER_USER" \
  --entrypoint bash \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e HOME=/home/node \
  -e NODE_OPTIONS="$CONTAINER_NODE_OPTIONS" \
  -e BOT_SKIP_CHANNELS=1 \
  -e BOT_SUPPRESS_NOTES=1 \
  -e BOT_LIVE_DOCKER_SCRIPTS_DIR="${DOCKER_TRUSTED_HARNESS_CONTAINER_DIR}/scripts" \
  -e BOT_LIVE_DOCKER_SOURCE_STAGE_MODE="${BOT_LIVE_DOCKER_SOURCE_STAGE_MODE:-copy}" \
  -e BOT_LIVE_TEST=1 \
  -e BOT_LIVE_TEST_QUIET="${BOT_LIVE_TEST_QUIET:-}" \
  -e BOT_LIVE_WRAPPER_HEARTBEAT_MS="${BOT_LIVE_WRAPPER_HEARTBEAT_MS:-}" \
  -e BOT_LIVE_SUBAGENT_E2E=1 \
  -e BOT_LIVE_SUBAGENT_E2E_MODEL="${BOT_LIVE_SUBAGENT_E2E_MODEL:-}" \
  -e BOT_VITEST_FS_MODULE_CACHE=0 \
  -e BOT_VITEST_MAX_WORKERS="${BOT_VITEST_MAX_WORKERS:-1}")
bot_live_append_array DOCKER_RUN_ARGS DOCKER_EXTRA_ENV_FILES
bot_live_append_array DOCKER_RUN_ARGS DOCKER_HOME_MOUNT
bot_live_append_array DOCKER_RUN_ARGS DOCKER_TRUSTED_HARNESS_MOUNT
DOCKER_RUN_ARGS+=(\
  -v "$CACHE_HOME_DIR":/home/node/.cache \
  -v "$ROOT_DIR":/src:ro \
  -v "$CONFIG_DIR":/home/node/.bot \
  -v "$WORKSPACE_DIR":/home/node/.bot/workspace)
bot_live_append_array DOCKER_RUN_ARGS PROFILE_MOUNT
DOCKER_RUN_ARGS+=(\
  "$LIVE_IMAGE_NAME" \
  -lc "$LIVE_TEST_CMD")
"${DOCKER_RUN_ARGS[@]}"
