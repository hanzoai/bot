#!/usr/bin/env bash
set -euo pipefail

cd /repo

export BOT_STATE_DIR="/tmp/bot-test"
export BOT_CONFIG_PATH="${BOT_STATE_DIR}/bot.json"

echo "==> Build"
pnpm build

echo "==> Seed state"
mkdir -p "${BOT_STATE_DIR}/credentials"
mkdir -p "${BOT_STATE_DIR}/agents/main/sessions"
echo '{}' >"${BOT_CONFIG_PATH}"
echo 'creds' >"${BOT_STATE_DIR}/credentials/marker.txt"
echo 'session' >"${BOT_STATE_DIR}/agents/main/sessions/sessions.json"

echo "==> Reset (config+creds+sessions)"
pnpm hanzo-bot reset --scope config+creds+sessions --yes --non-interactive

test ! -f "${BOT_CONFIG_PATH}"
test ! -d "${BOT_STATE_DIR}/credentials"
test ! -d "${BOT_STATE_DIR}/agents/main/sessions"

echo "==> Recreate minimal config"
mkdir -p "${BOT_STATE_DIR}/credentials"
echo '{}' >"${BOT_CONFIG_PATH}"

echo "==> Uninstall (state only)"
pnpm hanzo-bot uninstall --state --yes --non-interactive

test ! -d "${BOT_STATE_DIR}"

echo "OK"
