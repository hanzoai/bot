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
DEFAULT_PROVIDER="${BOT_DOCKER_CLI_BACKEND_PROVIDER:-claude-cli}"
CLI_MODEL="${BOT_LIVE_CLI_BACKEND_MODEL:-}"
CLI_PROVIDER="${CLI_MODEL%%/*}"
CLI_DISABLE_MCP_CONFIG="${BOT_LIVE_CLI_BACKEND_DISABLE_MCP_CONFIG:-}"
CLI_AUTH_MODE="${BOT_LIVE_CLI_BACKEND_AUTH:-auto}"
CLI_SETUP_TIMEOUT_SECONDS="$(bot_live_read_positive_int_env BOT_LIVE_CLI_BACKEND_SETUP_TIMEOUT_SECONDS 180)"
TEMP_DIRS=()
DOCKER_USER="${BOT_DOCKER_USER:-node}"
DOCKER_HOME_MOUNT=()
DOCKER_EXTRA_ENV_FILES=()
DOCKER_AUTH_PRESTAGED=0
DOCKER_TRUSTED_HARNESS_CONTAINER_DIR="/trusted-harness"
DOCKER_TRUSTED_HARNESS_MOUNT=(-v "$TRUSTED_HARNESS_DIR":"$DOCKER_TRUSTED_HARNESS_CONTAINER_DIR":ro)

if [[ -z "$CLI_PROVIDER" || "$CLI_PROVIDER" == "$CLI_MODEL" ]]; then
  CLI_PROVIDER="$DEFAULT_PROVIDER"
fi
if [[ -f "$PROFILE_FILE" && -r "$PROFILE_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$PROFILE_FILE"
  set +a
fi

case "$CLI_AUTH_MODE" in
  auto | api-key | subscription)
    ;;
  *)
    echo "ERROR: BOT_LIVE_CLI_BACKEND_AUTH must be one of: auto, api-key, subscription." >&2
    exit 1
    ;;
esac

if [[ "$CLI_AUTH_MODE" == "subscription" && "$CLI_PROVIDER" != "claude-cli" ]]; then
  echo "ERROR: BOT_LIVE_CLI_BACKEND_AUTH=subscription is only supported for claude-cli." >&2
  exit 1
fi

if [[ "$CLI_PROVIDER" == "codex-cli" ]]; then
  echo "ERROR: codex-cli is no longer a bundled CLI backend. Use openai/* with the Codex app-server runtime instead." >&2
  exit 1
fi

CLI_METADATA_JSON="$(node --import tsx "$ROOT_DIR/scripts/print-cli-backend-live-metadata.ts" "$CLI_PROVIDER")"
read_metadata_field() {
  local field="$1"
  node -e 'const data = JSON.parse(process.argv[1]); const field = process.argv[2]; const value = data?.[field]; if (value == null) process.exit(1); process.stdout.write(typeof value === "string" ? value : JSON.stringify(value));' \
    "$CLI_METADATA_JSON" \
    "$field"
}

DEFAULT_MODEL="$(read_metadata_field defaultModelRef 2>/dev/null || printf '%s' 'claude-cli/claude-sonnet-4-6')"
CLI_MODEL="${CLI_MODEL:-$DEFAULT_MODEL}"
CLI_DEFAULT_COMMAND="$(read_metadata_field command 2>/dev/null || true)"
CLI_DOCKER_NPM_PACKAGE="$(read_metadata_field dockerNpmPackage 2>/dev/null || true)"
CLI_DOCKER_BINARY_NAME="$(read_metadata_field dockerBinaryName 2>/dev/null || true)"

if [[ "$CLI_PROVIDER" == "claude-cli" && -z "$CLI_DISABLE_MCP_CONFIG" ]]; then
  if [[ "$CLI_AUTH_MODE" == "subscription" ]]; then
    CLI_DISABLE_MCP_CONFIG="1"
  else
    CLI_DISABLE_MCP_CONFIG="0"
  fi
