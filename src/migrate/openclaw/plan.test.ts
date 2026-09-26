import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hanzoCloudConfig } from "../../commands/hanzo-cloud-config.js";
import { validateConfigObjectRaw } from "../../config/validation.js";
import { applyMigration, planMigration, type Plan } from "./plan.js";
import { DB_SESSION_EVENTS, SECRETS, writeDbLayout, writeFileLayout } from "./test-fixtures.js";

let home: string;
let source: string;
let target: string;
let closeDb: (() => void) | undefined;
let savedEnv: { HOME?: string; BOT_HOME?: string };

beforeEach(() => {
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "bot-migrate-test-")));
  source = path.join(home, ".openclaw");
  target = path.join(home, ".bot");
  // The validator expands `~` in the converted config with the process's home.
  savedEnv = { HOME: process.env.HOME, BOT_HOME: process.env.BOT_HOME };
  process.env.HOME = home;
  process.env.BOT_HOME = home;
});

afterEach(() => {
  closeDb?.();
  closeDb = undefined;
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
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
    expect(config.plugins).toEqual({ load: { paths: ["~/bot-plugins/hello"] } });
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
    // The workspace stays the one bot.json names: the plan says so rather than claim a move.
    expect(item(plan, "note", "bot.json")).toMatchObject({
      reason: "kept",
      names: expect.arrayContaining(["gateway.port", "agents.defaults.workspace"]),
    });
    expect(plan.items.filter((entry) => entry.to === "bot.json#agents.defaults.workspace")).toEqual(
      [],
    );
  });

  it("replaces what Hanzo Bot's first run wrote with OpenClaw's settings", async () => {
    fs.mkdirSync(path.join(target, "agents", "main", "agent"), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(target, "bot.json"), JSON.stringify(hanzoCloudConfig(home)), {
      mode: 0o600,
    });
    fs.writeFileSync(
      path.join(target, "agents", "main", "agent", "auth-profiles.json"),
      JSON.stringify({
        version: 1,
        profiles: {
          "anthropic:hanzo-iam": { type: "api_key", provider: "anthropic", key: "iam-token" },
        },
      }),
      { mode: 0o600 },
    );
    const plan = await applyMigration({ source, target, home });
    const config = readJson("bot.json") as {
      agents: { defaults: { workspace: string } };
      models?: unknown;
    };
    expect(config.agents.defaults.workspace).toBe("~/.bot/workspace");
    expect(config.models).toBeUndefined();
    expect(item(plan, "note", "bot.json")).toMatchObject({
      reason: "starter",
      names: ["agents.defaults.workspace", "models.providers.anthropic"],
    });
    // The first run's IAM token, which only the proxy accepts, is never offered to Anthropic.
    const auth = readJson("agents/main/agent/auth-profiles.json") as {
      profiles: Record<string, unknown>;
    };
    expect(Object.keys(auth.profiles)).toEqual(["anthropic:default"]);
    expect(
      item(plan, "drop", "agents/main/agent/auth-profiles.json#anthropic:hanzo-iam"),
    ).toMatchObject({ reason: "starter-token" });
  });

  /** Hanzo Bot's first run: its starter bot.json and the IAM token under the Anthropic provider. */
  function firstRun(config: Record<string, unknown> = hanzoCloudConfig(home)): void {
    fs.mkdirSync(path.join(target, "agents", "main", "agent"), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(target, "bot.json"), JSON.stringify(config), { mode: 0o600 });
    fs.writeFileSync(
      path.join(target, "agents", "main", "agent", "auth-profiles.json"),
      JSON.stringify({
        version: 1,
        profiles: {
          "anthropic:hanzo-iam": { type: "api_key", provider: "anthropic", key: "iam-token" },
        },
        lastGood: { anthropic: "anthropic:hanzo-iam" },
      }),
      { mode: 0o600 },
    );
  }

  /** Move main's Anthropic profile to `to` (another agent's store), or drop it. */
  function moveMainAnthropicKey(to?: string): void {
    const file = path.join(source, "agents", "main", "agent", "auth-profiles.json");
    const store = JSON.parse(fs.readFileSync(file, "utf8")) as {
      profiles: Record<string, unknown>;
    };
    const key = store.profiles["anthropic:default"];
    fs.writeFileSync(file, JSON.stringify({ version: 1, profiles: {} }), { mode: 0o600 });
    if (to) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, JSON.stringify({ version: 1, profiles: { "anthropic:work": key } }), {
        mode: 0o600,
      });
    }
  }

  it("lets an Anthropic key that is only in .env replace the first-run route", async () => {
    moveMainAnthropicKey();
    firstRun();
    await applyMigration({ source, target, home });
    expect(readJson("bot.json").models).toBeUndefined();
    expect(fs.readFileSync(path.join(target, ".env"), "utf8")).toContain("ANTHROPIC_API_KEY=");
    // With no Anthropic profile left, the key in .env is the one used.
    const auth = readJson("agents/main/agent/auth-profiles.json");
    expect(auth).toEqual({ version: 1, profiles: {}, lastGood: {} });
  });

  it("lets another agent's Anthropic key replace the first-run route for every agent", async () => {
    moveMainAnthropicKey(path.join(source, "agents", "work", "agent", "auth-profiles.json"));
    fs.writeFileSync(path.join(source, ".env"), "OPENCLAW_GATEWAY_TOKEN=x\n", { mode: 0o600 });
    firstRun();
    await applyMigration({ source, target, home });
    expect(readJson("bot.json").models).toBeUndefined();
    // Every agent's store is main's beneath its own: the IAM token is in neither.
    const main = readJson("agents/main/agent/auth-profiles.json");
    const work = readJson("agents/work/agent/auth-profiles.json");
    expect(Object.keys(main.profiles as object)).toEqual([]);
    expect(Object.keys(work.profiles as object)).toEqual(["anthropic:work"]);
  });

  it("drops a leftover first-run token when no bot.json routes Anthropic to the proxy", async () => {
    firstRun();
    fs.rmSync(path.join(target, "bot.json"));
    const plan = await applyMigration({ source, target, home });
    expect(readJson("bot.json").models).toBeUndefined();
    expect(
      Object.keys(readJson("agents/main/agent/auth-profiles.json").profiles as object),
    ).toEqual(["anthropic:default"]);
    expect(
      item(plan, "drop", "agents/main/agent/auth-profiles.json#anthropic:hanzo-iam"),
    ).toBeDefined();
  });

  it("says where the imported Anthropic key goes when bot.json keeps a changed route", async () => {
    const changed = hanzoCloudConfig(home);
    changed.models.providers.anthropic.models = [{ id: "claude-opus-5", name: "Opus" }];
    firstRun(changed);
    const plan = await applyMigration({ source, target, home });
    expect(readJson("bot.json").models).toMatchObject({
      providers: { anthropic: { baseUrl: "https://api.hanzo.ai" } },
    });
    expect(plan.items.find((entry) => entry.reason === "anthropic-route")).toMatchObject({
      names: ["https://api.hanzo.ai"],
    });
    // The token stays with the route that accepts it.
    expect(readJson("agents/main/agent/auth-profiles.json").profiles).toHaveProperty(
      "anthropic:hanzo-iam",
    );
  });

  it("drops an imported key that would stop the merged bot.json from loading", async () => {
    const file = path.join(source, "openclaw.json");
    const config = fs
      .readFileSync(file, "utf8")
      .replace('dmPolicy: "pairing"', 'dmPolicy: "open", allowFrom: ["*"]');
    fs.writeFileSync(file, config);
    fs.mkdirSync(target, { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      path.join(target, "bot.json"),
      JSON.stringify({ channels: { telegram: { allowFrom: ["123456789"] } } }),
      { mode: 0o600 },
    );
    const plan = await applyMigration({ source, target, home });
    const merged = readJson("bot.json");
    expect(validateConfigObjectRaw(merged).ok).toBe(true);
    // Only the key that breaks it goes; the Telegram token comes along.
    expect(merged.channels).toMatchObject({
      telegram: { allowFrom: ["123456789"], botToken: SECRETS.telegramToken },
    });
    expect(item(plan, "drop", "openclaw.json#channels.telegram.dmPolicy")?.reason).toBe("merge");
  });

  it("copies a linked OpenClaw dir as files, and never writes through the link", async () => {
    const dotfiles = path.join(home, "dotfiles", "openclaw-skills");
    fs.mkdirSync(path.dirname(dotfiles), { recursive: true });
    fs.renameSync(path.join(source, "skills"), dotfiles);
    fs.symlinkSync(dotfiles, path.join(source, "skills"));
    const workshop = path.join(source, "agents", "main", "agent", "workshop-skills", "trip");
    fs.mkdirSync(workshop, { recursive: true });
    fs.writeFileSync(path.join(workshop, "SKILL.md"), "---\nname: trip\n---\n");
    const before = snapshot(dotfiles);
    const plan = await applyMigration({ source, target, home });
    expect(snapshot(dotfiles)).toEqual(before);
    expect(fs.lstatSync(path.join(target, "skills")).isDirectory()).toBe(true);
    expect(fs.existsSync(path.join(target, "skills", "managed-one", "SKILL.md"))).toBe(true);
    expect(item(plan, "note", "skills")).toMatchObject({
      reason: "linked-dir",
      to: "~/dotfiles/openclaw-skills",
    });
  });

  it("keeps workshop skills with their agent, and a same-named one does not stop the import", async () => {
    for (const agent of ["main", "work"]) {
      const dir = path.join(source, "agents", agent, "agent", "workshop-skills", "daily-brief");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: daily-brief\n---\n# ${agent}\n`);
    }
    // OpenClaw's managed skill of the same name loaded first; this one was never used.
    const shadowed = path.join(source, "agents", "main", "agent", "workshop-skills", "managed-one");
    fs.mkdirSync(shadowed, { recursive: true });
    fs.writeFileSync(path.join(shadowed, "SKILL.md"), "---\nname: managed-one\n---\n");
    const plan = await applyMigration({ source, target, home });
    const skill = (ws: string) =>
      path.join(target, ws, ".agents", "skills", "daily-brief", "SKILL.md");
    expect(fs.readFileSync(skill("workspace"), "utf8")).toContain("# main");
    expect(fs.readFileSync(skill("workspace-work"), "utf8")).toContain("# work");
    expect(fs.existsSync(path.join(target, "skills", "daily-brief"))).toBe(false);
    expect(fs.existsSync(path.join(target, "workspace", ".agents", "skills", "managed-one"))).toBe(
      false,
    );
    expect(item(plan, "skip", "agents/main/agent/workshop-skills")).toMatchObject({
      reason: "shadowed",
      names: ["managed-one"],
    });
  });

  it("reports a second copy to one place as a conflict", async () => {
    // Two agents working in one dir both have a workshop skill of one name.
    const file = path.join(source, "openclaw.json");
    fs.writeFileSync(
      file,
      fs
        .readFileSync(file, "utf8")
        .replace('{ id: "work" }', '{ id: "work", workspace: "~/.openclaw/workspace" }'),
    );
    for (const agent of ["main", "work"]) {
      const dir = path.join(source, "agents", agent, "agent", "workshop-skills", "daily-brief");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: daily-brief\n---\n# ${agent}\n`);
    }
    const plan = await applyMigration({ source, target, home });
    expect(item(plan, "copy", "agents/work/agent/workshop-skills")).toMatchObject({
      status: "conflict",
      names: [path.join("daily-brief", "SKILL.md")],
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

  it("passes over an OpenClaw dir that is a link to nothing, and says so", async () => {
    fs.rmSync(path.join(source, "workspace"), { recursive: true });
    fs.symlinkSync(path.join(home, "unmounted", "workspace"), path.join(source, "workspace"));
    const plan = await applyMigration({ source, target, home });
    expect(item(plan, "copy", "workspace")).toBeUndefined();
    expect(item(plan, "skip", "workspace")).toMatchObject({
      reason: "link-missing",
      names: ["~/unmounted/workspace"],
    });
    expect(fs.existsSync(path.join(target, "workspace"))).toBe(false);
  });

  it("keeps a dangling link where a file would be copied", async () => {
    fs.mkdirSync(path.join(target, "workspace"), { recursive: true });
    fs.symlinkSync(path.join(home, "nowhere"), path.join(target, "workspace", "AGENTS.md"));
    const plan = await applyMigration({ source, target, home });
    expect(item(plan, "copy", "workspace")).toMatchObject({
      status: "conflict",
      names: ["AGENTS.md"],
    });
    expect(fs.readlinkSync(path.join(target, "workspace", "AGENTS.md"))).toBe(
      path.join(home, "nowhere"),
    );
    expect(fs.existsSync(path.join(home, "nowhere"))).toBe(false);
  });

  it("refuses a Hanzo Bot dir that is a link to the OpenClaw dir", () => {
    fs.symlinkSync(source, target);
    expect(() => planMigration({ source, target, home })).toThrow(/must not contain each other/);
  });

  it("points a relative link that leads back into the OpenClaw dir at the Hanzo Bot dir", async () => {
    // workspace/.agents -> ../../.openclaw, copied as it is, would name ~/.openclaw
    // from ~/.bot/workspace; an agent's workshop skill would be copied through it.
    fs.symlinkSync(path.join("..", "..", ".openclaw"), path.join(source, "workspace", ".agents"));
    const workshop = path.join(source, "agents", "main", "agent", "workshop-skills", "back");
    fs.mkdirSync(workshop, { recursive: true });
    fs.writeFileSync(path.join(workshop, "SKILL.md"), "---\nname: back\n---\n");
    const before = snapshot(source);
    await applyMigration({ source, target, home });
    expect(snapshot(source)).toEqual(before);
    expect(fs.readlinkSync(path.join(target, "workspace", ".agents"))).toBe(target);
    expect(fs.existsSync(path.join(target, "skills", "back", "SKILL.md"))).toBe(true);
  });

  it("keeps workshop skills out of a dir OpenClaw reaches through a link", async () => {
    const shared = path.join(home, "shared-agents");
    fs.mkdirSync(shared);
    fs.symlinkSync(shared, path.join(source, "workspace", ".agents"));
    const workshop = path.join(source, "agents", "main", "agent", "workshop-skills", "trip");
    fs.mkdirSync(workshop, { recursive: true });
    fs.writeFileSync(path.join(workshop, "SKILL.md"), "---\nname: trip\n---\n");
    const plan = await applyMigration({ source, target, home });
    expect(fs.readdirSync(shared)).toEqual([]);
    const saved = path.join(
      target,
      "agents",
      "main",
      "from-openclaw",
      "skills",
      "trip",
      "SKILL.md",
    );
    expect(fs.existsSync(saved)).toBe(true);
    expect(plan.items.find((entry) => entry.reason === "skills-linked")).toMatchObject({
      from: "~/.bot/workspace/.agents",
      to: "~/.bot/agents/main/from-openclaw/skills",
      names: ["main", "~/shared-agents"],
    });
  });

  it("leaves a workshop skill behind when Hanzo Bot already has a skill of that name", async () => {
    fs.mkdirSync(path.join(target, "skills", "daily-brief"), { recursive: true });
    fs.writeFileSync(path.join(target, "skills", "daily-brief", "SKILL.md"), "# installed\n");
    const workshop = path.join(source, "agents", "main", "agent", "workshop-skills", "daily-brief");
    fs.mkdirSync(workshop, { recursive: true });
    fs.writeFileSync(path.join(workshop, "SKILL.md"), "---\nname: daily-brief\n---\n");
    const plan = await applyMigration({ source, target, home });
    expect(fs.existsSync(path.join(target, "workspace", ".agents", "skills", "daily-brief"))).toBe(
      false,
    );
    expect(item(plan, "copy", "agents/main/agent/workshop-skills")).toBeUndefined();
    expect(item(plan, "skip", "agents/main/agent/workshop-skills")).toMatchObject({
      reason: "shadowed",
      names: ["daily-brief"],
    });
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

    // OpenClaw moved HEARTBEAT.md into its database; Hanzo Bot reads it from the workspace.
    expect(fs.readFileSync(path.join(target, "workspace", "HEARTBEAT.md"), "utf8")).toBe(
      "- Check the inbox\n- Water the plants\n",
    );

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

  it("never writes into the OpenClaw install through a link in the Hanzo Bot dir", async () => {
    // A workspace shared by linking ~/.bot/workspace to OpenClaw's: the
    // heartbeat checklist would land in OpenClaw's workspace.
    fs.mkdirSync(target, { recursive: true, mode: 0o700 });
    fs.symlinkSync(path.join(source, "workspace"), path.join(target, "workspace"));
    const before = snapshot(source);
    expect(() => planMigration({ source, target, home })).toThrow(
      /workspace\/HEARTBEAT\.md leads into .*\.openclaw, which OpenClaw uses/,
    );
    await expect(applyMigration({ source, target, home })).rejects.toThrow(/nothing was written/);
    expect(snapshot(source)).toEqual(before);
    expect(fs.readdirSync(target)).toEqual(["workspace"]);
  });

  it("follows a link spelled in another case to the OpenClaw install", async () => {
    const upper = path.join(home, ".OpenClaw");
    if (!fs.existsSync(upper)) {
      return; // a case-sensitive volume: ~/.OpenClaw is another dir
    }
    fs.mkdirSync(target, { recursive: true, mode: 0o700 });
    fs.symlinkSync(path.join(upper, "workspace"), path.join(target, "workspace"));
    const before = snapshot(source);
    await expect(applyMigration({ source, target, home })).rejects.toThrow(/which OpenClaw uses/);
    expect(snapshot(source)).toEqual(before);
  });

  it("copies a linked workspace as files and writes the heartbeat into the copy", async () => {
    const shared = path.join(home, "Documents", "openclaw-workspace");
    fs.mkdirSync(path.dirname(shared), { recursive: true });
    fs.renameSync(path.join(source, "workspace"), shared);
    fs.symlinkSync(shared, path.join(source, "workspace"));
    const before = snapshot(shared);
    const plan = await applyMigration({ source, target, home });
    expect(snapshot(shared)).toEqual(before);
    expect(fs.lstatSync(path.join(target, "workspace")).isDirectory()).toBe(true);
    expect(fs.readFileSync(path.join(target, "workspace", "HEARTBEAT.md"), "utf8")).toContain(
      "Check the inbox",
    );
    expect(item(plan, "note", "workspace")).toMatchObject({
      reason: "linked-dir",
      to: "~/Documents/openclaw-workspace",
    });
  });

  it("puts the heartbeat where the agent works, and leaves a workspace outside the target alone", async () => {
    const file = path.join(source, "openclaw.json");
    const config = JSON.parse(fs.readFileSync(file, "utf8")) as {
      agents: { defaults: Record<string, unknown> };
    };
    config.agents.defaults.workspace = "~/projects/assistant";
    fs.writeFileSync(file, JSON.stringify(config));
    fs.mkdirSync(path.join(home, "projects", "assistant"), { recursive: true });
    const plan = await applyMigration({ source, target, home });
    expect(fs.readdirSync(path.join(home, "projects", "assistant"))).toEqual([]);
    const saved = path.join(target, "agents", "main", "from-openclaw", "HEARTBEAT.md");
    expect(fs.readFileSync(saved, "utf8")).toContain("Check the inbox");
    expect(plan.items.find((entry) => entry.reason === "agent-outside")).toMatchObject({
      from: "~/projects/assistant",
      to: "~/.bot/agents/main/from-openclaw",
    });
  });

  it("merges an allowlist file OpenClaw left beside its database entries", async () => {
    // OpenClaw's doctor has not folded this file into the database yet.
    const legacy = path.join(source, "credentials", "telegram-default-allowFrom.json");
    fs.mkdirSync(path.dirname(legacy), { recursive: true, mode: 0o700 });
    fs.writeFileSync(legacy, JSON.stringify({ version: 1, allowFrom: ["222", "111"] }), {
      mode: 0o600,
    });
    const plan = await applyMigration({ source, target, home });
    expect(readJson("credentials/telegram-default-allowFrom.json")).toEqual({
      version: 1,
      allowFrom: ["111", "222"],
    });
    expect(item(plan, "write", "credentials/telegram-default-allowFrom.json")?.from).toContain(
      "+ credentials/telegram-default-allowFrom.json",
    );
    expect(planMigration({ source, target, home }).actions).toEqual([]);
  });

  it("reads a config that spells the OpenClaw dir as Clawdbot's ~/.clawdbot", async () => {
    fs.symlinkSync(source, path.join(home, ".clawdbot"));
    fs.symlinkSync(path.join(source, "workspace"), path.join(home, "clawd"));
    const file = path.join(source, "openclaw.json");
    const config = JSON.parse(fs.readFileSync(file, "utf8")) as {
      agents: { defaults: Record<string, unknown>; entries?: Record<string, unknown> };
    };
    config.agents.defaults.workspace = "~/.clawdbot/workspace";
    config.agents.entries = { main: { name: "Main" }, ops: { workspace: "~/clawd" } };
    fs.writeFileSync(file, JSON.stringify(config));
    const before = snapshot(source);
    const plan = await applyMigration({ source, target, home });
    expect(snapshot(source)).toEqual(before);
    const agents = readJson("bot.json").agents as {
      defaults: { workspace: string };
      list: Array<{ id: string; workspace?: string }>;
    };
    expect(agents.defaults.workspace).toBe("~/.bot/workspace");
    expect(agents.list.find((entry) => entry.id === "ops")?.workspace).toBe("~/.bot/workspace");
    expect(plan.items.filter((entry) => entry.reason === "workspace-in-place")).toEqual([]);
  });

  it("guards a workspace outside the OpenClaw dir that main's list entry names", async () => {
    const file = path.join(source, "openclaw.json");
    const config = JSON.parse(fs.readFileSync(file, "utf8")) as {
      agents: { entries: Record<string, unknown> };
    };
    config.agents.entries = { main: { name: "Main", workspace: "~/projects/assistant" } };
    fs.writeFileSync(file, JSON.stringify(config));
    fs.mkdirSync(path.join(home, "projects", "assistant"), { recursive: true });
    const plan = await applyMigration({ source, target, home });
    expect(plan.items.filter((entry) => entry.reason === "workspace-in-place")).toEqual([
      { op: "note", from: "~/projects/assistant", reason: "workspace-in-place" },
    ]);
    expect(fs.readdirSync(path.join(home, "projects", "assistant"))).toEqual([]);
  });

  it("names a workspace outside the OpenClaw dir once, however many settings name it", () => {
    const file = path.join(source, "openclaw.json");
    const config = JSON.parse(fs.readFileSync(file, "utf8")) as {
      agents: { defaults: Record<string, unknown>; entries: Record<string, unknown> };
    };
    config.agents.defaults.workspace = "~/projects/assistant";
    config.agents.entries = { main: { name: "Main", workspace: "~/projects/assistant" } };
    fs.writeFileSync(file, JSON.stringify(config));
    const { plan } = planMigration({ source, target, home });
    expect(plan.items.filter((entry) => entry.reason === "workspace-in-place")).toHaveLength(1);
  });

  it("puts a non-default agent's heartbeat in that agent's workspace", async () => {
    const file = path.join(source, "openclaw.json");
    const config = JSON.parse(fs.readFileSync(file, "utf8")) as {
      agents: { entries: Record<string, unknown> };
    };
    config.agents.entries = { ops: { default: true }, main: { name: "Main" } };
    fs.writeFileSync(file, JSON.stringify(config));
    await applyMigration({ source, target, home });
    expect(fs.existsSync(path.join(target, "workspace-main", "HEARTBEAT.md"))).toBe(true);
    expect(fs.existsSync(path.join(target, "workspace", "HEARTBEAT.md"))).toBe(false);
  });
});
