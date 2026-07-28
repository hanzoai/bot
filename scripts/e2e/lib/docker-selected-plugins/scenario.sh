#!/usr/bin/env bash
set -euo pipefail

export HOME=/tmp/bot-docker-selected-plugins
export BOT_STATE_DIR="$HOME/.bot"
export BOT_CONFIG_PATH="$BOT_STATE_DIR/bot.json"
export BOT_DISABLE_BUNDLED_SOURCE_OVERLAYS=1

mkdir -p "$BOT_STATE_DIR"
node --input-type=module <<'NODE'
import fs from "node:fs";

const entries = Object.fromEntries(
  ["clickclack", "slack", "msteams"].map((id) => [id, { enabled: true }]),
);
fs.writeFileSync(
  process.env.BOT_CONFIG_PATH,
  `${JSON.stringify({ plugins: { entries } }, null, 2)}\n`,
  { mode: 0o600 },
);
NODE

for plugin_id in clickclack slack msteams clawrouter; do
  node /app/bot.mjs plugins inspect "$plugin_id" --runtime --json \
    >"/tmp/bot-${plugin_id}-inspect.json"
done

node /bot-e2e/assertions.mjs