fi
export BOT_LIVE_CLI_BACKEND_MODEL_SWITCH_PROBE="${BOT_LIVE_CLI_BACKEND_MODEL_SWITCH_PROBE:-0}"
export BOT_LIVE_CLI_BACKEND_IMAGE_PROBE="${BOT_LIVE_CLI_BACKEND_IMAGE_PROBE:-0}"
export BOT_LIVE_CLI_BACKEND_MCP_PROBE="${BOT_LIVE_CLI_BACKEND_MCP_PROBE:-0}"

cleanup_temp_dirs() {
  if ((${#TEMP_DIRS[@]} > 0)); then
    rm -rf "${TEMP_DIRS[@]}"
  fi
}
trap cleanup_temp_dirs EXIT

if [[ -n "${BOT_DOCKER_CLI_TOOLS_DIR:-}" ]]; then
  CLI_TOOLS_DIR="${BOT_DOCKER_CLI_TOOLS_DIR}"
elif bot_live_is_ci; then
  CLI_TOOLS_DIR="$(mktemp -d "${RUNNER_TEMP:-/tmp}/bot-docker-cli-tools.XXXXXX")"
  TEMP_DIRS+=("$CLI_TOOLS_DIR")
else
  CLI_TOOLS_DIR="$HOME/.cache/bot/docker-cli-tools"
fi
if [[ -n "${BOT_DOCKER_CACHE_HOME_DIR:-}" ]]; then
  CACHE_HOME_DIR="${BOT_DOCKER_CACHE_HOME_DIR}"
elif bot_live_is_ci; then
  CACHE_HOME_DIR="$(mktemp -d "${RUNNER_TEMP:-/tmp}/bot-docker-cache.XXXXXX")"
  TEMP_DIRS+=("$CACHE_HOME_DIR")
else
  CACHE_HOME_DIR="$HOME/.cache/bot/docker-cache"
fi

bot_live_prepare_bind_dir_for_container_user "$CLI_TOOLS_DIR"
bot_live_prepare_bind_dir_for_container_user "$CACHE_HOME_DIR"
if bot_live_uses_managed_bind_dirs; then
  DOCKER_USER="$(id -u):$(id -g)"
  DOCKER_HOME_DIR="$(mktemp -d "${RUNNER_TEMP:-/tmp}/bot-docker-home.XXXXXX")"
  TEMP_DIRS+=("$DOCKER_HOME_DIR")
  bot_live_prepare_bind_dir_for_container_user "$DOCKER_HOME_DIR"
  DOCKER_HOME_MOUNT=(-v "$DOCKER_HOME_DIR":/home/node)
fi

if [[ "$CLI_PROVIDER" == "claude-cli" && "$CLI_AUTH_MODE" == "subscription" ]]; then
  CLAUDE_CREDS_FILE="$HOME/.claude/.credentials.json"
  CLAUDE_SUBSCRIPTION_AUTH_SOURCE=""
  CLAUDE_SUBSCRIPTION_TYPE=""
  if [[ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]]; then
    CLAUDE_SUBSCRIPTION_TYPE="oauth-token"
    CLAUDE_SUBSCRIPTION_AUTH_SOURCE="env-token"
  elif [[ -f "$CLAUDE_CREDS_FILE" ]]; then
    CLAUDE_SUBSCRIPTION_TYPE="$(
      node -e '
        const fs = require("node:fs");
        const file = process.argv[1];
        const data = JSON.parse(fs.readFileSync(file, "utf8"));
        const subscriptionType = String(data?.claudeAiOauth?.subscriptionType ?? "").trim();
        if (!subscriptionType || subscriptionType === "unknown") process.exit(2);
        process.stdout.write(subscriptionType);
      ' "$CLAUDE_CREDS_FILE" 2>/dev/null
    )" || {
      echo "ERROR: $CLAUDE_CREDS_FILE does not look like Claude subscription OAuth auth." >&2
      echo "Expected claudeAiOauth.subscriptionType to be present." >&2
      exit 1
    }
    CLAUDE_SUBSCRIPTION_AUTH_SOURCE="credentials-file"
  else
    echo "ERROR: Claude subscription auth requires either:" >&2
    echo "  - $CLAUDE_CREDS_FILE with claudeAiOauth.subscriptionType, or" >&2
    echo "  - CLAUDE_CODE_OAUTH_TOKEN from 'claude setup-token'." >&2
    exit 1
  fi
  if [[ -z "${BOT_LIVE_CLI_BACKEND_PRESERVE_ENV:-}" ]]; then
    if [[ "$CLAUDE_SUBSCRIPTION_AUTH_SOURCE" == "env-token" ]]; then
      export BOT_LIVE_CLI_BACKEND_PRESERVE_ENV='["CLAUDE_CODE_OAUTH_TOKEN"]'
    else
      export BOT_LIVE_CLI_BACKEND_PRESERVE_ENV="[]"
    fi
  fi
  if [[ "$BOT_LIVE_CLI_BACKEND_PRESERVE_ENV" == *ANTHROPIC_API_KEY* ]]; then
    echo "ERROR: subscription auth smoke must not preserve Anthropic API-key env vars." >&2
    exit 1
  fi
  if [[ "$CLAUDE_SUBSCRIPTION_AUTH_SOURCE" == "env-token" && "$BOT_LIVE_CLI_BACKEND_PRESERVE_ENV" != *CLAUDE_CODE_OAUTH_TOKEN* ]]; then
    echo "ERROR: CLAUDE_CODE_OAUTH_TOKEN subscription smoke must preserve CLAUDE_CODE_OAUTH_TOKEN for the Gateway child process." >&2
    exit 1
  fi
  export BOT_LIVE_CLI_BACKEND_MODEL_SWITCH_PROBE="${BOT_LIVE_CLI_BACKEND_MODEL_SWITCH_PROBE:-0}"
  export BOT_LIVE_CLI_BACKEND_RESUME_PROBE="${BOT_LIVE_CLI_BACKEND_RESUME_PROBE:-1}"
  export BOT_LIVE_CLI_BACKEND_IMAGE_PROBE="${BOT_LIVE_CLI_BACKEND_IMAGE_PROBE:-0}"
  export BOT_LIVE_CLI_BACKEND_MCP_PROBE="${BOT_LIVE_CLI_BACKEND_MCP_PROBE:-0}"
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

AUTH_DIRS=()
AUTH_FILES=()
if [[ -n "${BOT_DOCKER_AUTH_DIRS:-}" ]]; then
  while IFS= read -r auth_dir; do
    [[ -n "$auth_dir" ]] || continue
    AUTH_DIRS+=("$auth_dir")
  done < <(bot_live_collect_auth_dirs)
  while IFS= read -r auth_file; do
    [[ -n "$auth_file" ]] || continue
    AUTH_FILES+=("$auth_file")
  done < <(bot_live_collect_auth_files)
else
  while IFS= read -r auth_dir; do
    [[ -n "$auth_dir" ]] || continue
    AUTH_DIRS+=("$auth_dir")
  done < <(bot_live_collect_auth_dirs_from_csv "$CLI_PROVIDER")
  while IFS= read -r auth_file; do
    [[ -n "$auth_file" ]] || continue
    AUTH_FILES+=("$auth_file")
  done < <(bot_live_collect_auth_files_from_csv "$CLI_PROVIDER")
fi
if [[ "${CLAUDE_SUBSCRIPTION_AUTH_SOURCE:-}" == "env-token" ]]; then
  retained_auth_files=()
  for auth_file in "${AUTH_FILES[@]}"; do
    case "$auth_file" in
      .claude.json | .claude/.credentials.json) ;;
      *) retained_auth_files+=("$auth_file") ;;
    esac
  done
  AUTH_FILES=("${retained_auth_files[@]}")
