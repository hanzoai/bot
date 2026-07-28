#!/usr/bin/env bash
# Installs an Bot package candidate in Docker, performs Telegram
# onboarding/doctor recovery, then runs the Telegram QA live harness.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/lib/docker-e2e-image.sh"

IMAGE_NAME="$(docker_e2e_resolve_image "bot-npm-telegram-live-e2e" BOT_NPM_TELEGRAM_LIVE_E2E_IMAGE)"
DOCKER_TARGET="${BOT_NPM_TELEGRAM_DOCKER_TARGET:-build}"
PACKAGE_SPEC="${BOT_NPM_TELEGRAM_PACKAGE_SPEC:-bot@beta}"
PACKAGE_TGZ="${BOT_NPM_TELEGRAM_PACKAGE_TGZ:-${BOT_CURRENT_PACKAGE_TGZ:-}}"
PACKAGE_DIR="${BOT_NPM_TELEGRAM_PACKAGE_DIR:-}"
PACKAGE_LABEL="${BOT_NPM_TELEGRAM_PACKAGE_LABEL:-}"
RUN_ID="${BOT_NPM_TELEGRAM_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
OUTPUT_DIR="${BOT_NPM_TELEGRAM_OUTPUT_DIR:-.artifacts/qa-e2e/npm-telegram-live/$RUN_ID}"
case "$OUTPUT_DIR" in
  /*) OUTPUT_DIR_HOST="$OUTPUT_DIR" ;;
  *) OUTPUT_DIR_HOST="$ROOT_DIR/$OUTPUT_DIR" ;;
esac
OUTPUT_DIR_CONTAINER_RELATIVE=".artifacts/qa-e2e/npm-telegram-live-output"
OUTPUT_DIR_CONTAINER="/app/$OUTPUT_DIR_CONTAINER_RELATIVE"

resolve_credential_source() {
  if [ -n "${BOT_NPM_TELEGRAM_CREDENTIAL_SOURCE:-}" ]; then
    printf "%s" "$BOT_NPM_TELEGRAM_CREDENTIAL_SOURCE"
    return 0
  fi
  if [ -n "${BOT_QA_CREDENTIAL_SOURCE:-}" ]; then
    printf "%s" "$BOT_QA_CREDENTIAL_SOURCE"
    return 0
  fi
  if [ -n "${CI:-}" ] && [ -n "${BOT_QA_CONVEX_SITE_URL:-}" ]; then
    if [ -n "${BOT_QA_CONVEX_SECRET_CI:-}" ] || [ -n "${BOT_QA_CONVEX_SECRET_MAINTAINER:-}" ]; then
      printf "convex"
    fi
  fi
}

resolve_credential_role() {
  if [ -n "${BOT_NPM_TELEGRAM_CREDENTIAL_ROLE:-}" ]; then
    printf "%s" "$BOT_NPM_TELEGRAM_CREDENTIAL_ROLE"
    return 0
  fi
  if [ -n "${BOT_QA_CREDENTIAL_ROLE:-}" ]; then
    printf "%s" "$BOT_QA_CREDENTIAL_ROLE"
  fi
}

validate_bot_package_spec() {
  local spec="$1"
  if [[ "$spec" =~ ^bot@(alpha|beta|latest|[0-9]{4}\.[1-9][0-9]*\.[1-9][0-9]*(-[1-9][0-9]*|-(alpha|beta)\.[1-9][0-9]*)?)$ ]]; then
    return 0
  fi
  echo "BOT_NPM_TELEGRAM_PACKAGE_SPEC must be bot@alpha, bot@beta, bot@latest, or an exact Bot release version; got: $spec" >&2
  exit 1
}

resolve_package_tgz() {
  local candidate="$1"
  if [ -z "$candidate" ]; then
    return 0
  fi
  if [ ! -f "$candidate" ]; then
    echo "BOT_NPM_TELEGRAM_PACKAGE_TGZ must point to an existing .tgz file; got: $candidate" >&2
    exit 1
  fi
  case "$candidate" in
    *.tgz) ;;
    *)
      echo "BOT_NPM_TELEGRAM_PACKAGE_TGZ must point to a .tgz file; got: $candidate" >&2
      exit 1
      ;;
  esac
  local dir
  local base
  dir="$(cd "$(dirname "$candidate")" && pwd)"
  base="$(basename "$candidate")"
  printf "%s/%s" "$dir" "$base"
}

resolve_package_dir() {
  local candidate="$1"
  if [ -z "$candidate" ]; then
    return 0
  fi
  if [ ! -d "$candidate" ]; then
    echo "BOT_NPM_TELEGRAM_PACKAGE_DIR must point to an existing directory; got: $candidate" >&2
    exit 1
  fi
  (cd "$candidate" && pwd)
}

read_package_version() {
  tar -xOf "$1" package/package.json |
    node -e '
let raw = "";
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  const version = JSON.parse(raw).version;
  if (typeof version !== "string" || !version) {
    throw new Error("package tarball is missing a version");
  }
  process.stdout.write(version);
});
'
}

package_mount_args=()
registry_helper_mount_args=()
package_install_source="$PACKAGE_SPEC"
package_source_kind="npm-package"
resolved_package_tgz="$(resolve_package_tgz "$PACKAGE_TGZ")"
resolved_package_dir="$(resolve_package_dir "$PACKAGE_DIR")"
if [ -n "$resolved_package_dir" ]; then
  if [ -z "$resolved_package_tgz" ]; then
    echo "BOT_NPM_TELEGRAM_PACKAGE_DIR requires BOT_NPM_TELEGRAM_PACKAGE_TGZ" >&2
    exit 1
  fi
  case "$resolved_package_tgz" in
    "$resolved_package_dir"/*) ;;
    *)
      echo "BOT_NPM_TELEGRAM_PACKAGE_TGZ must be inside BOT_NPM_TELEGRAM_PACKAGE_DIR" >&2
      exit 1
      ;;
  esac
  package_install_source="bot@$(read_package_version "$resolved_package_tgz")"
  package_source_kind="prepared-package-set"
  package_mount_args=(-v "$resolved_package_dir:/package-under-test:ro")
  registry_helper_mount_args=(
    -v "$ROOT_DIR/scripts/e2e/lib/bounded-response-text.mjs:/tmp/bot-e2e/lib/bounded-response-text.mjs:ro"
    -v "$ROOT_DIR/scripts/e2e/lib/plugins/npm-registry-server.mjs:/tmp/bot-e2e/lib/plugins/npm-registry-server.mjs:ro"
  )
elif [ -n "$resolved_package_tgz" ]; then
  package_install_source="/package-under-test/$(basename "$resolved_package_tgz")"
  package_source_kind="packed-tarball"
  package_mount_args=(-v "$resolved_package_tgz:$package_install_source:ro")
else
  validate_bot_package_spec "$PACKAGE_SPEC"
fi
if [ -z "$PACKAGE_LABEL" ]; then
  if [ -n "$resolved_package_tgz" ]; then
    PACKAGE_LABEL="$(basename "$resolved_package_tgz")"
  else
    PACKAGE_LABEL="$PACKAGE_SPEC"
  fi
fi

credential_source="$(resolve_credential_source)"
credential_role="$(resolve_credential_role)"
if [ -z "$credential_role" ] && [ "$credential_source" = "convex" ]; then
  if [ -n "${CI:-}" ]; then
    credential_role="ci"
  else
    credential_role="maintainer"
  fi
fi

validate_credential_preflight() {
  if [ "${BOT_NPM_TELEGRAM_SKIP_CREDENTIAL_PREFLIGHT:-0}" = "1" ]; then
    return 0
  fi
  if [ "$credential_source" = "convex" ]; then
    if [ -z "${BOT_QA_CONVEX_SITE_URL:-}" ]; then
      echo "Missing required env for Convex credential mode: BOT_QA_CONVEX_SITE_URL" >&2
      exit 1
    fi
    if [ "$credential_role" = "ci" ]; then
      if [ -z "${BOT_QA_CONVEX_SECRET_CI:-}" ]; then
        echo "Missing required env for Convex ci credential mode: BOT_QA_CONVEX_SECRET_CI" >&2
        exit 1
      fi
      return 0
    fi
    if [ "$credential_role" = "maintainer" ]; then
      if [ -z "${BOT_QA_CONVEX_SECRET_MAINTAINER:-}" ]; then
        echo "Missing required env for Convex maintainer credential mode: BOT_QA_CONVEX_SECRET_MAINTAINER" >&2
        exit 1
      fi
      return 0
    fi
    if [ -z "${BOT_QA_CONVEX_SECRET_CI:-}" ] && [ -z "${BOT_QA_CONVEX_SECRET_MAINTAINER:-}" ]; then
      echo "Missing required env for Convex credential mode: BOT_QA_CONVEX_SECRET_CI or BOT_QA_CONVEX_SECRET_MAINTAINER" >&2
      exit 1
    fi
    return 0
  fi

  local missing=()
  for key in \
    BOT_QA_TELEGRAM_GROUP_ID \
    BOT_QA_TELEGRAM_DRIVER_BOT_TOKEN \
    BOT_QA_TELEGRAM_SUT_BOT_TOKEN; do
    if [ -z "${!key:-}" ]; then
      missing+=("$key")
    fi
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    {
      echo "Missing required Telegram QA credential env before Docker work: ${missing[*]}"
      echo "Use one of:"
      echo "  direct Telegram env: BOT_QA_TELEGRAM_GROUP_ID, BOT_QA_TELEGRAM_DRIVER_BOT_TOKEN, BOT_QA_TELEGRAM_SUT_BOT_TOKEN"
      echo "  Convex env: BOT_NPM_TELEGRAM_CREDENTIAL_SOURCE=convex plus BOT_QA_CONVEX_SITE_URL and a role secret"
    } >&2
    exit 1
  fi
}

validate_credential_preflight

docker_e2e_build_or_reuse "$IMAGE_NAME" npm-telegram-live "$ROOT_DIR/scripts/e2e/Dockerfile" "$ROOT_DIR" "$DOCKER_TARGET"

mkdir -p "$ROOT_DIR/.artifacts/qa-e2e"
mkdir -p "$OUTPUT_DIR_HOST"
npm_prefix_host="$(mktemp -d "$ROOT_DIR/.artifacts/qa-e2e/npm-telegram-live-prefix.XXXXXX")"
cleanup() {
  local rc=$?
  trap - EXIT
  printf 'schema=1\nexit_code=%s\nlive_output=job_log\n' "$rc" > "$OUTPUT_DIR_HOST/run-metadata.txt"
  rm -rf "$npm_prefix_host"
  exit "$rc"
}
trap cleanup EXIT

docker_env=(
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0
  -e BOT_E2E_COMMAND_TIMEOUT="${BOT_E2E_COMMAND_TIMEOUT:-300s}"
  -e TMPDIR=/tmp
  -e BOT_NPM_TELEGRAM_PACKAGE_SPEC="$PACKAGE_SPEC"
  -e BOT_NPM_TELEGRAM_PACKAGE_LABEL="$PACKAGE_LABEL"
  -e BOT_NPM_TELEGRAM_OUTPUT_DIR="$OUTPUT_DIR_CONTAINER_RELATIVE"
  -e BOT_QA_PACKAGE_SOURCE="$package_install_source"
  -e BOT_QA_PACKAGE_SOURCE_KIND="$package_source_kind"
  -e BOT_QA_RUNNER="${BOT_QA_RUNNER:-docker}"
  -e BOT_NPM_TELEGRAM_FAST="${BOT_NPM_TELEGRAM_FAST:-1}"
)

forward_env_if_set() {
  local key="$1"
  if [ -n "${!key:-}" ]; then
    docker_env+=(-e "$key")
  fi
}

if [ -n "$credential_source" ]; then
  docker_env+=(-e BOT_QA_CREDENTIAL_SOURCE="$credential_source")
fi
if [ -n "$credential_role" ]; then
  docker_env+=(-e BOT_QA_CREDENTIAL_ROLE="$credential_role")
fi

for key in \
  OPENAI_API_KEY \
  ANTHROPIC_API_KEY \
  GEMINI_API_KEY \
  GOOGLE_API_KEY \
  BOT_LIVE_OPENAI_KEY \
  BOT_LIVE_ANTHROPIC_KEY \
  BOT_LIVE_GEMINI_KEY \
  BOT_QA_TELEGRAM_GROUP_ID \
  BOT_QA_TELEGRAM_DRIVER_BOT_TOKEN \
  BOT_QA_TELEGRAM_SUT_BOT_TOKEN \
  BOT_QA_CONVEX_SITE_URL \
  BOT_QA_CONVEX_SECRET_CI \
  BOT_QA_CONVEX_SECRET_MAINTAINER \
  BOT_QA_CREDENTIAL_LEASE_TTL_MS \
  BOT_QA_CREDENTIAL_HEARTBEAT_INTERVAL_MS \
  BOT_QA_CREDENTIAL_ACQUIRE_TIMEOUT_MS \
  BOT_QA_CREDENTIAL_HTTP_TIMEOUT_MS \
  BOT_QA_CONVEX_ENDPOINT_PREFIX \
  BOT_QA_CREDENTIAL_OWNER_ID \
  BOT_QA_ALLOW_INSECURE_HTTP \
  BOT_QA_REDACT_PUBLIC_METADATA \
  BOT_QA_PACKAGE_SOURCE_SHA \
  BOT_QA_TELEGRAM_CANARY_TIMEOUT_MS \
  BOT_QA_TELEGRAM_SCENARIO_TIMEOUT_MS \
  BOT_QA_SUITE_PROGRESS \
  BOT_NPM_TELEGRAM_PROVIDER_MODE \
  BOT_NPM_TELEGRAM_MODEL \
  BOT_NPM_TELEGRAM_ALT_MODEL \
  BOT_NPM_TELEGRAM_SCENARIOS \
  BOT_NPM_TELEGRAM_RTT_SAMPLES \
  BOT_NPM_TELEGRAM_RTT_CHECKS \
  BOT_NPM_TELEGRAM_RTT_TIMEOUT_MS \
  BOT_NPM_TELEGRAM_RTT_MAX_FAILURES \
  BOT_NPM_TELEGRAM_SKIP_HOTPATH \
  BOT_NPM_TELEGRAM_SUT_ACCOUNT \
  BOT_NPM_TELEGRAM_ALLOW_FAILURES; do
  forward_env_if_set "$key"
done

echo "Running package Telegram live Docker E2E ($PACKAGE_LABEL)..."
run_logged_print_heartbeat "npm-telegram-package-install" 60 docker_e2e_docker_run_cmd run --rm \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e BOT_E2E_NPM_INSTALL_TIMEOUT="${BOT_E2E_NPM_INSTALL_TIMEOUT:-600s}" \
  -e BOT_NPM_TELEGRAM_INSTALL_SOURCE="$package_install_source" \
  -e BOT_NPM_TELEGRAM_PACKAGE_LABEL="$PACKAGE_LABEL" \
  -e BOT_NPM_TELEGRAM_PACKAGE_SET="$([ -n "$resolved_package_dir" ] && printf 1 || printf 0)" \
  ${package_mount_args[@]+"${package_mount_args[@]}"} \
  ${registry_helper_mount_args[@]+"${registry_helper_mount_args[@]}"} \
  -v "$npm_prefix_host:/npm-global" \
  -i "$IMAGE_NAME" bash -s <<'EOF'
set -euo pipefail

export HOME="$(mktemp -d "/tmp/bot-npm-telegram-install.XXXXXX")"
export NPM_CONFIG_PREFIX="/npm-global"
export PATH="$NPM_CONFIG_PREFIX/bin:$PATH"

install_source="${BOT_NPM_TELEGRAM_INSTALL_SOURCE:?missing BOT_NPM_TELEGRAM_INSTALL_SOURCE}"
package_label="${BOT_NPM_TELEGRAM_PACKAGE_LABEL:-$install_source}"
echo "Installing ${package_label} from ${install_source}..."

registry_pid=""
registry_log=""
cleanup_registry() {
  if [ -n "$registry_pid" ]; then
    kill "$registry_pid" >/dev/null 2>&1 || true
    wait "$registry_pid" >/dev/null 2>&1 || true
  fi
  if [ -n "$registry_log" ]; then
    rm -f "$registry_log"
  fi
}
trap cleanup_registry EXIT

if [ "${BOT_NPM_TELEGRAM_PACKAGE_SET:-0}" = "1" ]; then
  shopt -s nullglob
  package_tgzs=(/package-under-test/*.tgz)
  shopt -u nullglob
  if [ "${#package_tgzs[@]}" -eq 0 ]; then
    echo "prepared package set contains no tgz files" >&2
    exit 1
  fi
  registry_args=()
  for package_tgz in "${package_tgzs[@]}"; do
    package_metadata="$(
      tar -xOf "$package_tgz" package/package.json |
        node -e '
let raw = "";
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  const pkg = JSON.parse(raw);
  if (typeof pkg.name !== "string" || !pkg.name || typeof pkg.version !== "string" || !pkg.version) {
    throw new Error("package tarball is missing name or version");
  }
  process.stdout.write(`${pkg.name}\n${pkg.version}\n`);
});
'
    )"
    mapfile -t package_fields <<<"$package_metadata"
    registry_args+=("${package_fields[0]}" "${package_fields[1]}" "$package_tgz")
  done
  registry_port_file="$(mktemp)"
  registry_log="$(mktemp)"
  BOT_NPM_REGISTRY_UPSTREAM=https://registry.npmjs.org \
    node /tmp/bot-e2e/lib/plugins/npm-registry-server.mjs \
    "$registry_port_file" \
    "${registry_args[@]}" >"$registry_log" 2>&1 &
  registry_pid=$!
  for _ in $(seq 1 100); do
    if [ -s "$registry_port_file" ]; then
      break
    fi
    if ! kill -0 "$registry_pid" >/dev/null 2>&1; then
      cat "$registry_log" >&2
      exit 1
    fi
    sleep 0.1
  done
  if [ ! -s "$registry_port_file" ]; then
    cat "$registry_log" >&2
    echo "prepared package registry did not start" >&2
    exit 1
  fi
  registry_url="http://127.0.0.1:$(cat "$registry_port_file")"
  rm -f "$registry_port_file"
  export NPM_CONFIG_REGISTRY="$registry_url"
  export npm_config_registry="$registry_url"
fi

npm_install_timeout="${BOT_E2E_NPM_INSTALL_TIMEOUT:-600s}"
run_npm_install() {
  if [ -z "$npm_install_timeout" ] || [ "$npm_install_timeout" = "0" ]; then
    npm install -g "$install_source" --no-fund --no-audit
    return
  fi

  local timeout_bin=""
  if command -v timeout >/dev/null 2>&1; then
    timeout_bin="timeout"
  elif command -v gtimeout >/dev/null 2>&1; then
    timeout_bin="gtimeout"
  fi
  if [ -z "$timeout_bin" ]; then
    echo "timeout or gtimeout is required for BOT_E2E_NPM_INSTALL_TIMEOUT=$npm_install_timeout" >&2
    return 127
  fi

  if "$timeout_bin" --kill-after=1s 1s true >/dev/null 2>&1; then
    "$timeout_bin" --kill-after=30s "$npm_install_timeout" npm install -g "$install_source" --no-fund --no-audit
  else
    "$timeout_bin" "$npm_install_timeout" npm install -g "$install_source" --no-fund --no-audit
  fi
}
run_npm_install

command -v bot
bot --version
EOF

# Mount only QA harness source; the SUT itself, including bundled plugin runtime,
# is the installed package candidate.
run_logged_print_heartbeat "npm-telegram-live-suite" 60 docker_e2e_run_with_harness \
  "${docker_env[@]}" \
  -v "$ROOT_DIR/.artifacts:/app/.artifacts" \
  -v "$OUTPUT_DIR_HOST:$OUTPUT_DIR_CONTAINER" \
  -v "$ROOT_DIR/extensions/qa-lab:/app/extensions/qa-lab:ro" \
  -v "$ROOT_DIR/qa/scenarios:/app/qa/scenarios:ro" \
  -v "$npm_prefix_host:/npm-global" \
  -i "$IMAGE_NAME" bash -s <<'EOF'
set -euo pipefail
source scripts/lib/bot-e2e-instance.sh

runtime_home="$(mktemp -d "/tmp/bot-npm-telegram-runtime.XXXXXX")"
export HOME="$runtime_home"
export NPM_CONFIG_PREFIX="/npm-global"
export PATH="$NPM_CONFIG_PREFIX/bin:$PATH"
export BOT_NPM_TELEGRAM_REPO_ROOT="/app"

dump_hotpath_logs() {
  local status="$1"
  echo "installed-package onboarding recovery hot path failed with exit code $status" >&2
  for file in \
    /tmp/bot-npm-telegram-onboard.json \
    /tmp/bot-npm-telegram-channel-add.log \
    /tmp/bot-npm-telegram-doctor-fix.log \
    /tmp/bot-npm-telegram-doctor-check.log; do
    if [ -f "$file" ]; then
      echo "--- $file ---" >&2
      bot_e2e_print_log "$file" >&2
    fi
  done
}
trap 'status=$?; dump_hotpath_logs "$status"; exit "$status"' ERR

command -v bot
bot_e2e_run_command bot --version
mkdir -p /app/node_modules
bot_package_dir="/npm-global/lib/node_modules/bot"
# The mounted QA harness imports bot/plugin-sdk and package dependencies;
# point those imports at the installed package without copying source plugins into the test image.
rm -rf /app/node_modules/bot
ln -sfnT "$bot_package_dir" /app/node_modules/bot
rm -rf /app/dist
ln -sfnT "$bot_package_dir/dist" /app/dist
cp "$bot_package_dir/package.json" /app/package.json
node scripts/e2e/lib/npm-telegram-live/prepare-package.mjs \
  /app/package.json \
  /app/node_modules/bot/package.json
for deps_dir in "$bot_package_dir/node_modules" /npm-global/lib/node_modules; do
  [ -d "$deps_dir" ] || continue
  for dependency_dir in "$deps_dir"/*; do
    [ -e "$dependency_dir" ] || continue
    dependency_name="$(basename "$dependency_dir")"
    case "$dependency_name" in
      .bin | bot)
        continue
        ;;
      @*)
        [ -d "$dependency_dir" ] || continue
        mkdir -p "/app/node_modules/$dependency_name"
        for scoped_dependency_dir in "$dependency_dir"/*; do
          [ -e "$scoped_dependency_dir" ] || continue
          scoped_dependency_name="$(basename "$scoped_dependency_dir")"
          rm -rf "/app/node_modules/$dependency_name/$scoped_dependency_name"
          ln -sfnT "$scoped_dependency_dir" "/app/node_modules/$dependency_name/$scoped_dependency_name"
        done
        ;;
      *)
        rm -rf "/app/node_modules/$dependency_name"
        ln -sfnT "$dependency_dir" "/app/node_modules/$dependency_name"
        ;;
    esac
  done
done

link_installed_package_dependency() {
  local name="$1"
  local source="/npm-global/lib/node_modules/bot/node_modules/$name"
  local target="/app/node_modules/$name"
  if [ ! -e "$source" ]; then
    echo "Installed package dependency is missing: $name" >&2
    return 1
  fi
  mkdir -p "$(dirname "$target")"
  ln -sfn "$source" "$target"
}

# QA Lab is intentionally mounted as harness source, so its package-local
# runtime imports must resolve from the installed package dependency tree.
for dependency in \
  @modelcontextprotocol/sdk \
  yaml \
  zod; do
  link_installed_package_dependency "$dependency"
done

if [ "${BOT_NPM_TELEGRAM_SKIP_HOTPATH:-0}" != "1" ]; then
  hotpath_home="$(mktemp -d "/tmp/bot-npm-telegram-hotpath.XXXXXX")"
  export HOME="$hotpath_home"
  echo "Running installed-package onboarding recovery hot path..."
  hotpath_placeholder="bot-npm-telegram-hotpath"
  hotpath_model_value="$(printf '%s%s' s "k-$hotpath_placeholder")"
  if [ -n "${OPENAI_API_KEY:-}" ]; then
    hotpath_model_value="$OPENAI_API_KEY"
  fi
  hotpath_channel_value="$(printf '%s:%s' 123456 "$hotpath_placeholder")"
  OPENAI_API_KEY="$hotpath_model_value" bot_e2e_run_command bot onboard \
    --non-interactive --accept-risk \
    --mode local \
    --auth-choice openai-api-key \
    --secret-input-mode ref \
    --gateway-port 18789 \
    --gateway-bind loopback \
    --skip-daemon \
    --skip-ui \
    --skip-skills \
    --skip-health \
    --json >/tmp/bot-npm-telegram-onboard.json </dev/null

  bot_e2e_run_command bot channels add --channel telegram --token "$hotpath_channel_value" >/tmp/bot-npm-telegram-channel-add.log 2>&1 </dev/null
  bot_e2e_run_command bot doctor --fix --non-interactive >/tmp/bot-npm-telegram-doctor-fix.log 2>&1 </dev/null
  bot_e2e_run_command bot doctor --non-interactive >/tmp/bot-npm-telegram-doctor-check.log 2>&1 </dev/null
  export HOME="$runtime_home"
fi

export BOT_NPM_TELEGRAM_SUT_COMMAND="$(command -v bot)"
trap - ERR
tsx scripts/e2e/npm-telegram-live-runner.ts
EOF

echo "package Telegram live Docker E2E passed ($PACKAGE_LABEL)"
