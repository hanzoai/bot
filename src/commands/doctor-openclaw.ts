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

/**
 * OpenClaw's gateway service files: launchd on macOS, a systemd user unit on
 * Linux. OpenClaw keeps a Clawdbot-era service's name when it runs it, so a
 * clawdbot or moltbot service file that runs openclaw is OpenClaw's too.
 */
function openClawServiceFiles(home: string): string[] {
  const dirs: Array<[string, string]> = [
    [path.join(home, "Library", "LaunchAgents"), ".plist"],
    [path.join(home, ".config", "systemd", "user"), ".service"],
  ];
  return dirs.flatMap(([dir, ext]) => {
    let names: string[];
    try {
      names = fs.readdirSync(dir);
    } catch {
      return [];
    }
    return names
      .filter((name) => name.endsWith(ext))
      .filter((name) => {
        const lower = name.toLowerCase();
        if (lower === `ai.openclaw.gateway${ext}` || lower === `openclaw-gateway${ext}`) {
          return true;
        }
        if (!/clawdbot|moltbot/.test(lower)) {
          return false;
        }
        try {
          return fs.readFileSync(path.join(dir, name), "utf8").toLowerCase().includes("openclaw");
        } catch {
          return false;
        }
      })
      .toSorted()
      .map((name) => path.join(dir, name));
  });
}

/** The OpenClaw state dir on this machine, when it holds an install that is not Hanzo Bot's own dir. */
export function findOpenClawInstall(env: NodeJS.ProcessEnv = process.env): string | null {
  const dir = resolveOpenClawStateDir(env);
  if (path.resolve(dir) === path.resolve(resolveStateDir(env))) {
    return null;
  }
  const hasConfig = findConfigFile(dir) !== null;
  const hasState = fs.existsSync(path.join(dir, "state", "openclaw.sqlite"));
  return hasConfig || hasState ? dir : null;
}

/** An OpenClaw install on this machine: say how to move it, and warn when its gateway is installed. */
export function noteOpenClawInstall(
  env: NodeJS.ProcessEnv = process.env,
  noteFn: typeof note = note,
): boolean {
  const dir = findOpenClawInstall(env);
  if (!dir) {
    return false;
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
  return true;
}

/**
 * Before the first run signs in and writes a config of its own: a person with
 * an OpenClaw install is shown how to move it, and a fresh setup goes ahead
 * only when they ask for one. Without a terminal to ask on, it does not.
 */
export async function confirmFirstRun(
  env: NodeJS.ProcessEnv = process.env,
  ask: (message: string) => Promise<boolean> = askFreshStart,
  interactive: boolean = Boolean(process.stdin.isTTY),
): Promise<boolean> {
  if (!noteOpenClawInstall(env)) {
    return true;
  }
  return interactive && (await ask("Set up Hanzo Bot fresh instead of importing OpenClaw?"));
}

async function askFreshStart(message: string): Promise<boolean> {
  const { confirm, isCancel } = await import("@clack/prompts");
  const answer = await confirm({ message, initialValue: false });
  return isCancel(answer) ? false : answer;
}
