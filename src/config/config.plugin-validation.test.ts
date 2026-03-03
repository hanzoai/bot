import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clearPluginManifestRegistryCache } from "../plugins/manifest-registry.js";
import { validateConfigObjectWithPlugins } from "./config.js";

async function writePluginFixture(params: {
  dir: string;
  id: string;
  schema: Record<string, unknown>;
  channels?: string[];
}) {
  await fs.mkdir(params.dir, { recursive: true });
  await fs.writeFile(
    path.join(params.dir, "index.js"),
    `export default { id: "${params.id}", register() {} };`,
    "utf-8",
  );
  const manifest: Record<string, unknown> = {
    id: params.id,
    configSchema: params.schema,
  };
  if (params.channels) {
    manifest.channels = params.channels;
  }
  await fs.writeFile(
    path.join(params.dir, "bot.plugin.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );
}

describe("config plugin validation", () => {
  const fixtureRoot = path.join(os.tmpdir(), "bot-config-plugin-validation");
  let caseIndex = 0;

  function createCaseHome() {
    const home = path.join(fixtureRoot, `case-${caseIndex++}`);
    return fs.mkdir(home, { recursive: true }).then(() => home);
  }

  const validateInHome = (home: string, raw: unknown) => {
    process.env.BOT_STATE_DIR = path.join(home, ".bot");
    return validateConfigObjectWithPlugins(raw);
  };

  const validateInSuite = (raw: unknown) => validateConfigObjectWithPlugins(raw);

  beforeAll(async () => {
    fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bot-config-plugin-validation-"));
    suiteHome = path.join(fixtureRoot, "home");
    await fs.mkdir(suiteHome, { recursive: true });
    badPluginDir = path.join(suiteHome, "bad-plugin");
    enumPluginDir = path.join(suiteHome, "enum-plugin");
    bluebubblesPluginDir = path.join(suiteHome, "bluebubbles-plugin");
    await writePluginFixture({
      dir: badPluginDir,
      id: "bad-plugin",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          value: { type: "boolean" },
        },
        required: ["value"],
      },
    });
    await writePluginFixture({
      dir: enumPluginDir,
      id: "enum-plugin",
      schema: {
        type: "object",
        properties: {
          fileFormat: {
            type: "string",
            enum: ["markdown", "html"],
          },
        },
        required: ["fileFormat"],
      },
    });
    await writePluginFixture({
      dir: bluebubblesPluginDir,
      id: "bluebubbles-plugin",
      channels: ["bluebubbles"],
      schema: { type: "object" },
    });
    process.env.BOT_STATE_DIR = path.join(suiteHome, ".bot");
    process.env.BOT_PLUGIN_MANIFEST_CACHE_MS = "10000";
    clearPluginManifestRegistryCache();
    // Warm the plugin manifest cache once so path-based validations can reuse
    // parsed manifests across test cases.
    validateInSuite({
      plugins: {
        enabled: false,
        load: { paths: [badPluginDir, bluebubblesPluginDir] },
      },
    });
  });

  afterAll(async () => {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
    clearPluginManifestRegistryCache();
    if (envSnapshot.BOT_STATE_DIR === undefined) {
      delete process.env.BOT_STATE_DIR;
    } else {
      process.env.BOT_STATE_DIR = envSnapshot.BOT_STATE_DIR;
    }
    if (envSnapshot.BOT_PLUGIN_MANIFEST_CACHE_MS === undefined) {
      delete process.env.BOT_PLUGIN_MANIFEST_CACHE_MS;
    } else {
      process.env.BOT_PLUGIN_MANIFEST_CACHE_MS = envSnapshot.BOT_PLUGIN_MANIFEST_CACHE_MS;
    }
  });

  it("rejects missing plugin ids in entries", async () => {
    const home = await createCaseHome();
    const res = validateInHome(home, {
      agents: { list: [{ id: "pi" }] },
      plugins: {
        enabled: false,
        load: { paths: [missingPath] },
        entries: { "missing-plugin": { enabled: true } },
        allow: ["missing-allow"],
        deny: ["missing-deny"],
        slots: { memory: "missing-slot" },
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues).toContainEqual({
        path: "plugins.entries.missing-plugin",
        message: "plugin not found: missing-plugin",
      });
    }
  });

  it("rejects missing plugin ids in allow/deny/slots", async () => {
    const home = await createCaseHome();
    const res = validateInHome(home, {
      agents: { list: [{ id: "pi" }] },
      plugins: {
        enabled: false,
        allow: ["missing-allow"],
        deny: ["missing-deny"],
        slots: { memory: "missing-slot" },
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues).toEqual(
        expect.arrayContaining([
          { path: "plugins.allow", message: "plugin not found: missing-allow" },
          { path: "plugins.deny", message: "plugin not found: missing-deny" },
          { path: "plugins.slots.memory", message: "plugin not found: missing-slot" },
        ]),
      );
    }
  });

  it("surfaces plugin config diagnostics", async () => {
    const res = validateInSuite({
      agents: { list: [{ id: "pi" }] },
      plugins: {
        enabled: true,
        load: { paths: [badPluginDir] },
        entries: { "bad-plugin": { config: { value: "nope" } } },
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const hasIssue = res.issues.some(
        (issue) =>
          issue.path.startsWith("plugins.entries.bad-plugin.config") &&
          issue.message.includes("invalid config"),
      );
      expect(hasIssue).toBe(true);
    }
  });

  it("surfaces allowed enum values for plugin config diagnostics", async () => {
    const res = validateInSuite({
      agents: { list: [{ id: "pi" }] },
      plugins: {
        enabled: true,
        load: { paths: [enumPluginDir] },
        entries: { "enum-plugin": { config: { fileFormat: "txt" } } },
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const issue = res.issues.find(
        (entry) => entry.path === "plugins.entries.enum-plugin.config.fileFormat",
      );
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('allowed: "markdown", "html"');
      expect(issue?.allowedValues).toEqual(["markdown", "html"]);
      expect(issue?.allowedValuesHiddenCount).toBe(0);
    }
  });

  it("accepts plugin heartbeat targets", async () => {
    const res = validateInSuite({
      agents: { defaults: { heartbeat: { target: "bluebubbles" } }, list: [{ id: "pi" }] },
      plugins: { enabled: false, load: { paths: [bluebubblesPluginDir] } },
    });
    expect(res.ok).toBe(true);
  });

  it("rejects unknown heartbeat targets", async () => {
    const res = validateInSuite({
      agents: {
        defaults: { heartbeat: { target: "not-a-channel" } },
        list: [{ id: "pi" }],
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues).toContainEqual({
        path: "agents.defaults.heartbeat.target",
        message: "unknown heartbeat target: not-a-channel",
      });
    }
  });
});
