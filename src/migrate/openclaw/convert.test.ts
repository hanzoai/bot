import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hanzoCloudConfig } from "../../commands/hanzo-cloud-config.js";
import { approvalSources, parseApprovals } from "./approvals.js";
import {
  convertConfig,
  formatPath,
  listEnvRefs,
  mergeBeneath,
  rewriteEnvRefs,
  validateMerge,
  yieldStarter,
} from "./config.js";
import { convertCronJob, mergeAuth, resetArchiveName } from "./convert.js";
import { convertEnvEntries, mergeEnvText, parseEnvEntries } from "./env.js";
import { createPathRewriter, homeForm } from "./paths.js";
import { resolveOpenClawStateDir } from "./state.js";

const HOME = "/home/ada";
const rewrite = createPathRewriter({
  sourceDir: `${HOME}/.openclaw`,
  targetDir: `${HOME}/.bot`,
  home: HOME,
});

function convert(source: Record<string, unknown>) {
  return convertConfig({ source, rewrite, home: HOME });
}

describe("resolveOpenClawStateDir", () => {
  it("follows OpenClaw's rules, not Hanzo Bot's", () => {
    expect(resolveOpenClawStateDir({ HOME, BOT_HOME: "/elsewhere" })).toBe(`${HOME}/.openclaw`);
    // OpenClaw's --profile flag sets OPENCLAW_STATE_DIR; the env var alone does not move it.
    expect(resolveOpenClawStateDir({ HOME, OPENCLAW_PROFILE: "work" })).toBe(`${HOME}/.openclaw`);
    expect(resolveOpenClawStateDir({ HOME, OPENCLAW_HOME: "/srv/oc" })).toBe("/srv/oc/.openclaw");
    expect(resolveOpenClawStateDir({ HOME, OPENCLAW_STATE_DIR: "~/oc-state" })).toBe(
      `${HOME}/oc-state`,
    );
  });

  it("falls back to a Clawdbot-era ~/.clawdbot only when ~/.openclaw is missing, as OpenClaw does", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "oc-dir-"));
    try {
      fs.mkdirSync(path.join(home, ".clawdbot"));
      expect(resolveOpenClawStateDir({ HOME: home })).toBe(path.join(home, ".clawdbot"));
      fs.mkdirSync(path.join(home, ".openclaw"));
      expect(resolveOpenClawStateDir({ HOME: home })).toBe(path.join(home, ".openclaw"));
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("paths", () => {
  it("writes a path under home as ~/…", () => {
    expect(homeForm(`${HOME}/.bot`, HOME)).toBe("~/.bot");
    expect(homeForm(HOME, HOME)).toBe("~");
    expect(homeForm("/opt/x", HOME)).toBe("/opt/x");
  });

  it("rewrites the state dir only at a path boundary, in either form", () => {
    expect(rewrite("~/.openclaw/workspace")).toBe("~/.bot/workspace");
    expect(rewrite(`${HOME}/.openclaw/media`)).toBe(`${HOME}/.bot/media`);
    expect(rewrite("~/.openclaw")).toBe("~/.bot");
    expect(rewrite("~/.openclaw-work/x")).toBe("~/.openclaw-work/x");
    expect(rewrite("cd ~/.openclaw && ls")).toBe("cd ~/.bot && ls");
  });
});

describe("env", () => {
  it("keeps raw values, quotes and multi-line values", () => {
    const entries = parseEnvEntries(
      "export A=1\nB=\"two words\"\n# comment\nC='multi\nline'\n  D = spaced\nnot an entry\n",
    );
    expect(entries).toEqual([
      { key: "A", raw: "1" },
      { key: "B", raw: '"two words"' },
      { key: "C", raw: "'multi\nline'" },
      { key: "D", raw: "spaced" },
    ]);
  });

  it("renames OPENCLAW_* to BOT_*, drops the locators, rewrites paths", () => {
    const converted = convertEnvEntries(
      parseEnvEntries(
        "OPENCLAW_GATEWAY_TOKEN=t\nOPENCLAW_STATE_DIR=~/.openclaw\nOPENCLAW_CONFIG_PATH=x\nOPENCLAW_WORKSPACE=~/.openclaw/ws\nOPENAI_API_KEY=k\n",
      ),
      rewrite,
    );
    expect(converted.entries).toEqual([
      { key: "BOT_GATEWAY_TOKEN", raw: "t" },
      { key: "BOT_WORKSPACE", raw: "~/.bot/ws" },
      { key: "OPENAI_API_KEY", raw: "k" },
    ]);
    expect(converted.dropped).toEqual(["OPENCLAW_STATE_DIR", "OPENCLAW_CONFIG_PATH"]);
  });

  it("merges by appending only keys the file does not set", () => {
    const merged = mergeEnvText("A=mine", [
      { key: "A", raw: "theirs" },
      { key: "B", raw: "2" },
    ]);
    expect(merged).toEqual({ text: "A=mine\nB=2\n", added: ["B"] });
    expect(mergeEnvText("A=1\n", [{ key: "A", raw: "2" }])).toEqual({ text: "A=1\n", added: [] });
  });
});

describe("config", () => {
  it("renames ${OPENCLAW_*} references and lists what bot.json reads from the env", () => {
    expect(rewriteEnvRefs("${OPENCLAW_GATEWAY_TOKEN} and ${OTHER}")).toBe(
      "${BOT_GATEWAY_TOKEN} and ${OTHER}",
    );
    expect(listEnvRefs({ a: ["${BOT_X}", { b: "${BOT_Y}${BOT_X}" }] })).toEqual(["BOT_X", "BOT_Y"]);
  });

  it("moves settings OpenClaw relocated back to where Hanzo Bot reads them", () => {
    const { config, report } = convert({
      tts: { auto: "off" },
      attachments: { maxBytes: 1000 },
      memory: { search: { enabled: false } },
      gateway: { nodes: { commands: { allow: ["camera.snap"], deny: ["system.run"] } } },
      agents: {
        defaults: { embeddedAgent: { projectSettingsPolicy: "ignore" }, pdfMaxMb: 20 },
        list: [{ id: "ops", memory: { search: { enabled: true } } }],
      },
      plugins: {
        entries: {
          canvas: { config: { host: { enabled: false } } },
          google: { config: { webSearch: { apiKey: "g" } } },
        },
      },
    });
    expect(config).toMatchObject({
      messages: { tts: { auto: "off" } },
      agents: {
        defaults: {
          memorySearch: { enabled: false },
          embeddedPi: { projectSettingsPolicy: "ignore" },
          pdfMaxBytesMb: 20,
        },
        list: [{ id: "ops", memorySearch: { enabled: true } }],
      },
      gateway: { nodes: { allowCommands: ["camera.snap"], denyCommands: ["system.run"] } },
      canvasHost: { enabled: false },
      tools: { web: { search: { gemini: { apiKey: "g" } } } },
    });
    expect(config).not.toHaveProperty("tts");
    expect(config).not.toHaveProperty("memory");
    expect(config).not.toHaveProperty("plugins");
    expect(report.renamed).toEqual(
      expect.arrayContaining([
        { from: "tts", to: "messages.tts" },
        { from: "agents.defaults.pdfMaxMb", to: "agents.defaults.pdfMaxBytesMb" },
        { from: "memory.search", to: "agents.defaults.memorySearch" },
        { from: "agents.list[0].memory.search", to: "agents.list[0].memorySearch" },
        { from: "gateway.nodes.commands.allow", to: "gateway.nodes.allowCommands" },
        { from: "plugins.entries.canvas.config.host", to: "canvasHost" },
        { from: "plugins.entries.google.config.webSearch", to: "tools.web.search.gemini" },
      ]),
    );
  });

  it("keeps a setting already at its new place and reports the old one superseded", () => {
    const { config, report } = convert({
      tts: { auto: "off" },
      messages: { tts: { auto: "always" } },
    });
    expect(config.messages).toEqual({ tts: { auto: "always" } });
    expect(report.dropped).toContainEqual({ path: "tts", reason: "superseded" });
  });

  it("turns OpenClaw's model policy into Hanzo Bot's model allowlist", () => {
    const models = { "a/one": { alias: "one" }, "b/two": {} };
    const stamped = { meta: { migrations: { modelPolicyAllowlist: true } } };
    const allow = convert({
      ...stamped,
      agents: { defaults: { models, modelPolicy: { allow: ["a/one", "c/three"] } } },
    });
    expect(allow.config.agents).toEqual({
      defaults: { models: { "a/one": { alias: "one" }, "c/three": {} } },
    });
    // No allow list: OpenClaw allowed every model, so the catalog must not become an allowlist.
    const open = convert({ ...stamped, agents: { defaults: { models } } });
    expect(open.config).not.toHaveProperty("agents.defaults.models");
    expect(open.report.dropped).toContainEqual({
      path: "agents.defaults.models",
      reason: "model-catalog",
    });
    // Before the stamp, agents.defaults.models already meant what Hanzo Bot means.
    const legacy = convert({ agents: { defaults: { models } } });
    expect(legacy.config.agents).toEqual({ defaults: { models } });
  });

  it("drops OpenClaw machinery and keys Hanzo Bot does not have", () => {
    const { config, report } = convert({
      meta: { lastTouchedVersion: "2026.9.6" },
      plugins: {
        installs: { x: {} },
        load: { paths: [`${HOME}/.openclaw/extensions/x`, "/opt/openclaw-plugin"] },
      },
      channels: { discord: { token: { source: "store", id: "d" } } },
      gateway: { mode: "local", someNewGatewayKnob: 1 },
    });
    // The channel stays; its token, held in OpenClaw's secret store, is entered again.
    expect(config).toEqual({
      channels: { discord: {} },
      gateway: { mode: "local" },
    });
    expect(report.dropped).toEqual(
      expect.arrayContaining([
        { path: "meta", reason: "metadata" },
        { path: "plugins.installs", reason: "plugins" },
        { path: "plugins.load.paths[0]", reason: "plugins" },
        { path: "plugins.load.paths[1]", reason: "plugins" },
        { path: "channels.discord.token", reason: "secret-store" },
        { path: "gateway.someNewGatewayKnob", reason: "openclaw-only" },
      ]),
    );
  });

  it("drops a value the validator rejects, and a profile missing what Hanzo Bot requires", () => {
    const { config, report } = convert({
      gateway: { port: "not-a-port", mode: "local" },
      browser: { profiles: { a: { driver: "existing-session" }, b: { cdpUrl: "http://x:9222" } } },
    });
    expect(config).toEqual({
      gateway: { mode: "local" },
      browser: { profiles: { b: { cdpUrl: "http://x:9222", color: "#0066CC" } } },
    });
    expect(report.dropped).toEqual(
      expect.arrayContaining([
        { path: "gateway.port", reason: "invalid" },
        { path: "browser.profiles.a", reason: "invalid" },
      ]),
    );
  });

  it("drops a channel Hanzo Bot does not have and keeps the ones it does", () => {
    const { config, report } = convert({
      channels: {
        sms: { enabled: true },
        zalo: { botToken: "t" },
        telegram: { botToken: "1:a", notAKey: 1 },
      },
    });
    expect(config).toEqual({
      channels: { zalo: { botToken: "t" }, telegram: { botToken: "1:a" } },
    });
    expect(report.dropped).toEqual(
      expect.arrayContaining([
        { path: "channels.sms", reason: "no-channel" },
        { path: "channels.telegram.notAKey", reason: "openclaw-only" },
      ]),
    );
  });

  it("merges beneath an existing config without replacing what it sets", () => {
    const existing = { gateway: { port: 1, auth: { mode: "token" } }, list: [1] };
    const { added, kept } = mergeBeneath(existing, {
      gateway: { port: 2, bind: "loopback", auth: { token: "t" } },
      list: [2],
      tools: {},
    });
    expect(existing).toEqual({
      gateway: { port: 1, bind: "loopback", auth: { mode: "token", token: "t" } },
      list: [1],
      tools: {},
    });
    expect(added.map(formatPath)).toEqual(["gateway.bind", "gateway.auth.token", "tools"]);
    // What the existing file overrules is reported, not claimed as moved.
    expect(kept.map(formatPath)).toEqual(["gateway.port", "list"]);
  });

  it("lets OpenClaw's settings replace what Hanzo Bot's first run wrote", () => {
    const starter = hanzoCloudConfig(HOME);
    const incoming = {
      gateway: { mode: "local", bind: "lan" },
      agents: { defaults: { workspace: "~/.bot/workspace" } },
    };
    const firstRun = structuredClone(starter) as Record<string, unknown>;
    expect(yieldStarter(firstRun, starter, incoming, { anthropic: true })).toEqual([
      "gateway.bind",
      "agents.defaults.workspace",
      "models.providers.anthropic",
    ]);
    expect(firstRun).toEqual({ gateway: { mode: "local" }, agents: { defaults: {} } });

    // Without an imported Anthropic key the proxy route is the only one that works.
    const keep = structuredClone(starter) as Record<string, unknown>;
    expect(yieldStarter(keep, starter, incoming, { anthropic: false })).not.toContain(
      "models.providers.anthropic",
    );
    // A value the person set is theirs.
    const own = { agents: { defaults: { workspace: "~/mine" } } };
    expect(yieldStarter(own, starter, incoming, { anthropic: true })).toEqual([]);
  });

  it("drops the added keys that would stop a merged bot.json from loading", () => {
    const before = { channels: { telegram: { allowFrom: ["123456789"] } } };
    const merged = structuredClone(before) as Record<string, unknown>;
    const { added } = mergeBeneath(merged, {
      channels: { telegram: { dmPolicy: "open", allowFrom: ["*"] } },
      tools: { web: { search: { enabled: true } } },
    });
    expect(validateMerge(merged, before, added)).toEqual(["channels.telegram.dmPolicy"]);
    expect(merged).toEqual({
      channels: { telegram: { allowFrom: ["123456789"] } },
      tools: { web: { search: { enabled: true } } },
    });
  });
});

describe("tools.exec.mode", () => {
  // OpenClaw's doctor resolveConfiguredExecPolicy; its runtime resolveExecPolicyForMode agrees.
  type Policy = { security: string; ask: string };
  const POLICY: Array<[string, Policy]> = [
    ["deny", { security: "deny", ask: "off" }],
    ["allowlist", { security: "allowlist", ask: "off" }],
    ["ask", { security: "allowlist", ask: "on-miss" }],
    ["auto", { security: "allowlist", ask: "on-miss" }],
    ["full", { security: "full", ask: "off" }],
  ];

  function renames(at: string, mode: string, policy: Policy) {
    return [
      { from: `${at}.mode="${mode}"`, to: `${at}.security="${policy.security}"` },
      { from: `${at}.mode="${mode}"`, to: `${at}.ask="${policy.ask}"` },
    ];
  }

  it.each(POLICY)(
    "reads mode %s as the security and ask OpenClaw ran, at the root",
    (mode, policy) => {
      const { config, report } = convert({ tools: { exec: { mode, backgroundMs: 5000 } } });
      expect(config).toEqual({ tools: { exec: { ...policy, backgroundMs: 5000 } } });
      expect(report.renamed).toEqual(renames("tools.exec", mode, policy));
      expect(report.dropped).toEqual([]);
    },
  );

  it.each(POLICY)(
    "reads mode %s as the security and ask OpenClaw ran, in an agent",
    (mode, policy) => {
      const { config, report } = convert({
        agents: { list: [{ id: "main" }, { id: "ops", tools: { exec: { mode } } }] },
      });
      expect(config).toEqual({
        agents: { list: [{ id: "main" }, { id: "ops", tools: { exec: policy } }] },
      });
      expect(report.renamed).toEqual(renames("agents.list[1].tools.exec", mode, policy));
      expect(report.dropped).toEqual([]);
    },
  );

  // OpenClaw's runtime (applyExecPolicyLayer) and doctor (migrateExecMode) let mode win.
  const BOTH: Array<[string, Record<string, string>, Policy]> = [
    ["deny", { security: "full" }, { security: "deny", ask: "off" }],
    ["deny", { security: "full", ask: "off" }, { security: "deny", ask: "off" }],
    ["deny", { ask: "always" }, { security: "deny", ask: "off" }],
    ["allowlist", { security: "full", ask: "on-miss" }, { security: "allowlist", ask: "off" }],
    ["ask", { ask: "off" }, { security: "allowlist", ask: "on-miss" }],
    ["auto", { security: "full" }, { security: "allowlist", ask: "on-miss" }],
    ["full", { security: "deny", ask: "always" }, { security: "full", ask: "off" }],
  ];

  it.each(BOTH)(
    "lets mode %s win over %o beside it, at the root and in an agent",
    (mode, beside, policy) => {
      const { config, report } = convert({
        tools: { exec: { mode, ...beside } },
        agents: { list: [{ id: "ops", tools: { exec: { mode, ...beside } } }] },
      });
      expect(config).toEqual({
        tools: { exec: policy },
        agents: { list: [{ id: "ops", tools: { exec: policy } }] },
      });
      const superseded = (at: string) =>
        Object.keys(beside).map((key) => ({ path: `${at}.${key}`, reason: "exec-mode" }));
      expect(report.dropped).toEqual([
        ...superseded("tools.exec"),
        ...superseded("agents.list[0].tools.exec"),
      ]);
      expect(report.renamed).toEqual([
        ...renames("tools.exec", mode, policy),
        ...renames("agents.list[0].tools.exec", mode, policy),
      ]);
    },
  );

  it("leaves security and ask alone where no mode is set, as the agent inherits the root", () => {
    // OpenClaw layers the agent's security over the root's mode; Hanzo Bot reads
    // agent ?? root per field, so the agent runs full/off in both.
    const { config, report } = convert({
      tools: { exec: { mode: "deny" } },
      agents: { list: [{ id: "ops", tools: { exec: { security: "full" } } }, { id: "main" }] },
    });
    expect(config).toEqual({
      tools: { exec: { security: "deny", ask: "off" } },
      agents: { list: [{ id: "ops", tools: { exec: { security: "full" } } }, { id: "main" }] },
    });
    expect(report.dropped).toEqual([]);
    expect(report.renamed).toEqual(renames("tools.exec", "deny", { security: "deny", ask: "off" }));
  });

  it("reads the mode in an agents.entries agent under its agents.list place", () => {
    const { config, report } = convert({
      agents: { entries: { ops: { tools: { exec: { mode: "ask", security: "full" } } } } },
    });
    expect(config).toEqual({
      agents: {
        list: [{ id: "ops", tools: { exec: { security: "allowlist", ask: "on-miss" } } }],
      },
    });
    expect(report.dropped).toEqual([
      { path: "agents.list[0].tools.exec.security", reason: "exec-mode" },
    ]);
  });

  // OpenClaw does not load a config whose mode its enum rejects, so that install ran no exec.
  it.each([
    ["yolo", '"yolo"'],
    ["constructor", '"constructor"'],
    ["__proto__", '"__proto__"'],
    ["Full", '"Full"'],
    [" full", '" full"'],
    [1, "1"],
    [null, "null"],
  ])(
    "imports a mode OpenClaw's schema rejects (%o) as deny, whatever is beside it",
    (mode, shown) => {
      const { config, report } = convert({
        tools: { exec: { mode, security: "full", ask: "off" } },
        agents: { list: [{ id: "ops", tools: { exec: { mode } } }] },
      });
      expect(config).toEqual({
        tools: { exec: { security: "deny", ask: "off" } },
        agents: { list: [{ id: "ops", tools: { exec: { security: "deny", ask: "off" } } }] },
      });
      expect(report.dropped).toEqual([
        { path: "tools.exec.security", reason: "exec-mode" },
        { path: "tools.exec.ask", reason: "exec-mode" },
      ]);
      expect(report.renamed).toEqual([
        { from: `tools.exec.mode=${shown}`, to: 'tools.exec.security="deny"' },
        { from: `tools.exec.mode=${shown}`, to: 'tools.exec.ask="off"' },
        {
          from: `agents.list[0].tools.exec.mode=${shown}`,
          to: 'agents.list[0].tools.exec.security="deny"',
        },
        {
          from: `agents.list[0].tools.exec.mode=${shown}`,
          to: 'agents.list[0].tools.exec.ask="off"',
        },
      ]);
      expect(report.notes).toEqual([
        { path: "tools.exec.mode", reason: "exec-mode-unknown" },
        { path: "agents.list[0].tools.exec.mode", reason: "exec-mode-unknown" },
      ]);
    },
  );

  it("writes security then ask after the other exec settings, as the Go importer does", () => {
    const { config } = convert({
      tools: { exec: { ask: "always", mode: "ask", backgroundMs: 5000, security: "full" } },
    });
    expect(Object.keys((config.tools as { exec: object }).exec)).toEqual([
      "backgroundMs",
      "security",
      "ask",
    ]);
  });
});

describe("exec approvals", () => {
  function fold(source: Record<string, unknown>, ...docs: unknown[]) {
    return convertConfig({
      source,
      rewrite,
      home: HOME,
      approvals: docs.map((doc, index) => ({
        label: index === 0 ? "exec-approvals.json" : "state/openclaw.sqlite#exec_approvals_config",
        doc: parseApprovals(typeof doc === "string" ? doc : JSON.stringify(doc)),
      })),
    });
  }

  it("imports mode full under a policy whose defaults deny as deny", () => {
    const { config, report } = fold(
      { tools: { exec: { mode: "full" } } },
      { version: 1, defaults: { security: "deny" } },
    );
    expect(config).toEqual({ tools: { exec: { security: "deny", ask: "off" } } });
    expect(report.approvals).toEqual({
      tightened: [
        { from: "exec-approvals.json#defaults.security", to: 'tools.exec.security="deny"' },
      ],
      closed: [],
    });
  });

  it("tightens only the agent the policy names, by its normalized id", () => {
    const { config, report } = fold(
      {
        tools: { exec: { security: "full", ask: "off" } },
        agents: { list: [{ id: "main" }, { id: "Ops" }] },
      },
      { version: 1, agents: { ops: { security: "allowlist" } } },
    );
    expect(config).toEqual({
      tools: { exec: { security: "full", ask: "off" } },
      agents: {
        list: [{ id: "main" }, { id: "Ops", tools: { exec: { security: "allowlist" } } }],
      },
    });
    expect(report.approvals.tightened).toEqual([
      {
        from: "exec-approvals.json#agents.ops.security",
        to: 'agents.list[1].tools.exec.security="allowlist"',
      },
    ]);
  });

  it("changes nothing where the policy is looser than the config", () => {
    const source = {
      tools: { exec: { security: "allowlist", ask: "always" } },
      agents: { list: [{ id: "ops", tools: { exec: { security: "deny" } } }] },
    };
    const { config, report } = fold(source, {
      version: 1,
      defaults: { security: "full", ask: "on-miss" },
      agents: { ops: { security: "allowlist", ask: "off" }, "*": { security: "full" } },
    });
    expect(config).toEqual(source);
    expect(report.approvals).toEqual({ tightened: [], closed: [] });
  });

  it("writes nothing for a policy that sets nothing", () => {
    const { config, report } = fold(
      { agents: { list: [{ id: "main" }] } },
      { version: 1, defaults: {}, agents: { main: { allowlist: ["/usr/bin/git"] } } },
    );
    expect(config).toEqual({ agents: { list: [{ id: "main" }] } });
    expect(report.approvals.tightened).toEqual([]);
  });

  it("creates tools.exec where the policy tightens a scope that has none", () => {
    const { config, report } = fold({}, { version: 1, defaults: { ask: "always" } });
    expect(config).toEqual({ tools: { exec: { ask: "always" } } });
    expect(report.approvals.tightened).toEqual([
      { from: "exec-approvals.json#defaults.ask", to: 'tools.exec.ask="always"' },
    ]);
  });

  it("reads main's policy, legacy default entry included, for the root when there is no agents.list", () => {
    const { config, report } = fold(
      { tools: { exec: { security: "full" } } },
      {
        version: 1,
        agents: { default: { security: "allowlist" }, "*": { security: "deny", ask: "on-miss" } },
      },
    );
    expect(config).toEqual({ tools: { exec: { security: "allowlist", ask: "on-miss" } } });
    expect(report.approvals.tightened.map((entry) => entry.from)).toEqual([
      "exec-approvals.json#agents.default.security",
      "exec-approvals.json#agents.*.ask",
    ]);
  });

  it("gives the root the * entry when there is a list, and each agent its own entry over it", () => {
    const { config } = fold(
      { agents: { list: [{ id: "ops" }, { id: "dev" }, { id: "default" }] } },
      {
        version: 1,
        defaults: { security: "full" },
        agents: {
          "*": { security: "allowlist" },
          dev: { security: "deny" },
          // OpenClaw moves this entry into main's; the agent named "default" never reads it.
          default: { security: "deny" },
        },
      },
    );
    expect(config).toEqual({
      tools: { exec: { security: "allowlist" } },
      agents: {
        list: [
          { id: "ops" },
          { id: "dev", tools: { exec: { security: "deny" } } },
          { id: "default" },
        ],
      },
    });
  });

  it("never loosens an agent below the root the policy tightened", () => {
    // OpenClaw ran main with full here; the import keeps main at the root's deny, never above it.
    const { config } = fold(
      { agents: { list: [{ id: "main" }, { id: "ops" }] } },
      { version: 1, defaults: { security: "deny" }, agents: { main: { security: "full" } } },
    );
    expect(config).toEqual({
      tools: { exec: { security: "deny" } },
      agents: { list: [{ id: "main" }, { id: "ops" }] },
    });
  });

  it("folds each policy in turn, never loosening what an earlier one tightened", () => {
    const { config, report } = fold(
      {},
      { version: 1, defaults: { security: "allowlist" } },
      { version: 1, defaults: { security: "full", ask: "always" } },
    );
    expect(config).toEqual({ tools: { exec: { security: "allowlist", ask: "always" } } });
    expect(report.approvals.tightened.map((entry) => entry.from)).toEqual([
      "exec-approvals.json#defaults.security",
      "state/openclaw.sqlite#exec_approvals_config/defaults.ask",
    ]);
  });

  it.each([
    ["text that is not JSON", "{"],
    ["another version", { version: 2 }],
    ["a security OpenClaw does not have", { version: 1, defaults: { security: "Deny" } }],
    ["a null ask", { version: 1, agents: { ops: { ask: null } } }],
    ["a __proto__ agent", '{"version":1,"agents":{"__proto__":{}}}'],
    ["a blank allowlist entry", { version: 1, agents: { main: { allowlist: [" "] } } }],
    [
      "an MCP grant OpenClaw did not make",
      { version: 1, agents: { main: { mcpTools: [{ server: "s", tool: "t", addedAt: 1 }] } } },
    ],
    ["a socket path that is not text", { version: 1, socket: { path: 1 } }],
  ])("denies exec where OpenClaw could not use the policy: %s", (_what, doc) => {
    const { config, report } = fold(
      { tools: { exec: { security: "full", ask: "off" } }, agents: { list: [{ id: "ops" }] } },
      doc,
    );
    expect(config).toEqual({
      tools: { exec: { security: "deny", ask: "off" } },
      agents: { list: [{ id: "ops" }] },
    });
    expect(report.approvals).toEqual({
      tightened: [{ from: "exec-approvals.json", to: 'tools.exec.security="deny"' }],
      closed: ["exec-approvals.json"],
    });
  });

  it("reads a policy OpenClaw accepts, whatever else it holds", () => {
    expect(
      parseApprovals(
        JSON.stringify({
          version: 1,
          socket: { path: "~/.openclaw/exec-approvals.sock", token: "t" },
          defaults: { security: "allowlist", ask: "on-miss", askFallback: "deny" },
          agents: {
            main: {
              autoAllowSkills: true,
              allowlist: ["git", { pattern: "/bin/ls", lastUsedAt: 5, source: "manual" }],
              mcpTools: [{ server: "s", tool: "t", source: "allow-always", addedAt: 0 }],
              extra: 1,
            },
          },
          extra: true,
        }),
      ),
    ).not.toBeNull();
  });

  it("counts a leftover exec-approvals.json as closed where the database keeps the policy", () => {
    const valid = JSON.stringify({ version: 1 });
    const empty = { file: null, claim: false, table: false, row: null };
    expect(approvalSources({ ...empty, file: valid })).toEqual([
      { label: "exec-approvals.json", doc: { version: 1 } },
    ]);
    expect(approvalSources({ ...empty, file: valid, table: true, row: valid })).toEqual([
      { label: "exec-approvals.json", doc: null },
      { label: "state/openclaw.sqlite#exec_approvals_config", doc: { version: 1 } },
    ]);
    expect(approvalSources({ ...empty, claim: true, table: true })).toEqual([
      { label: "exec-approvals.json", doc: null },
    ]);
    expect(approvalSources({ ...empty, table: true })).toEqual([]);
  });
});

describe("records", () => {
  it("carries a user's cron job and refuses what Hanzo Bot cannot run", () => {
    const job = {
      id: "j",
      name: "brief",
      enabled: true,
      createdAtMs: 5,
      schedule: { kind: "every", everyMs: 60_000, anchorMs: 1, jitter: 3 },
      sessionTarget: "main",
      wakeMode: "later",
      payload: { kind: "systemEvent", text: "wake", extra: 1 },
      state: { lastRunAtMs: 9 },
      scheduledToolPolicy: { version: 1 },
    };
    expect(convertCronJob(job)).toEqual({
      ok: true,
      job: {
        id: "j",
        name: "brief",
        enabled: true,
        createdAtMs: 5,
        updatedAtMs: 5,
        schedule: { kind: "every", everyMs: 60_000, anchorMs: 1 },
        sessionTarget: "main",
        wakeMode: "now",
        payload: { kind: "systemEvent", text: "wake" },
        state: {},
      },
    });
    expect(convertCronJob({ ...job, declarationKey: "heartbeat:main" })).toMatchObject({
      ok: false,
      reason: "managed",
    });
    expect(convertCronJob({ ...job, payload: { kind: "heartbeat" } })).toMatchObject({
      ok: false,
      reason: "payload",
    });
    expect(convertCronJob({ ...job, sessionTarget: "project" })).toMatchObject({
      ok: false,
      reason: "target",
    });
    expect(convertCronJob({ ...job, schedule: { kind: "rrule" } })).toMatchObject({
      ok: false,
      reason: "schedule",
    });
  });

  it("merges auth profiles without replacing ones Hanzo Bot already has", () => {
    const merged = mergeAuth(
      { version: 1, profiles: { "a:1": { key: "mine" } }, order: { a: ["a:1"] } },
      {
        version: 1,
        profiles: { "a:1": { key: "theirs" }, "b:1": { key: "b" } },
        order: { a: ["a:2"], b: ["b:1"] },
      },
    );
    expect(merged.added).toEqual(["b:1"]);
    expect(merged.file).toEqual({
      version: 1,
      profiles: { "a:1": { key: "mine" }, "b:1": { key: "b" } },
      order: { a: ["a:1"], b: ["b:1"] },
    });
  });

  it("names an earlier transcript the way Hanzo Bot archives a reset", () => {
    expect(resetArchiveName("s1", Date.UTC(2026, 0, 2, 3, 4, 5))).toBe(
      "s1.jsonl.reset.2026-01-02T03-04-05.000Z",
    );
  });
});
