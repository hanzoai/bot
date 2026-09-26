import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Command } from "commander";
import { resolveStateDir } from "../config/paths.js";
import { expandHomePrefix, resolveRequiredHomeDir } from "../infra/home-dir.js";
import {
  applyMigration,
  planMigration,
  type Plan,
  type PlanItem,
} from "../migrate/openclaw/plan.js";
import { resolveOpenClawStateDir } from "../migrate/openclaw/state.js";
import { defaultRuntime } from "../runtime.js";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";
import { runCommandWithRuntime } from "./cli-utils.js";
import { formatCliCommand } from "./command-format.js";

export const OPENCLAW_GUIDE = "/install/migrate-from-openclaw";

const REASONS: Record<string, string> = {
  metadata: "OpenClaw's own write stamp",
  plugins: "OpenClaw plugin; built for OpenClaw's plugin SDK",
  "secret-store": "held in OpenClaw's secret store; enter it again",
  "model-catalog": "an OpenClaw model catalog; in Hanzo Bot this list restricts models",
  superseded: "the new location is already set",
  "openclaw-only": "no such Hanzo Bot setting",
  invalid: "value Hanzo Bot does not accept",
  "no-plugin": "no such Hanzo Bot plugin",
  "no-channel": "Hanzo Bot has no such channel",
  locator: "points at the OpenClaw install",
  managed: "created by OpenClaw itself",
  payload: "job kind Hanzo Bot does not run",
  schedule: "schedule kind Hanzo Bot does not run",
  target: "session target Hanzo Bot does not run",
  backup: "backup",
  devices: "device pairing; pair again",
  approvals: "exec approvals; approve again when asked",
  index: "search index; rebuilt on first use",
  encrypted: "encrypted with OpenClaw's key; sign in again",
  runtime: "runtime state",
  "session-id": "session id is not a plain file name",
  shadowed: "a skill of the same name loads before it, as in OpenClaw",
  merge: "with your existing bot.json settings it would not load",
};

function noteText(item: PlanItem): string {
  switch (item.reason) {
    case "stop-openclaw":
      return `Stop OpenClaw's gateway before starting this one (both use port 18789): openclaw gateway stop`;
    case "single-session":
      return "WhatsApp moved with its login. Run one gateway on it at a time, or WhatsApp logs the other out.";
    case "external":
      return "Signal keeps its keys in signal-cli's own data dir, which both installs share. Nothing to do.";
    case "relogin":
      return `${item.from}: OpenClaw kept this session in its database, so it signs in again. Check with: ${formatCliCommand("bot channels status --probe")}`;
    case "repair":
      return `${item.count} paired device(s) stay with OpenClaw. Pair again: ${formatCliCommand("bot qr")}`;
    case "env-ref":
      return `bot.json reads ${item.names?.join(", ")} from the environment (renamed from OPENCLAW_*). Set them where you set the old ones.`;
    case "workspace-in-place":
      return `Workspace ${item.from} is outside the OpenClaw dir; both installs now use it.`;
    case "linked-dir":
      return `OpenClaw's ${item.from} is a link to ${item.to}; Hanzo Bot got a copy of its files, so the two installs no longer share it.`;
    case "agent-outside":
      return `Agent ${item.names?.[0]} works in ${item.from}, which the import does not write to. Its heartbeat checklist and workshop skills are in ${item.to}: move HEARTBEAT.md into ${item.from}, and skills/* into ${item.from}/.agents/skills.`;
    case "starter":
      return `bot.json held Hanzo Bot's first-run defaults for ${item.names?.join(", ")}; OpenClaw's settings replace them (the old file is bot.json.bak).${item.names?.includes("models.providers.anthropic") ? " Anthropic calls use your imported Anthropic key, as in OpenClaw." : ""}`;
    case "kept":
      return `bot.json already sets ${item.names?.join(", ")}, so OpenClaw's values for them were not applied. Change them by hand to use OpenClaw's.`;
    default:
      return item.from;
  }
}

