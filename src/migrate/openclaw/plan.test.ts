import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigration, planMigration, type Plan } from "./plan.js";
import { DB_SESSION_EVENTS, SECRETS, writeDbLayout, writeFileLayout } from "./test-fixtures.js";

let home: string;
let source: string;
let target: string;
let closeDb: (() => void) | undefined;

beforeEach(() => {
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "bot-migrate-test-")));
  source = path.join(home, ".openclaw");
  target = path.join(home, ".bot");
});

afterEach(() => {
  closeDb?.();
  closeDb = undefined;
  fs.rmSync(home, { recursive: true, force: true });
});

/** Every file under dir (no symlink following) with its mode and content hash. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (rel: string) => {
    const abs = path.join(dir, rel);
    const stat = fs.lstatSync(abs);
    if (stat.isDirectory()) {
      out[`${rel}/`] = (stat.mode & 0o777).toString(8);
      for (const name of fs.readdirSync(abs)) {
        walk(rel ? path.join(rel, name) : name);
      }
      return;
    }
    const body = stat.isSymbolicLink() ? fs.readlinkSync(abs) : fs.readFileSync(abs);
    out[rel] =
      `${(stat.mode & 0o777).toString(8)} ${crypto.createHash("sha256").update(body).digest("hex")}`;
  };
  walk("");
  return out;
}

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(target, file), "utf8")) as Record<string, unknown>;
}

function mode(file: string): string {
  return (fs.statSync(path.join(target, file)).mode & 0o777).toString(8);
}

function item(plan: Plan, op: string, key: string) {
  return plan.items.find((entry) => entry.op === op && (entry.to === key || entry.from === key));
}

function expectNoSecrets(text: string): void {
  for (const secret of Object.values(SECRETS)) {
    expect(text).not.toContain(secret);
  }
}

describe("OpenClaw file layout", () => {
  beforeEach(() => writeFileLayout(source));

  it("plans without writing anything and without naming a secret", () => {
    const before = snapshot(home);
    const { plan, actions } = planMigration({ source, target, home });
    expect(snapshot(home)).toEqual(before);
    expect(fs.existsSync(target)).toBe(false);
    expect(actions.length).toBeGreaterThan(0);
    expect(plan.source).toBe("~/.openclaw");
    expect(plan.target).toBe("~/.bot");
    expectNoSecrets(JSON.stringify(plan));
  });

  it("applies the plan and leaves the OpenClaw install byte for byte", async () => {
    const before = snapshot(source);
    const plan = await applyMigration({ source, target, home });
    expect(snapshot(source)).toEqual(before);
    expectNoSecrets(JSON.stringify(plan));

    const config = readJson("bot.json");
    expect(config).not.toHaveProperty("meta");
    expect(config).not.toHaveProperty("somethingOpenClawAdded");
    expect(config.gateway).toMatchObject({ auth: { token: "${BOT_GATEWAY_TOKEN}" } });
    expect(config.agents).toMatchObject({
      defaults: { workspace: "~/.bot/workspace" },
      list: [{ id: "main" }, { id: "work", workspace: "~/.bot/workspace-work" }],
    });
    expect(config.plugins).toMatchObject({ load: { paths: ["/opt/shared-plugins/y"] } });
    expect(config.plugins).not.toHaveProperty("installs");
    expect(config.channels).toMatchObject({ telegram: { botToken: SECRETS.telegramToken } });

    const env = fs.readFileSync(path.join(target, ".env"), "utf8");
    expect(env).toContain(`BOT_GATEWAY_TOKEN=${SECRETS.gatewayToken}`);
    expect(env).toContain(`ANTHROPIC_API_KEY="${SECRETS.anthropicKey}"`);
    expect(env).not.toContain("STATE_DIR");

    expect(fs.readFileSync(path.join(target, "workspace", "AGENTS.md"), "utf8")).toBe("# Agents\n");
    expect(fs.existsSync(path.join(target, "workspace-work", "AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(target, "skills", "managed-one", "SKILL.md"))).toBe(true);
    expect(
      fs.existsSync(
        path.join(target, "workspace", "skills", "weather-plus", ".clawhub", "origin.json"),
      ),
    ).toBe(true);

    const auth = readJson("agents/main/agent/auth-profiles.json");
    expect(auth).toEqual({
      version: 1,
      profiles: {
        "anthropic:default": { type: "api_key", provider: "anthropic", key: SECRETS.anthropicKey },
      },
      lastGood: { anthropic: "anthropic:default" },
    });

    const sessions = readJson("agents/main/sessions/sessions.json");
    expect(Object.keys(sessions)).toEqual(["agent:main:main"]);
    expect(sessions["agent:main:main"]).toEqual({
      sessionId: "s-file-1",
      updatedAt: 1_790_000_000_000,
      model: "claude-opus-4-6",
    });
    expect(fs.existsSync(path.join(target, "agents/main/sessions/s-file-1.jsonl"))).toBe(true);
    expect(item(plan, "drop", "agents/main/sessions/sessions.json/agent:main:bad")?.reason).toBe(
      "session-id",
    );

    const cron = readJson("cron/jobs.json");
    expect(cron).toMatchObject({
      version: 1,
      jobs: [{ id: "job-daily", name: "daily digest", state: {} }],
    });
    expect(JSON.stringify(cron)).not.toContain("toolsAllow");

    // Secrets keep owner-only modes; directories that hold them are 0700.
    expect(mode("bot.json")).toBe("600");
    expect(mode(".env")).toBe("600");
    expect(mode("agents/main/agent/auth-profiles.json")).toBe("600");
    expect(mode("credentials/whatsapp/default/creds.json")).toBe("600");
    expect(mode("credentials/telegram-allowFrom.json")).toBe("600");
    expect(mode("credentials")).toBe("700");
    expect(mode("agents")).toBe("700");
    expect(mode(".")).toBe("700");
    expect(mode("workspace/AGENTS.md")).toBe("644");

    expect(item(plan, "skip", "devices")?.reason).toBe("devices");
    expect(item(plan, "skip", "extensions")?.reason).toBe("plugins");
    expect(item(plan, "skip", "openclaw.json.bak")?.reason).toBe("backup");
    expect(item(plan, "skip", "plugins")?.names).toEqual(["voice-x"]);
    expect(item(plan, "note", "devices")?.count).toBe(2);
    expect(item(plan, "note", "credentials/whatsapp")?.reason).toBe("single-session");
  });

  it("is idempotent: a second run finds everything in place", async () => {
    await applyMigration({ source, target, home });
    const after = snapshot(target);
    const { plan, actions } = planMigration({ source, target, home });
    expect(actions).toEqual([]);
    for (const entry of plan.items) {
      if (entry.op === "write" || entry.op === "copy") {
        expect(entry.status, `${entry.op} ${entry.to}`).toBe("unchanged");
      }
    }
    await applyMigration({ source, target, home });
    expect(snapshot(target)).toEqual(after);
  });

  it("merges beneath an existing Hanzo Bot install without replacing its values", async () => {
    fs.mkdirSync(path.join(target, "workspace"), { recursive: true });
    fs.writeFileSync(
      path.join(target, "bot.json"),
      JSON.stringify({ gateway: { port: 19000 }, agents: { defaults: { workspace: "~/mine" } } }),
      { mode: 0o600 },
    );
    fs.writeFileSync(path.join(target, ".env"), "ANTHROPIC_API_KEY=mine\n", { mode: 0o600 });
    fs.writeFileSync(path.join(target, "workspace", "AGENTS.md"), "# Mine\n");

    const plan = await applyMigration({ source, target, home });
    const config = readJson("bot.json");
    expect(config.gateway).toMatchObject({ port: 19000, mode: "local" });
    expect(config.agents).toMatchObject({ defaults: { workspace: "~/mine" } });
    expect(fs.existsSync(path.join(target, "bot.json.bak"))).toBe(true);

    const env = fs.readFileSync(path.join(target, ".env"), "utf8");
    expect(env).toContain("ANTHROPIC_API_KEY=mine");
    expect(env).not.toContain(SECRETS.anthropicKey);
    expect(env).toContain("BOT_GATEWAY_TOKEN=");

    expect(fs.readFileSync(path.join(target, "workspace", "AGENTS.md"), "utf8")).toBe("# Mine\n");
    expect(item(plan, "copy", "workspace")).toMatchObject({
      status: "conflict",
      names: ["AGENTS.md"],
    });
  });

  it("points a link into the OpenClaw dir at the same place in the Hanzo Bot dir", async () => {
    fs.symlinkSync(path.join(source, "workspace", "memory"), path.join(source, "workspace", "mem"));
    fs.symlinkSync("memory", path.join(source, "workspace", "mem-rel"));
    fs.symlinkSync("/opt/elsewhere", path.join(source, "workspace", "outside"));
    await applyMigration({ source, target, home });
    const ws = path.join(target, "workspace");
    expect(fs.readlinkSync(path.join(ws, "mem"))).toBe(path.join(target, "workspace", "memory"));
    expect(fs.readlinkSync(path.join(ws, "mem-rel"))).toBe("memory");
    expect(fs.readlinkSync(path.join(ws, "outside"))).toBe("/opt/elsewhere");
  });

  it("refuses dirs that contain each other and a dir with no OpenClaw install", () => {
    expect(() => planMigration({ source, target: path.join(source, "bot"), home })).toThrow(
      /must not contain each other/,
    );
    expect(() => planMigration({ source, target: source, home })).toThrow();
    const empty = path.join(home, "empty");
    fs.mkdirSync(empty);
    expect(() => planMigration({ source: empty, target, home })).toThrow(/no OpenClaw install/);
  });
});

describe("OpenClaw database layout", () => {
  beforeEach(() => {
    closeDb = writeDbLayout(source);
  });

  it("reads the databases through their WAL without touching them", async () => {
    const before = snapshot(source);
    const plan = await applyMigration({ source, target, home });
    expect(snapshot(source)).toEqual(before);
    expectNoSecrets(JSON.stringify(plan));

    // Shared profiles overlaid by the agent's own; usage stats are not carried.
    expect(readJson("agents/main/agent/auth-profiles.json")).toEqual({
      version: 1,
      profiles: {
        "anthropic:default": { type: "api_key", provider: "anthropic", key: SECRETS.anthropicKey },
        "openai:default": { type: "api_key", provider: "openai", key: SECRETS.openaiKey },
      },
      order: { anthropic: ["anthropic:default"] },
    });

    const sessions = readJson("agents/main/sessions/sessions.json");
    expect(sessions).toEqual({
      "agent:main:main": {
        sessionId: "s-db-cur",
        updatedAt: 1_790_000_000_000,
        model: "claude-opus-5",
      },
    });
    const dir = path.join(target, "agents", "main", "sessions");
    expect(fs.readFileSync(path.join(dir, "s-db-cur.jsonl"), "utf8")).toBe(
      `${DB_SESSION_EVENTS.current.join("\n")}\n`,
    );
    expect(
      fs.readFileSync(path.join(dir, "s-db-old.jsonl.reset.2026-09-01T12-00-00.000Z"), "utf8"),
    ).toBe(`${DB_SESSION_EVENTS.old.join("\n")}\n`);
    expect(fs.readdirSync(dir).some((name) => name.includes("escape"))).toBe(false);
    expect(fs.existsSync(path.join(home, "escape.jsonl"))).toBe(false);

    const cron = readJson("cron/jobs.json");
    expect(cron.jobs).toEqual([
      expect.objectContaining({
        id: "job-brief",
        name: "morning brief",
        schedule: { kind: "cron", expr: "0 7 * * *", tz: "America/Los_Angeles" },
        payload: { kind: "agentTurn", message: "Summarize my inbox" },
        delivery: { mode: "announce", channel: "telegram", to: "111" },
        updatedAtMs: 1_790_000_000_000,
      }),
    ]);
    expect(
      plan.items.find((entry) => entry.from.endsWith("cron_jobs/heartbeat-main"))?.reason,
    ).toBe("managed");

    expect(readJson("credentials/telegram-default-allowFrom.json")).toEqual({
      version: 1,
      allowFrom: ["111"],
    });
    expect(readJson("credentials/whatsapp-work-allowFrom.json")).toEqual({
      version: 1,
      allowFrom: ["+15550002222"],
    });
    expect(mode("credentials/telegram-default-allowFrom.json")).toBe("600");

    const config = readJson("bot.json");
    expect(config).not.toHaveProperty("memory");
    expect(config).not.toHaveProperty("tts");
    expect(config.agents).toMatchObject({
      defaults: {
        models: { "anthropic/claude-opus-5": { alias: "opus" } },
        memorySearch: { enabled: true },
        embeddedPi: { projectSettingsPolicy: "trusted" },
      },
      list: [{ id: "main", name: "Main" }],
    });
    expect((config.agents as { defaults: Record<string, unknown> }).defaults).not.toHaveProperty(
      "modelPolicy",
    );
    expect(config.messages).toEqual({ tts: { auto: "off" } });
    expect(config.tools).toMatchObject({ web: { search: { apiKey: SECRETS.braveKey } } });
    expect(config.channels).not.toHaveProperty("discord.token");
    expect(config.hooks).toMatchObject({ internal: { installs: { "mail-hook": {} } } });
    expect(config).not.toHaveProperty("plugins.entries.anthropic");
    expect(config.browser).toEqual({
      profiles: { work: { driver: "clawd", cdpPort: 18800, color: "#FF4500" } },
    });

    const dropped = plan.items.filter((entry) => entry.op === "drop");
    expect(dropped.map((entry) => [entry.from, entry.reason])).toEqual(
      expect.arrayContaining([
        ["openclaw.json#meta", "metadata"],
        ["openclaw.json#channels.discord.token", "secret-store"],
        ["openclaw.json#plugins.entries.anthropic", "no-plugin"],
        ["openclaw.json#browser.profiles.attach", "invalid"],
      ]),
    );
    expect(item(plan, "skip", "plugins")?.names).toEqual(["groq", "voyage"]);
    expect(item(plan, "note", "devices")?.count).toBe(1);
  });

  it("is idempotent", async () => {
    await applyMigration({ source, target, home });
    const { actions } = planMigration({ source, target, home });
    expect(actions).toEqual([]);
  });
});
