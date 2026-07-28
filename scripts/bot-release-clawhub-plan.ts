#!/usr/bin/env -S node --import tsx
// Bot release ClawHub plan CLI emits release workflow routing as JSON.

import { pathToFileURL } from "node:url";
import {
  buildBotReleaseClawHubPlan,
  parseBotReleaseClawHubPlanArgs,
} from "./lib/bot-release-clawhub-plan.ts";

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = parseBotReleaseClawHubPlanArgs(process.argv.slice(2));
  const plan = await buildBotReleaseClawHubPlan(args);
  console.log(JSON.stringify(plan, null, 2));
}