function statusLabel(status: string | undefined): string {
  switch (status) {
    case "create":
      return theme.success("create   ");
    case "update":
      return theme.success("merge    ");
    case "conflict":
      return theme.warn("conflict ");
    default:
      return theme.muted("unchanged");
  }
}

function detail(item: PlanItem): string {
  if (item.op === "copy") {
    const files = `${item.count ?? 0} file${item.count === 1 ? "" : "s"}`;
    return item.names?.length
      ? `${files}; kept Hanzo Bot's copy of ${item.names.length}: ${item.names.slice(0, 5).join(", ")}${item.names.length > 5 ? ", …" : ""}`
      : files;
  }
  if (item.names?.length) {
    return item.names.join(", ");
  }
  return item.count !== undefined ? String(item.count) : "";
}

export function renderPlan(plan: Plan, applied: boolean): string {
  const lines: string[] = [];
  const moves = plan.items.filter((item) => item.op === "write" || item.op === "copy");
  const renamed = plan.items.filter((item) => item.op === "rename");
  const left = plan.items.filter((item) => item.op === "drop" || item.op === "skip");
  const notes = plan.items.filter((item) => item.op === "note");
  lines.push(theme.heading(`OpenClaw → Hanzo Bot   ${plan.source} → ${plan.target}`), "");
  lines.push(theme.heading("Moves"));
  for (const item of moves) {
    lines.push(`  ${statusLabel(item.status)} ${item.to}  ${theme.muted(detail(item))}`);
  }
  if (renamed.length > 0) {
    lines.push("", theme.heading("Renamed"));
    for (const item of renamed) {
      lines.push(`  ${item.from} → ${item.to}`);
    }
  }
  if (left.length > 0) {
    lines.push("", theme.heading("Not carried"));
    for (const item of left) {
      const what = item.names?.length ? `${item.from} (${item.names.join(", ")})` : item.from;
      lines.push(`  ${what}  ${theme.muted(REASONS[item.reason ?? ""] ?? item.reason ?? "")}`);
    }
  }
  if (notes.length > 0) {
    lines.push("", theme.heading("Do by hand"));
    for (const item of notes) {
      lines.push(`  - ${noteText(item)}`);
    }
  }
  lines.push("");
  if (applied) {
    lines.push(
      theme.success("Done."),
      `The OpenClaw install at ${plan.source} is untouched. Next: ${formatCliCommand("bot doctor")}`,
    );
  } else {
    lines.push(
      `Dry run: nothing was written. Apply with: ${formatCliCommand("bot migrate openclaw --apply")}`,
    );
  }
  lines.push(`Guide: ${formatDocsLink(OPENCLAW_GUIDE)}`);
  return lines.join("\n");
}

export function registerMigrateCli(program: Command) {
  const migrate = program
    .command("migrate")
    .description("Import state from another assistant install")
    .addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink(OPENCLAW_GUIDE)}\n`);

  migrate
    .command("openclaw")
    .description(
      "Import an OpenClaw install: config, credentials, workspace, sessions, skills, cron",
    )
    .option(
      "--from <dir>",
      "OpenClaw state dir (default: $OPENCLAW_STATE_DIR, ~/.openclaw, or a Clawdbot-era ~/.clawdbot)",
    )
    .option("--apply", "Write the changes (default: show what would change)", false)
    .option("--json", "Print the plan as JSON", false)
    .action(async (opts: { from?: string; apply?: boolean; json?: boolean }) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const home = resolveRequiredHomeDir(process.env, os.homedir);
        const source = opts.from
          ? path.resolve(expandHomePrefix(opts.from, { home }))
          : resolveOpenClawStateDir();
        if (!fs.existsSync(source)) {
          throw new Error(`no OpenClaw install at ${source}; pass --from <dir>`);
        }
        const params = { source, target: resolveStateDir(process.env), home };
        const plan = opts.apply ? await applyMigration(params) : planMigration(params).plan;
        defaultRuntime.log(
          opts.json ? JSON.stringify(plan, null, 2) : renderPlan(plan, Boolean(opts.apply)),
        );
      });
    });
}