fi
AUTH_DIRS_CSV=""
if ((${#AUTH_DIRS[@]} > 0)); then
  AUTH_DIRS_CSV="$(bot_live_join_csv "${AUTH_DIRS[@]}")"
fi
AUTH_FILES_CSV=""
if ((${#AUTH_FILES[@]} > 0)); then
  AUTH_FILES_CSV="$(bot_live_join_csv "${AUTH_FILES[@]}")"
fi

if [[ -n "${DOCKER_HOME_DIR:-}" ]]; then
  bot_live_stage_auth_into_home "$DOCKER_HOME_DIR" "${AUTH_DIRS[@]}" --files "${AUTH_FILES[@]}"
  DOCKER_AUTH_PRESTAGED=1
fi

EXTERNAL_AUTH_MOUNTS=()
if ((${#AUTH_DIRS[@]} > 0)); then
  for auth_dir in "${AUTH_DIRS[@]}"; do
    auth_dir="$(bot_live_validate_relative_home_path "$auth_dir")"
    host_path="$HOME/$auth_dir"
    if [[ -d "$host_path" ]]; then
      EXTERNAL_AUTH_MOUNTS+=(-v "$host_path":/host-auth/"$auth_dir":ro)
    fi
  done
fi
if ((${#AUTH_FILES[@]} > 0)); then
  for auth_file in "${AUTH_FILES[@]}"; do
    auth_file="$(bot_live_validate_relative_home_path "$auth_file")"
    host_path="$HOME/$auth_file"
    if [[ -f "$host_path" ]]; then
      EXTERNAL_AUTH_MOUNTS+=(-v "$host_path":/host-auth-files/"$auth_file":ro)
    fi
  done
fi

read -r -d '' LIVE_TEST_CMD <<'EOF' || true
set -euo pipefail
[ -f "$HOME/.profile" ] && [ -r "$HOME/.profile" ] && source "$HOME/.profile" || true
export NPM_CONFIG_PREFIX="${NPM_CONFIG_PREFIX:-$HOME/.npm-global}"
export npm_config_prefix="$NPM_CONFIG_PREFIX"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"
export COREPACK_HOME="${COREPACK_HOME:-$XDG_CACHE_HOME/node/corepack}"
export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-$XDG_CACHE_HOME/npm}"
export npm_config_cache="$NPM_CONFIG_CACHE"
mkdir -p "$NPM_CONFIG_PREFIX" "$XDG_CACHE_HOME" "$COREPACK_HOME" "$NPM_CONFIG_CACHE"
chmod 700 "$XDG_CACHE_HOME" "$COREPACK_HOME" "$NPM_CONFIG_CACHE" || true
export PATH="$NPM_CONFIG_PREFIX/bin:$PATH"
run_setup_command() {
  local timeout_value="${BOT_LIVE_CLI_BACKEND_SETUP_TIMEOUT_SECONDS:?missing live CLI backend setup timeout seconds}s"
  local timeout_bin=""
  if command -v timeout >/dev/null 2>&1; then
    timeout_bin="timeout"
  elif command -v gtimeout >/dev/null 2>&1; then
    timeout_bin="gtimeout"
  else
    echo "timeout command not found; cannot bound live CLI backend setup after ${timeout_value}" >&2
    return 127
  fi
  if "$timeout_bin" --kill-after=1s 1s true >/dev/null 2>&1; then
    "$timeout_bin" --kill-after=30s "$timeout_value" "$@"
  else
    "$timeout_bin" "$timeout_value" "$@"
  fi
}
if [ "${BOT_DOCKER_AUTH_PRESTAGED:-0}" != "1" ]; then
  IFS=',' read -r -a auth_dirs <<<"${BOT_DOCKER_AUTH_DIRS_RESOLVED:-}"
  IFS=',' read -r -a auth_files <<<"${BOT_DOCKER_AUTH_FILES_RESOLVED:-}"
  if ((${#auth_dirs[@]} > 0)); then
    for auth_dir in "${auth_dirs[@]}"; do
      [ -n "$auth_dir" ] || continue
      if [ -d "/host-auth/$auth_dir" ]; then
        mkdir -p "$HOME/$auth_dir"
        cp -R "/host-auth/$auth_dir/." "$HOME/$auth_dir"
        chmod -R u+rwX "$HOME/$auth_dir" || true
      fi
    done
  fi
  if ((${#auth_files[@]} > 0)); then
    for auth_file in "${auth_files[@]}"; do
      [ -n "$auth_file" ] || continue
      if [ -f "/host-auth-files/$auth_file" ]; then
        mkdir -p "$(dirname "$HOME/$auth_file")"
        cp "/host-auth-files/$auth_file" "$HOME/$auth_file"
        chmod u+rw "$HOME/$auth_file" || true
      fi
    done
  fi
fi
provider="${BOT_DOCKER_CLI_BACKEND_PROVIDER:-claude-cli}"
default_command="${BOT_DOCKER_CLI_BACKEND_COMMAND_DEFAULT:-}"
docker_package="${BOT_DOCKER_CLI_BACKEND_NPM_PACKAGE:-}"
binary_name="${BOT_DOCKER_CLI_BACKEND_BINARY_NAME:-}"
if [ -z "$binary_name" ] && [ -n "$default_command" ]; then
  binary_name="$(basename "$default_command")"
fi
if [ -z "${BOT_LIVE_CLI_BACKEND_COMMAND:-}" ] && [ -n "$binary_name" ]; then
  export BOT_LIVE_CLI_BACKEND_COMMAND="$NPM_CONFIG_PREFIX/bin/$binary_name"
fi
package_has_explicit_version() {
  case "$1" in
    @*/*@*) return 0 ;;
    *@*)
      [[ "$1" != @* ]]
      return
      ;;
    *) return 1 ;;
  esac
}
if [ -n "${BOT_LIVE_CLI_BACKEND_COMMAND:-}" ] && [ ! -x "${BOT_LIVE_CLI_BACKEND_COMMAND}" ] && [ -n "$docker_package" ]; then
  run_setup_command npm install -g "$docker_package"
elif [ -n "$docker_package" ] && package_has_explicit_version "$docker_package"; then
  run_setup_command npm install -g "$docker_package"
fi
if [ -n "${BOT_LIVE_CLI_BACKEND_COMMAND:-}" ] && [ -x "${BOT_LIVE_CLI_BACKEND_COMMAND}" ]; then
  echo "==> CLI backend binary: ${BOT_LIVE_CLI_BACKEND_COMMAND}"
  "${BOT_LIVE_CLI_BACKEND_COMMAND}" -V || "${BOT_LIVE_CLI_BACKEND_COMMAND}" --version || true
fi
if [ "$provider" = "claude-cli" ]; then
  auth_mode="${BOT_LIVE_CLI_BACKEND_AUTH:-auto}"
  if [ "$auth_mode" = "subscription" ]; then
    unset ANTHROPIC_API_KEY
    unset ANTHROPIC_API_KEY_OLD
    unset ANTHROPIC_API_TOKEN
    unset ANTHROPIC_AUTH_TOKEN
    unset ANTHROPIC_OAUTH_TOKEN
    node - <<'NODE'
const fs = require("node:fs");
const file = `${process.env.HOME}/.claude/.credentials.json`;
if (process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim()) {
  console.error("[claude-subscription] using CLAUDE_CODE_OAUTH_TOKEN from environment");
} else if (fs.existsSync(file)) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const subscriptionType = String(data?.claudeAiOauth?.subscriptionType ?? "").trim();
  if (!subscriptionType || subscriptionType === "unknown") {
    throw new Error("Claude subscription OAuth credentials are missing subscriptionType.");
  }
  console.error(`[claude-subscription] subscriptionType=${subscriptionType}`);
} else {
  throw new Error("Claude subscription OAuth token or credentials file is required.");
}
NODE
  fi
  real_claude="$NPM_CONFIG_PREFIX/bin/claude-real"
  if [ ! -x "$real_claude" ] && [ -x "$NPM_CONFIG_PREFIX/bin/claude" ]; then
    mv "$NPM_CONFIG_PREFIX/bin/claude" "$real_claude"
  fi
  if [ -x "$real_claude" ]; then
    cat > "$NPM_CONFIG_PREFIX/bin/claude" <<WRAP
#!/usr/bin/env bash
script_dir="\$(CDPATH= cd -- "\$(dirname -- "\$0")" && pwd)"
if [ -n "\${BOT_LIVE_CLI_BACKEND_ANTHROPIC_API_KEY:-}" ]; then
  export ANTHROPIC_API_KEY="\${BOT_LIVE_CLI_BACKEND_ANTHROPIC_API_KEY}"
fi
if [ -n "\${BOT_LIVE_CLI_BACKEND_ANTHROPIC_API_KEY_OLD:-}" ]; then
  export ANTHROPIC_API_KEY_OLD="\${BOT_LIVE_CLI_BACKEND_ANTHROPIC_API_KEY_OLD}"
fi
exec "\$script_dir/claude-real" "\$@"
WRAP
    chmod +x "$NPM_CONFIG_PREFIX/bin/claude"
  fi
  if [ -z "${BOT_LIVE_CLI_BACKEND_PRESERVE_ENV:-}" ]; then
    export BOT_LIVE_CLI_BACKEND_PRESERVE_ENV='["ANTHROPIC_API_KEY","ANTHROPIC_API_KEY_OLD"]'
  fi
  if [ "$auth_mode" = "subscription" ]; then
    claude --version
    direct_probe_log="$(mktemp)"
    set +e
    claude \
      -p "This is a local CLI smoke test. What is two plus two? Reply with only the result." \
      --output-format text \
      --model sonnet \
      --permission-mode bypassPermissions \
      --setting-sources user \
      --strict-mcp-config \
      --mcp-config '{"mcpServers":{}}' \
      --no-session-persistence >"$direct_probe_log" 2>&1
    direct_probe_status=$?
    set -e
    print_redacted_direct_probe_log() {
      sed -E \
        -e 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/<redacted-email>/g' \
        -e 's/(sk-ant-|sk-)[A-Za-z0-9_-]+/<redacted-secret>/g' \
        "$direct_probe_log" >&2
    }
    if [ "$direct_probe_status" -ne 0 ]; then
      echo "ERROR: direct Claude subscription probe exited with status $direct_probe_status." >&2
      print_redacted_direct_probe_log
      rm -f "$direct_probe_log"
      exit "$direct_probe_status"
    fi
    if ! grep -Eiq '(^|[^[:alnum:]])(4|four)([^[:alnum:]]|$)' "$direct_probe_log"; then
      echo "ERROR: direct Claude subscription probe did not return the expected arithmetic result." >&2
      print_redacted_direct_probe_log
      rm -f "$direct_probe_log"
      exit 1
    fi
    rm -f "$direct_probe_log"
    echo "[claude-subscription] direct claude -p probe ok"
  else
    claude auth status || true
  fi
fi
tmp_dir="$(mktemp -d)"
trusted_scripts_dir="${BOT_LIVE_DOCKER_SCRIPTS_DIR:-/src/scripts}"
source "$trusted_scripts_dir/lib/live-docker-stage.sh"
bot_live_stage_source_tree "$tmp_dir"
# Use a writable node_modules overlay in the temp repo. Vite writes bundled
# config artifacts under the nearest node_modules/.vite-temp path, and the
# build-stage /app/node_modules tree is root-owned in this Docker lane.
bot_live_stage_node_modules "$tmp_dir"
bot_live_link_runtime_tree "$tmp_dir"
bot_live_stage_state_dir "$tmp_dir/.bot-state"
bot_live_prepare_staged_config
cd "$tmp_dir"
node scripts/test-live.mjs -- src/gateway/gateway-cli-backend.live.test.ts
EOF

BOT_LIVE_DOCKER_REPO_ROOT="$ROOT_DIR" "$TRUSTED_HARNESS_DIR/scripts/test-live-build-docker.sh"
if bot_live_uses_managed_bind_dirs; then
  bot_live_chown_bind_dirs_for_container_user \
    "$LIVE_IMAGE_NAME" \
    "$DOCKER_USER" \
    "$CLI_TOOLS_DIR" \
    "$CACHE_HOME_DIR" \
    "${DOCKER_HOME_DIR:-}"
fi

echo "==> Run CLI backend live test in Docker"
echo "==> Model: $CLI_MODEL"
echo "==> Provider: $CLI_PROVIDER"
echo "==> Auth mode: $CLI_AUTH_MODE"
echo "==> Setup timeout: ${CLI_SETUP_TIMEOUT_SECONDS}s"
echo "==> Profile file: $PROFILE_STATUS"
if [[ "$CLI_PROVIDER" == "claude-cli" && "$CLI_AUTH_MODE" == "subscription" ]]; then
  echo "==> Claude subscription: $CLAUDE_SUBSCRIPTION_TYPE"
  echo "==> Claude subscription source: $CLAUDE_SUBSCRIPTION_AUTH_SOURCE"
fi
echo "==> External auth dirs: ${AUTH_DIRS_CSV:-none}"
echo "==> External auth files: ${AUTH_FILES_CSV:-none}"
DOCKER_AUTH_ENV=(
  -e BOT_LIVE_CLI_BACKEND_AUTH="$CLI_AUTH_MODE"
)
if [[ "$CLI_PROVIDER" == "claude-cli" && "$CLI_AUTH_MODE" == "subscription" ]]; then
  DOCKER_AUTH_ENV+=(
    -e CLAUDE_CODE_OAUTH_TOKEN="${CLAUDE_CODE_OAUTH_TOKEN:-}"
    -e BOT_LIVE_CLI_BACKEND_PRESERVE_ENV="$BOT_LIVE_CLI_BACKEND_PRESERVE_ENV"
  )
else
  DOCKER_AUTH_ENV+=(
    -e ANTHROPIC_API_KEY
    -e ANTHROPIC_API_KEY_OLD
    -e BOT_LIVE_CLI_BACKEND_ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
    -e BOT_LIVE_CLI_BACKEND_ANTHROPIC_API_KEY_OLD="${ANTHROPIC_API_KEY_OLD:-}"
    -e BOT_LIVE_CLI_BACKEND_PRESERVE_ENV="${BOT_LIVE_CLI_BACKEND_PRESERVE_ENV:-}"
  )
fi

DOCKER_RUN_ARGS=()
bot_live_init_docker_run_args DOCKER_RUN_ARGS "${BOT_LIVE_CLI_BACKEND_DOCKER_RUN_TIMEOUT:-2700s}"
DOCKER_RUN_ARGS+=(--rm -t \
  -u "$DOCKER_USER" \
  --entrypoint bash \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e HOME=/home/node \
  -e NODE_OPTIONS="$(bot_live_container_node_options)" \
  -e BOT_SKIP_CHANNELS=1 \
  -e BOT_VITEST_FS_MODULE_CACHE=0 \
  -e BOT_DOCKER_AUTH_PRESTAGED="$DOCKER_AUTH_PRESTAGED" \
  -e BOT_DOCKER_AUTH_DIRS_RESOLVED="$AUTH_DIRS_CSV" \
  -e BOT_DOCKER_AUTH_FILES_RESOLVED="$AUTH_FILES_CSV" \
  -e BOT_LIVE_DOCKER_SCRIPTS_DIR="${DOCKER_TRUSTED_HARNESS_CONTAINER_DIR}/scripts" \
  -e BOT_LIVE_DOCKER_SOURCE_STAGE_MODE="${BOT_LIVE_DOCKER_SOURCE_STAGE_MODE:-copy}" \
  -e BOT_LIVE_CLI_BACKEND_SETUP_TIMEOUT_SECONDS="$CLI_SETUP_TIMEOUT_SECONDS" \
  -e BOT_DOCKER_CLI_BACKEND_PROVIDER="$CLI_PROVIDER" \
  -e BOT_DOCKER_CLI_BACKEND_COMMAND_DEFAULT="$CLI_DEFAULT_COMMAND" \
  -e BOT_DOCKER_CLI_BACKEND_NPM_PACKAGE="$CLI_DOCKER_NPM_PACKAGE" \
  -e BOT_DOCKER_CLI_BACKEND_BINARY_NAME="$CLI_DOCKER_BINARY_NAME" \
  -e BOT_LIVE_TEST=1 \
  -e BOT_LIVE_CLI_BACKEND=1 \
  -e BOT_LIVE_CLI_BACKEND_DEBUG="${BOT_LIVE_CLI_BACKEND_DEBUG:-}" \
  -e BOT_LIVE_CLI_BACKEND_ADVISORY="${BOT_LIVE_CLI_BACKEND_ADVISORY:-}" \
  -e BOT_LIVE_CLI_BACKEND_ALLOW_PROVIDER_SKIP="${BOT_LIVE_CLI_BACKEND_ALLOW_PROVIDER_SKIP:-}" \
  -e BOT_CLI_BACKEND_LOG_OUTPUT="${BOT_CLI_BACKEND_LOG_OUTPUT:-}" \
  -e BOT_TEST_CONSOLE="${BOT_TEST_CONSOLE:-}" \
  -e BOT_LIVE_CLI_BACKEND_MODEL="$CLI_MODEL" \
  -e BOT_LIVE_CLI_BACKEND_COMMAND="${BOT_LIVE_CLI_BACKEND_COMMAND:-}" \
  -e BOT_LIVE_CLI_BACKEND_ARGS="${BOT_LIVE_CLI_BACKEND_ARGS:-}" \
  -e BOT_LIVE_CLI_BACKEND_RESUME_ARGS="${BOT_LIVE_CLI_BACKEND_RESUME_ARGS:-}" \
  -e BOT_LIVE_CLI_BACKEND_CLEAR_ENV="${BOT_LIVE_CLI_BACKEND_CLEAR_ENV:-}" \
  -e BOT_LIVE_CLI_BACKEND_DISABLE_MCP_CONFIG="$CLI_DISABLE_MCP_CONFIG" \
  -e BOT_LIVE_CLI_BACKEND_RESUME_PROBE="${BOT_LIVE_CLI_BACKEND_RESUME_PROBE:-}" \
  -e BOT_LIVE_CLI_BACKEND_MODEL_SWITCH_PROBE="${BOT_LIVE_CLI_BACKEND_MODEL_SWITCH_PROBE:-}" \
  -e BOT_LIVE_CLI_BACKEND_IMAGE_PROBE="${BOT_LIVE_CLI_BACKEND_IMAGE_PROBE:-}" \
  -e BOT_LIVE_CLI_BACKEND_MCP_PROBE="${BOT_LIVE_CLI_BACKEND_MCP_PROBE:-}" \
  -e BOT_LIVE_CLI_BACKEND_MCP_SCHEMA_PROBE="${BOT_LIVE_CLI_BACKEND_MCP_SCHEMA_PROBE:-}" \
  -e BOT_LIVE_CLI_BACKEND_IMAGE_ARG="${BOT_LIVE_CLI_BACKEND_IMAGE_ARG:-}" \
  -e BOT_LIVE_CLI_BACKEND_IMAGE_MODE="${BOT_LIVE_CLI_BACKEND_IMAGE_MODE:-}")
bot_live_append_array DOCKER_RUN_ARGS DOCKER_HOME_MOUNT
bot_live_append_array DOCKER_RUN_ARGS DOCKER_EXTRA_ENV_FILES
bot_live_append_array DOCKER_RUN_ARGS DOCKER_TRUSTED_HARNESS_MOUNT
DOCKER_RUN_ARGS+=(\
  -v "$CACHE_HOME_DIR":/home/node/.cache \
  -v "$ROOT_DIR":/src:ro \
  -v "$CONFIG_DIR":/home/node/.bot \
  -v "$WORKSPACE_DIR":/home/node/.bot/workspace \
  -v "$CLI_TOOLS_DIR":/home/node/.npm-global)
bot_live_append_array DOCKER_RUN_ARGS EXTERNAL_AUTH_MOUNTS
bot_live_append_array DOCKER_RUN_ARGS DOCKER_AUTH_ENV
bot_live_append_array DOCKER_RUN_ARGS PROFILE_MOUNT
DOCKER_RUN_ARGS+=(\
  "$LIVE_IMAGE_NAME" \
  -lc "$LIVE_TEST_CMD")
"${DOCKER_RUN_ARGS[@]}"
