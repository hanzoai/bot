#!/usr/bin/env node
// scripts/ui.js — replaced after the legacy Lit "bot-control-ui"
// was retired in favor of the Hanzo GUI v7 admin SPA at
// ~/work/hanzo/gui/apps/admin-bot. The bot is the Node-runtime
// exception in the Hanzo binary contract (see HANZO_BINARY.md).
//
// Backward-compatible shims:
//
//   pnpm ui:build   → runs sync-admin-ui.sh (mirrors built admin-bot dist
//                     into bot/dist/control-ui/ for static serving).
//   pnpm ui:dev     → no-op with a one-line note pointing to the
//                     external dev server in apps/admin-bot.
//   pnpm ui:install → no-op; admin-bot deps live in the gui workspace.
//
// One way to do everything: there is exactly one source of UI truth
// (the admin-bot app in the gui workspace). This script only mirrors
// its build output to the static-serving location.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const command = process.argv[2] ?? "build";

if (command === "build") {
  const sync = spawnSync("bash", [path.join(here, "sync-admin-ui.sh")], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  process.exit(sync.status ?? 0);
}

if (command === "dev") {
  process.stderr.write(
    "ui:dev — the admin SPA dev server lives in the gui workspace.\n" +
      "  Run:  cd ~/work/hanzo/gui/apps/admin-bot && bun run dev\n" +
      "  Then: pnpm start  (in this repo) and the gateway will serve the\n" +
      "        dev bundle from the gui workspace via the Vite proxy.\n",
  );
  process.exit(0);
}

if (command === "install") {
  // Admin-bot inherits its deps from the gui workspace; no-op locally.
  process.exit(0);
}

process.stderr.write("Usage: node scripts/ui.js <build|dev|install>\n");
process.exit(2);
