#!/usr/bin/env node
// @hanzo/bot — meta. The only job is to route execution to the canonical
// TS runtime in @hanzobot/ts. No flags parsed here, nothing intercepted —
// the impl owns the surface, this file owns the routing.

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

const tsPkg = require("@hanzobot/ts/package.json");
const bin = typeof tsPkg.bin === "string"
  ? tsPkg.bin
  : tsPkg.bin?.["hanzo-bot"] ?? Object.values(tsPkg.bin ?? {})[0];
if (!bin) {
  console.error("@hanzo/bot: cannot locate @hanzobot/ts CLI entry — installation is broken");
  process.exit(127);
}
const entry = path.resolve(path.dirname(require.resolve("@hanzobot/ts/package.json")), bin);

const result = spawnSync(process.execPath, [entry, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? (result.signal ? 1 : 0));
