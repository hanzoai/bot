import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { confirmFirstRun, noteOpenClawInstall } from "./doctor-openclaw.js";

let home: string;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "bot-doctor-openclaw-"));
});

afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { HOME: home, BOT_STATE_DIR: path.join(home, ".bot"), ...extra };
}

describe("noteOpenClawInstall", () => {
  it("says nothing when there is no OpenClaw install", () => {
    const noteFn = vi.fn();
    fs.mkdirSync(path.join(home, ".openclaw"));
    noteOpenClawInstall(env(), noteFn);
    expect(noteFn).not.toHaveBeenCalled();
  });

  it("points at the importer when ~/.openclaw has a config", () => {
    const noteFn = vi.fn();
    fs.mkdirSync(path.join(home, ".openclaw"));
    fs.writeFileSync(path.join(home, ".openclaw", "openclaw.json"), "{}");
    noteOpenClawInstall(env(), noteFn);
    expect(noteFn).toHaveBeenCalledTimes(1);
    const [text, title] = noteFn.mock.calls[0] as [string, string];
    expect(title).toBe("OpenClaw");
    expect(text).toContain("migrate openclaw");
    expect(text).toContain("migrate openclaw --apply");
    expect(text).toContain("/install/migrate-from-openclaw");
    expect(text).not.toContain("gateway service");
  });

  it("finds a database-only install at $OPENCLAW_STATE_DIR and warns about its service", () => {
    const noteFn = vi.fn();
    const dir = path.join(home, "oc");
    fs.mkdirSync(path.join(dir, "state"), { recursive: true });
    fs.writeFileSync(path.join(dir, "state", "openclaw.sqlite"), "");
    fs.mkdirSync(path.join(home, "Library", "LaunchAgents"), { recursive: true });
    fs.writeFileSync(path.join(home, "Library", "LaunchAgents", "ai.openclaw.gateway.plist"), "");
    noteOpenClawInstall(env({ OPENCLAW_STATE_DIR: dir }), noteFn);
    const [text] = noteFn.mock.calls[0] as [string];
    expect(text).toContain("openclaw gateway stop");
  });

  it("warns about OpenClaw's gateway kept under a Clawdbot-era service name, and no other", () => {
    const noteFn = vi.fn();
    fs.mkdirSync(path.join(home, ".openclaw"));
    fs.writeFileSync(path.join(home, ".openclaw", "openclaw.json"), "{}");
    const agents = path.join(home, "Library", "LaunchAgents");
    fs.mkdirSync(agents, { recursive: true });
    fs.writeFileSync(path.join(agents, "com.clawdbot.old.plist"), "<string>clawdbot.mjs</string>");
    noteOpenClawInstall(env(), noteFn);
    expect((noteFn.mock.calls[0] as [string])[0]).not.toContain("gateway service");
    fs.writeFileSync(
      path.join(agents, "com.clawdbot.gateway.plist"),
      "<string>/opt/openclaw/openclaw.mjs</string>",
    );
    noteOpenClawInstall(env(), noteFn);
    const [text] = noteFn.mock.calls[1] as [string];
    expect(text).toContain("com.clawdbot.gateway.plist");
    expect(text).not.toContain("com.clawdbot.old.plist");
  });

  it("says nothing when Hanzo Bot's own state dir is the OpenClaw dir", () => {
    const noteFn = vi.fn();
    fs.mkdirSync(path.join(home, ".openclaw"));
    fs.writeFileSync(path.join(home, ".openclaw", "openclaw.json"), "{}");
    noteOpenClawInstall(env({ BOT_STATE_DIR: path.join(home, ".openclaw") }), noteFn);
    expect(noteFn).not.toHaveBeenCalled();
  });
});

describe("confirmFirstRun", () => {
  it("goes ahead without asking on a machine with no OpenClaw install", async () => {
    const ask = vi.fn();
    expect(await confirmFirstRun(env(), ask, true)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it("stops for an OpenClaw install unless the person asks for a fresh setup", async () => {
    fs.mkdirSync(path.join(home, ".openclaw"));
    fs.writeFileSync(path.join(home, ".openclaw", "openclaw.json"), "{}");
    expect(await confirmFirstRun(env(), vi.fn(), false)).toBe(false);
    expect(await confirmFirstRun(env(), vi.fn().mockResolvedValue(false), true)).toBe(false);
    expect(await confirmFirstRun(env(), vi.fn().mockResolvedValue(true), true)).toBe(true);
  });
});
