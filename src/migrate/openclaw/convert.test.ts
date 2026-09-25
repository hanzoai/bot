import { describe, expect, it } from "vitest";
import { convertConfig, listEnvRefs, mergeBeneath, rewriteEnvRefs } from "./config.js";
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

  it("merges beneath an existing config without replacing what it sets", () => {
    const existing = { gateway: { port: 1, auth: { mode: "token" } }, list: [1] };
    const added = mergeBeneath(existing, {
      gateway: { port: 2, bind: "loopback", auth: { token: "t" } },
      list: [2],
      tools: {},
    });
    expect(existing).toEqual({
      gateway: { port: 1, bind: "loopback", auth: { mode: "token", token: "t" } },
      list: [1],
      tools: {},
    });
    expect(added).toEqual(["gateway.bind", "gateway.auth.token", "tools"]);
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
