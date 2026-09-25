import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { formatCliCommand } from "../cli/command-format.js";
import { resolveStateDir } from "../config/paths.js";
import { resolveRequiredHomeDir } from "../infra/home-dir.js";
import { findConfigFile, resolveOpenClawStateDir } from "../migrate/openclaw/state.js";
import { formatDocsLink } from "../terminal/links.js";
import { note } from "../terminal/note.js";
import { shortenHomePath } from "../utils.js";

/** OpenClaw's gateway service files: launchd on macOS, a systemd user unit on Linux. */
function openClawServiceFiles(home: string): string[] {
  return [
    path.join(home, "Library", "LaunchAgents", "ai.openclaw.gateway.plist"),
    path.join(home, ".config", "systemd", "user", "openclaw-gateway.service"),
  ].filter((file) => fs.existsSync(file));
}

/** An OpenClaw install on this machine: say how to move it, and warn when its gateway is installed. */
export function noteOpenClawInstall(
  env: NodeJS.ProcessEnv = process.env,
  noteFn: typeof note = note,
): void {
  const dir = resolveOpenClawStateDir(env);
  if (path.resolve(dir) === path.resolve(resolveStateDir(env))) {
    return;
  }
  const hasConfig = findConfigFile(dir) !== null;
  const hasState = fs.existsSync(path.join(dir, "state", "openclaw.sqlite"));
  if (!hasConfig && !hasState) {
    return;
  }
  const lines = [
    `- OpenClaw install found at ${shortenHomePath(dir)}.`,
    `- See what moves to Hanzo Bot (writes nothing): ${formatCliCommand("bot migrate openclaw")}`,
    `- Then move it: ${formatCliCommand("bot migrate openclaw --apply")} (OpenClaw's files are left as they are)`,
  ];
  const services = openClawServiceFiles(resolveRequiredHomeDir(env, os.homedir));
  if (services.length > 0) {
    lines.push(
      `- OpenClaw's gateway service is installed (${services.map(shortenHomePath).join(", ")}). It also serves port 18789 and your channel logins; stop it before starting this gateway: openclaw gateway stop`,
    );
  }
  lines.push(`- Guide: ${formatDocsLink("/install/migrate-from-openclaw")}`);
  noteFn(lines.join("\n"), "OpenClaw");
}
