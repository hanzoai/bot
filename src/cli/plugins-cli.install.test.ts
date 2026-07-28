// Plugins CLI install tests cover plugin install command selection and output.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installedPluginRoot } from "bot/plugin-sdk/test-fixtures";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BotConfig } from "../config/config.js";
import { hashConfigIncludeRaw } from "../config/includes.js";
import {
  listOfficialExternalPluginCatalogEntries,
  resolveOfficialExternalPluginId,
  resolveOfficialExternalPluginInstall,
} from "../plugins/official-external-plugin-catalog.js";
import {
  applyExclusiveSlotSelection,
  buildPluginSnapshotReport,
  clearPluginRegistryLoadCache,
  enablePluginInConfig,
  findBundledPluginSourceMock,
  installHooksFromNpmSpec,
  installHooksFromPath,
  installPluginFromNpmPackArchive,
  installPluginFromClawHub,
  installPluginFromGitSpec,
  installPluginFromMarketplace,
  installPluginFromNpmSpec,
  installPluginFromPath,
  loadConfig,
  loadPluginManifestRegistry,
  readConfigFileSnapshot,
  readConfigFileSnapshotForWrite,
  parseClawHubPluginSpec,
  promptYesNo,
  reportClawHubPluginInstallTelemetry,
  recordHookInstall,
  recordPluginInstall,
  resetPluginsCliTestState,
  replaceConfigFile,
  runPluginsCommand,
  runtimeErrors,
  runtimeLogs,
  writeConfigFile,
  writePersistedInstalledPluginIndexInstallRecords,
} from "./plugins-cli-test-helpers.js";

const CLI_STATE_ROOT = "/tmp/bot-state";
const ORIGINAL_BOT_STATE_DIR = process.env.BOT_STATE_DIR;
const ORIGINAL_BOT_NIX_MODE = process.env.BOT_NIX_MODE;
const ORIGINAL_STDIN_TTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
const ORIGINAL_STDOUT_TTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
const PROFILE_STATE_ROOT = "/tmp/bot-ledger-profile";

const OFFICIAL_EXTERNAL_NPM_INSTALLS_WITHOUT_INTEGRITY = listOfficialExternalPluginCatalogEntries()
  .map((entry) => {
    const pluginId = resolveOfficialExternalPluginId(entry);
    const install = resolveOfficialExternalPluginInstall(entry);
    const npmSpec = install?.npmSpec?.trim();
    if (!pluginId || !npmSpec || install?.expectedIntegrity) {
      return null;
    }
    return { pluginId, npmSpec };
  })
  .filter((entry): entry is { pluginId: string; npmSpec: string } => Boolean(entry))
  .toSorted((left, right) => left.pluginId.localeCompare(right.pluginId));

function cliInstallPath(pluginId: string): string {
  return installedPluginRoot(CLI_STATE_ROOT, pluginId);
}

function useProfileExtensionsDir(): string {
  process.env.BOT_STATE_DIR = PROFILE_STATE_ROOT;
  return path.resolve(PROFILE_STATE_ROOT, "extensions");
}

function createEnabledPluginConfig(pluginId: string): BotConfig {
  return {
    plugins: {
      entries: {
        [pluginId]: {
          enabled: true,
        },
      },
    },
  } as BotConfig;
}

function createEmptyPluginConfig(): BotConfig {
  return {
    plugins: {
      entries: {},
    },
  } as BotConfig;
}

function createClawHubInstallResult(params: {
  pluginId: string;
  packageName: string;
  version: string;
  channel: string;
  trust?: {
    disposition: "clean" | "review-recommended" | "review-required";
    scanStatus?: string;
    moderationState?: string;
    reasons?: string[];
    pending?: boolean;
    stale?: boolean;
    checkedAt?: string;
    acknowledgedAt?: string;
  };
}): Awaited<ReturnType<typeof installPluginFromClawHub>> {
  return {
    ok: true,
    pluginId: params.pluginId,
    targetDir: cliInstallPath(params.pluginId),
    version: params.version,
    packageName: params.packageName,
    clawhub: {
      source: "clawhub",
      clawhubUrl: "https://clawhub.ai",
      clawhubPackage: params.packageName,
      clawhubFamily: "code-plugin",
      clawhubChannel: params.channel,
      version: params.version,
      integrity: "sha256-abc",
      resolvedAt: "2026-03-22T00:00:00.000Z",
      clawpackSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      clawpackSpecVersion: 1,
      clawpackManifestSha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      clawpackSize: 4096,
      ...(params.trust
        ? {
            clawhubTrustDisposition: params.trust.disposition,
            ...(params.trust.scanStatus ? { clawhubTrustScanStatus: params.trust.scanStatus } : {}),
            ...(params.trust.moderationState
              ? { clawhubTrustModerationState: params.trust.moderationState }
              : {}),
            ...(params.trust.reasons ? { clawhubTrustReasons: params.trust.reasons } : {}),
            ...(params.trust.pending ? { clawhubTrustPending: true } : {}),
            ...(params.trust.stale ? { clawhubTrustStale: true } : {}),
            ...(params.trust.checkedAt ? { clawhubTrustCheckedAt: params.trust.checkedAt } : {}),
            ...(params.trust.acknowledgedAt
              ? { clawhubTrustAcknowledgedAt: params.trust.acknowledgedAt }
              : {}),
          }
        : {}),
    },
  };
}

function createNpmPluginInstallResult(
  pluginId = "demo",
): Awaited<ReturnType<typeof installPluginFromNpmSpec>> {
  return {
    ok: true,
    pluginId,
    targetDir: cliInstallPath(pluginId),
    version: "1.2.3",
    npmResolution: {
      packageName: pluginId,
      resolvedVersion: "1.2.3",
      tarballUrl: `https://registry.npmjs.org/${pluginId}/-/${pluginId}-1.2.3.tgz`,
    },
  };
}

function createNpmPackPluginInstallResult(
  pluginId = "demo",
): Awaited<ReturnType<typeof installPluginFromNpmPackArchive>> {
  return {
    ok: true,
    pluginId,
    targetDir: cliInstallPath(pluginId),
    version: "1.2.3",
    extensions: ["dist/index.js"],
    manifestName: `@hanzo/bot-${pluginId}`,
    npmTarballName: `bot-${pluginId}-1.2.3.tgz`,
    npmResolution: {
      name: `@hanzo/bot-${pluginId}`,
      version: "1.2.3",
      resolvedSpec: `@hanzo/bot-${pluginId}@1.2.3`,
      integrity: "sha512-pack-demo",
      shasum: "packdemosha",
      resolvedAt: "2026-05-06T00:00:00.000Z",
    },
  };
}

function createGitPluginInstallResult(
  pluginId = "demo",
): Awaited<ReturnType<typeof installPluginFromGitSpec>> {
  return {
    ok: true,
    pluginId,
    targetDir: cliInstallPath(pluginId),
    version: "1.2.3",
    extensions: ["index.js"],
    git: {
      url: "https://github.com/acme/demo.git",
      ref: "v1.2.3",
      commit: "abc123",
      resolvedAt: "2026-04-30T00:00:00.000Z",
    },
  };
}

function mockClawHubPackageNotFound(packageName: string) {
  installPluginFromClawHub.mockResolvedValue({
    ok: false,
    error: `ClawHub /api/v1/packages/${packageName} failed (404): Package not found`,
    code: "package_not_found",
  });
}

function primeNpmPluginFallback(pluginId = "demo") {
  const cfg = createEmptyPluginConfig();
  const enabledCfg = createEnabledPluginConfig(pluginId);

  loadConfig.mockReturnValue(cfg);
  mockClawHubPackageNotFound(pluginId);
  installPluginFromNpmSpec.mockResolvedValue(createNpmPluginInstallResult(pluginId));
  enablePluginInConfig.mockReturnValue({ config: enabledCfg });
  recordPluginInstall.mockReturnValue(enabledCfg);
  applyExclusiveSlotSelection.mockReturnValue({
    config: enabledCfg,
    warnings: [],
  });

  return { cfg, enabledCfg };
}

function primeSuccessfulPluginPersistence(pluginId = "demo") {
  const cfg = createEmptyPluginConfig();
  const enabledCfg = createEnabledPluginConfig(pluginId);

  loadConfig.mockReturnValue(cfg);
  enablePluginInConfig.mockReturnValue({ config: enabledCfg });
  recordPluginInstall.mockReturnValue(enabledCfg);
  applyExclusiveSlotSelection.mockReturnValue({
    config: enabledCfg,
    warnings: [],
  });

  return { cfg, enabledCfg };
}

function createPathHookPackInstalledConfig(tmpRoot: string): BotConfig {
  return {
    hooks: {
      internal: {
        installs: {
          "demo-hooks": {
            source: "path",
            sourcePath: tmpRoot,
            installPath: tmpRoot,
          },
        },
      },
    },
  } as BotConfig;
}

function createNpmHookPackInstalledConfig(): BotConfig {
  return {
    hooks: {
      internal: {
        installs: {
          "demo-hooks": {
            source: "npm",
            spec: "@acme/demo-hooks@1.2.3",
          },
        },
      },
    },
  } as BotConfig;
}

function createHookPackInstallResult(targetDir: string): {
  ok: true;
  hookPackId: string;
  hooks: string[];
  packageKind: "hook-only";
  targetDir: string;
  version: string;
} {
  return {
    ok: true,
    hookPackId: "demo-hooks",
    hooks: ["command-audit"],
    packageKind: "hook-only",
    targetDir,
    version: "1.2.3",
  };
}

function primeHookPackNpmFallback() {
  const cfg = {} as BotConfig;
  const installedCfg = createNpmHookPackInstalledConfig();

  loadConfig.mockReturnValue(cfg);
  mockClawHubPackageNotFound("@acme/demo-hooks");
  installPluginFromNpmSpec.mockResolvedValue({
    ok: false,
    error: "package.json missing bot.plugin.json",
  });
  installHooksFromNpmSpec.mockResolvedValue({
    ...createHookPackInstallResult("/tmp/hooks/demo-hooks"),
    npmResolution: {
      name: "@acme/demo-hooks",
      version: "1.2.3",
      resolvedSpec: "@acme/demo-hooks@1.2.3",
      integrity: "sha256-demo",
    },
  });
  recordHookInstall.mockReturnValue(installedCfg);

  return { cfg, installedCfg };
}

function primeHookPackPathFallback(params: {
  tmpRoot: string;
  pluginInstallError: string;
}): BotConfig {
  const installedCfg = createPathHookPackInstalledConfig(params.tmpRoot);

  loadConfig.mockReturnValue({} as BotConfig);
  installPluginFromPath.mockResolvedValueOnce({
    ok: false,
    error: params.pluginInstallError,
  });
  installHooksFromPath.mockResolvedValueOnce(createHookPackInstallResult(params.tmpRoot));
  recordHookInstall.mockReturnValue(installedCfg);

  return installedCfg;
}

type MockWithCalls = {
  mock: {
    calls: readonly (readonly unknown[])[];
  };
};

type PluginInstallCall = {
  allowSourceTypeScriptEntries?: boolean;
  archivePath?: string;
  dangerouslyForceUnsafeInstall?: boolean;
  dryRun?: boolean;
  expectedIntegrity?: string;
  expectedPackageKind?: "hook-only";
  expectedPluginId?: string;
  extensionsDir?: string;
  inspection?: "package-kind";
  logger?: {
    info?: unknown;
    warn?: unknown;
  };
  marketplace?: string;
  mode?: string;
  path?: string;
  plugin?: string;
  spec?: string;
  trustedSourceLinkedOfficialInstall?: boolean;
};

type PersistedInstallRecord = Record<string, unknown>;

function mockCallArg(mock: MockWithCalls, callIndex = 0, argIndex = 0): unknown {
  const call = mock.mock.calls[callIndex];
  if (!call) {
    throw new Error(`Expected mock call ${callIndex}`);
  }
  if (call.length <= argIndex) {
    throw new Error(`Expected mock call ${callIndex} argument ${argIndex}`);
  }
  return call[argIndex];
}

function marketplaceInstallCall(callIndex = 0): PluginInstallCall {
  return mockCallArg(installPluginFromMarketplace, callIndex) as PluginInstallCall;
}

function clawHubInstallCall(callIndex = 0): PluginInstallCall {
  return mockCallArg(installPluginFromClawHub, callIndex) as PluginInstallCall;
}

function npmInstallCall(callIndex = 0): PluginInstallCall {
  return mockCallArg(installPluginFromNpmSpec, callIndex) as PluginInstallCall;
}

function npmPackInstallCall(callIndex = 0): PluginInstallCall {
  return mockCallArg(installPluginFromNpmPackArchive, callIndex) as PluginInstallCall;
}

function gitInstallCall(callIndex = 0): PluginInstallCall {
  return mockCallArg(installPluginFromGitSpec, callIndex) as PluginInstallCall;
}

function pathInstallCall(callIndex = 0): PluginInstallCall {
  return mockCallArg(installPluginFromPath, callIndex) as PluginInstallCall;
}

function hookPathInstallCall(callIndex = 0): PluginInstallCall {
  return mockCallArg(installHooksFromPath, callIndex) as PluginInstallCall;
}

function hookNpmInstallCall(callIndex = 0): PluginInstallCall {
  return mockCallArg(installHooksFromNpmSpec, callIndex) as PluginInstallCall;
}

function persistedInstallRecords(callIndex = 0): Record<string, PersistedInstallRecord> {
  return mockCallArg(writePersistedInstalledPluginIndexInstallRecords, callIndex) as Record<
    string,
    PersistedInstallRecord
  >;
}

function persistedInstallRecord(pluginId: string, callIndex = 0): PersistedInstallRecord {
  const record = persistedInstallRecords(callIndex)[pluginId];
  if (!record) {
    throw new Error(`Expected persisted install record for ${pluginId}`);
  }
  return record;
}

function replaceConfigCall(callIndex = 0): { baseHash?: string; nextConfig?: BotConfig } {
  return mockCallArg(replaceConfigFile, callIndex) as {
    baseHash?: string;
    nextConfig?: BotConfig;
  };
}

function recordHookInstallCall(callIndex = 0): PersistedInstallRecord {
  return mockCallArg(recordHookInstall, callIndex, 1) as PersistedInstallRecord;
}

function runtimeLogsContain(fragment: string): boolean {
  return runtimeLogs.some((line) => line.includes(fragment));
}

function setTty(value: boolean): void {
  Object.defineProperty(process.stdin, "isTTY", {
    value,
    configurable: true,
  });
  Object.defineProperty(process.stdout, "isTTY", {
    value,
    configurable: true,
  });
}

function restoreTty(): void {
  if (ORIGINAL_STDIN_TTY) {
    Object.defineProperty(process.stdin, "isTTY", ORIGINAL_STDIN_TTY);
  } else {
    Reflect.deleteProperty(process.stdin, "isTTY");
  }
  if (ORIGINAL_STDOUT_TTY) {
    Object.defineProperty(process.stdout, "isTTY", ORIGINAL_STDOUT_TTY);
  } else {
    Reflect.deleteProperty(process.stdout, "isTTY");
  }
}

const NON_CLAWHUB_INSTALL_FORCE_FLAG = "--force";

function withNonClawHubInstallAcknowledgement(args: string[]): string[] {
  if (args.includes(NON_CLAWHUB_INSTALL_FORCE_FLAG)) {
    return args;
  }
  return [...args, NON_CLAWHUB_INSTALL_FORCE_FLAG];
}

async function runAcknowledgedPluginsInstallCommand(args: string[]): Promise<void> {
  await runPluginsCommand(withNonClawHubInstallAcknowledgement(args));
}

function primeBlockedPluginConfigMutation(
  params: { blockHooks?: boolean; config?: BotConfig } = {},
): void {
  const configPath = path.join(process.cwd(), "bot.json5");
  const externalPluginsPath = path.join(
    path.parse(process.cwd()).root,
    "external-bot",
    "plugins.json5",
  );
  const externalHooksPath = path.join(
    path.parse(process.cwd()).root,
    "external-bot",
    "hooks.json5",
  );
  const config = params.config ?? ({} as BotConfig);
  const parsed = {
    plugins: { $include: externalPluginsPath },
    ...(params.blockHooks ? { hooks: { $include: externalHooksPath } } : {}),
  };
  loadConfig.mockReturnValue(config);
  readConfigFileSnapshotForWrite.mockResolvedValue({
    snapshot: {
      path: configPath,
      exists: true,
      raw: JSON.stringify(parsed),
      parsed,
      resolved: config,
      sourceConfig: config,
      runtimeConfig: config,
      valid: true,
      config,
      hash: "blocked-plugin-config",
      issues: [],
      warnings: [],
      legacyIssues: [],
    },
    writeOptions: {
      assertConfigPathForWrite: () => {},
      expectedConfigPath: configPath,
      ownedConfigPathForWrite: configPath,
      includeFileTargetsForWrite: {
        [externalPluginsPath]: externalPluginsPath,
        ...(params.blockHooks ? { [externalHooksPath]: externalHooksPath } : {}),
      },
    },
  });
}

function primeNestedPluginConfigMutation(tempRoot: string): void {
  const configPath = path.join(tempRoot, "bot.json5");
  const pluginsPath = path.join(tempRoot, "plugins.json5");
  const pluginsRaw = `${JSON.stringify({ entries: { $include: "./entries.json5" } }, null, 2)}\n`;
  const config = { plugins: { entries: {} } } as BotConfig;
  fs.writeFileSync(pluginsPath, pluginsRaw);
  loadConfig.mockReturnValue(config);
  readConfigFileSnapshotForWrite.mockResolvedValue({
    snapshot: {
      path: configPath,
      exists: true,
      raw: JSON.stringify({ plugins: { $include: "./plugins.json5" } }),
      parsed: { plugins: { $include: "./plugins.json5" } },
      resolved: config,
      sourceConfig: config,
      runtimeConfig: config,
      valid: true,
      config,
      hash: "nested-plugin-config",
      issues: [],
      warnings: [],
      legacyIssues: [],
    },
    writeOptions: {
      assertConfigPathForWrite: () => {},
      expectedConfigPath: configPath,
      ownedConfigPathForWrite: configPath,
      includeFileHashesForWrite: {
        [pluginsPath]: hashConfigIncludeRaw(pluginsRaw),
      },
      includeFileTargetsForWrite: {
        [pluginsPath]: fs.realpathSync(pluginsPath),
      },
    },
  });
}

function primeBlockedRootConfigMutation(config = {} as BotConfig): void {
  const configPath = path.join(process.cwd(), "bot.json5");
  loadConfig.mockReturnValue(config);
  readConfigFileSnapshotForWrite.mockResolvedValue({
    snapshot: {
      path: configPath,
      exists: true,
      raw: JSON.stringify({ $include: "./shared.json5", plugins: {} }),
      parsed: { $include: "./shared.json5", plugins: {} },
      resolved: config,
      sourceConfig: config,
      runtimeConfig: config,
      valid: true,
      config,
      hash: "blocked-root-config",
      issues: [],
      warnings: [],
      legacyIssues: [],
    },
    writeOptions: {
      assertConfigPathForWrite: () => {},
      expectedConfigPath: configPath,
      ownedConfigPathForWrite: configPath,
    },
  });
}

function primeBlockedHookConfigMutation(config = {} as BotConfig): void {
  const configPath = path.join(process.cwd(), "bot.json5");
  const externalHooksPath = path.join(
    path.parse(process.cwd()).root,
    "external-bot",
    "hooks.json5",
  );
  const parsed = { hooks: { $include: externalHooksPath } };
  loadConfig.mockReturnValue(config);
  readConfigFileSnapshotForWrite.mockResolvedValue({
    snapshot: {
      path: configPath,
      exists: true,
      raw: JSON.stringify(parsed),
      parsed,
      resolved: config,
      sourceConfig: config,
      runtimeConfig: config,
      valid: true,
      config,
      hash: "blocked-hook-config",
      issues: [],
      warnings: [],
      legacyIssues: [],
    },
    writeOptions: {
      assertConfigPathForWrite: () => {},
      expectedConfigPath: configPath,
      ownedConfigPathForWrite: configPath,
      includeFileTargetsForWrite: {
        [externalHooksPath]: externalHooksPath,
      },
    },
  });
}

describe("plugins cli install", () => {
  beforeEach(() => {
    resetPluginsCliTestState();
  });

  afterEach(() => {
    if (ORIGINAL_BOT_STATE_DIR === undefined) {
      delete process.env.BOT_STATE_DIR;
    } else {
      process.env.BOT_STATE_DIR = ORIGINAL_BOT_STATE_DIR;
    }
    if (ORIGINAL_BOT_NIX_MODE === undefined) {
      delete process.env.BOT_NIX_MODE;
    } else {
      process.env.BOT_NIX_MODE = ORIGINAL_BOT_NIX_MODE;
    }
    restoreTty();
  });

  it("shows one force option for confirmation and overwrite", async () => {
    const { Command } = await import("commander");
    const { registerPluginsCli } = await import("./plugins-cli.js");
    const program = new Command();
    registerPluginsCli(program);

    const pluginsCommand = program.commands.find((command) => command.name() === "plugins");
    const installCommand = pluginsCommand?.commands.find((command) => command.name() === "install");
    const helpText = installCommand?.helpInformation() ?? "";

    expect(helpText.match(/--force/g)).toHaveLength(1);
    expect(helpText).toContain("Confirm non-ClawHub sources and overwrite");
    expect(helpText).toContain("an existing plugin or hook pack");
  });

  it("refuses plugin installs in Nix mode before installer side effects", async () => {
    process.env.BOT_NIX_MODE = "1";

    await expect(
      runAcknowledgedPluginsInstallCommand(["plugins", "install", "@acme/demo"]),
    ).rejects.toThrow("BOT_NIX_MODE=1");

    expect(installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(installPluginFromPath).not.toHaveBeenCalled();
    expect(installPluginFromMarketplace).not.toHaveBeenCalled();
    expect(writeConfigFile).not.toHaveBeenCalled();
  });

  it.each(["@acme/demo-plugin", "npm:@acme/demo-plugin"])(
    "fails closed before installing blocked ambiguous npm plugin spec %s",
    async (spec) => {
      primeBlockedPluginConfigMutation();
      installHooksFromNpmSpec.mockResolvedValue({
        ok: false,
        error: "package.json missing bot.hooks",
      });

      await expect(
        runAcknowledgedPluginsInstallCommand(["plugins", "install", spec]),
      ).rejects.toThrow("__exit__:1");

      expect(installHooksFromNpmSpec).toHaveBeenCalledTimes(1);
      expect(hookNpmInstallCall().inspection).toBe("package-kind");
      expect(installPluginFromNpmSpec).not.toHaveBeenCalled();
      expect(writeConfigFile).not.toHaveBeenCalled();
      expect(runtimeErrors.at(-1)).toContain(
        "Config plugins are stored in an external or unresolved top-level $include",
      );
    },
  );

  it("installs a positively identified npm hook pack without probing plugin installation", async () => {
    const installedCfg = {
      hooks: {
        internal: {
          installs: {
            "demo-hooks": {
              source: "npm",
              spec: "@acme/demo-hooks@1.2.3",
            },
          },
        },
      },
    } as BotConfig;
    primeBlockedPluginConfigMutation();
    installHooksFromNpmSpec.mockResolvedValue({
      ok: true,
      hookPackId: "demo-hooks",
      hooks: ["command-audit"],
      packageKind: "hook-only",
      targetDir: "/tmp/hooks/demo-hooks",
      version: "1.2.3",
      npmResolution: {
        name: "@acme/demo-hooks",
        version: "1.2.3",
        resolvedSpec: "@acme/demo-hooks@1.2.3",
        integrity: "sha256-demo",
      },
    });
    recordHookInstall.mockReturnValue(installedCfg);

    await runAcknowledgedPluginsInstallCommand(["plugins", "install", "@acme/demo-hooks"]);

    expect(installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(installHooksFromNpmSpec).toHaveBeenCalledTimes(2);
    expect(hookNpmInstallCall().inspection).toBe("package-kind");
    expect(hookNpmInstallCall(1).expectedIntegrity).toBe("sha256-demo");
    expect(hookNpmInstallCall(1).expectedPackageKind).toBe("hook-only");
    expect(writeConfigFile).toHaveBeenCalledWith(installedCfg);
  });

  it("blocks npm package inspection when plugin and hook config are include-owned", async () => {
    primeBlockedPluginConfigMutation({ blockHooks: true });
    installHooksFromNpmSpec.mockResolvedValue({
      ...createHookPackInstallResult("/tmp/hooks/demo-hooks"),
      npmResolution: {
        name: "@acme/demo-hooks",
        version: "1.2.3",
        resolvedSpec: "@acme/demo-hooks@1.2.3",
        integrity: "sha256-demo",
      },
    });

    await expect(
      runAcknowledgedPluginsInstallCommand(["plugins", "install", "@acme/demo-hooks"]),
    ).rejects.toThrow("__exit__:1");

    expect(installHooksFromNpmSpec).not.toHaveBeenCalled();
    expect(installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(writeConfigFile).not.toHaveBeenCalled();
    expect(runtimeErrors.at(-1)).toContain(
      "Config hooks are stored in an external or unresolved top-level $include",
    );
  });

  it("blocks a proven npm hook pack before plugin installer side effects when only hooks config is include-owned", async () => {
    primeBlockedHookConfigMutation();
    installHooksFromNpmSpec.mockResolvedValue({
      ...createHookPackInstallResult("/tmp/hooks/demo-hooks"),
      npmResolution: {
        name: "@acme/demo-hooks",
        version: "1.2.3",
        resolvedSpec: "@acme/demo-hooks@1.2.3",
        integrity: "sha256-demo",
      },
    });

    await expect(
      runAcknowledgedPluginsInstallCommand(["plugins", "install", "@acme/demo-hooks"]),
    ).rejects.toThrow("__exit__:1");

    expect(installHooksFromNpmSpec).toHaveBeenCalledTimes(1);
    expect(hookNpmInstallCall().inspection).toBe("package-kind");
    expect(installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(writeConfigFile).not.toHaveBeenCalled();
    expect(runtimeErrors.at(-1)).toContain(
      "Config hooks are stored in an external or unresolved top-level $include",
    );
  });

  it("blocks local package inspection when plugin and hook config are include-owned", async () => {
    const localPath = fs.mkdtempSync(path.join(os.tmpdir(), "bot-hook-pack-"));
    primeBlockedPluginConfigMutation({ blockHooks: true });
    installHooksFromPath.mockResolvedValue(createHookPackInstallResult(localPath));
    installPluginFromPath.mockResolvedValue({
      ok: false,
      error: "package.json missing bot.extensions",
      code: "missing_bot_extensions",
    });

    try {
      await expect(
        runAcknowledgedPluginsInstallCommand(["plugins", "install", localPath]),
      ).rejects.toThrow("__exit__:1");
    } finally {
      fs.rmSync(localPath, { recursive: true, force: true });
    }

    expect(installHooksFromPath).not.toHaveBeenCalled();
    expect(writeConfigFile).not.toHaveBeenCalled();
    expect(runtimeErrors.at(-1)).toContain(
      "Config hooks are stored in an external or unresolved top-level $include",
    );
  });

  it("blocks a proven local hook pack before plugin installer side effects when only hooks config is include-owned", async () => {
    const localPath = fs.mkdtempSync(path.join(os.tmpdir(), "bot-hook-pack-"));
    primeBlockedHookConfigMutation();
    installHooksFromPath.mockResolvedValue(createHookPackInstallResult(localPath));

    try {
      await expect(
        runAcknowledgedPluginsInstallCommand(["plugins", "install", localPath]),
      ).rejects.toThrow("__exit__:1");
    } finally {
      fs.rmSync(localPath, { recursive: true, force: true });
    }

    expect(installHooksFromPath).toHaveBeenCalledTimes(1);
    expect(hookPathInstallCall().inspection).toBe("package-kind");
    expect(installPluginFromPath).not.toHaveBeenCalled();
    expect(writeConfigFile).not.toHaveBeenCalled();
    expect(runtimeErrors.at(-1)).toContain(
      "Config hooks are stored in an external or unresolved top-level $include",
    );
  });

  it.skipIf(process.platform === "win32")(
    "preserves local hook-pack precedence for prefix-shaped paths",
    async () => {
      const localPath = path.join(process.cwd(), `clawhub:demo-hooks-${process.pid}`);
      const installedCfg = {
        hooks: {
          internal: {
            installs: {
              "demo-hooks": {
                source: "path",
                sourcePath: localPath,
              },
            },
          },
        },
      } as BotConfig;
      fs.mkdirSync(localPath);
      primeBlockedPluginConfigMutation();
      parseClawHubPluginSpec.mockReturnValue({ name: "demo-hooks" });
      installPluginFromPath.mockResolvedValue({
        ok: false,
        error: "package.json missing bot.extensions",
        code: "missing_bot_extensions",
      });
      installHooksFromPath.mockResolvedValue(createHookPackInstallResult(localPath));
      recordHookInstall.mockReturnValue(installedCfg);

      try {
        await runAcknowledgedPluginsInstallCommand([
          "plugins",
          "install",
          path.basename(localPath),
        ]);
      } finally {
        fs.rmSync(localPath, { recursive: true, force: true });
      }

      expect(installPluginFromPath).not.toHaveBeenCalled();
      expect(installHooksFromPath).toHaveBeenCalledTimes(2);
      expect(hookPathInstallCall().inspection).toBe("package-kind");
      expect(hookPathInstallCall(1).expectedPackageKind).toBe("hook-only");
      expect(installPluginFromClawHub).not.toHaveBeenCalled();
      expect(writeConfigFile).toHaveBeenCalledWith(installedCfg);
    },
  );

  it("fails closed for ambiguous npm plugins when the whole config is include-owned", async () => {
    primeBlockedRootConfigMutation();
    installHooksFromNpmSpec.mockResolvedValue({
      ok: false,
      error: "package.json missing bot.hooks",
    });

    await expect(
      runAcknowledgedPluginsInstallCommand(["plugins", "install", "@acme/demo-plugin"]),
    ).rejects.toThrow("__exit__:1");

    expect(installHooksFromNpmSpec).not.toHaveBeenCalled();
    expect(installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(writeConfigFile).not.toHaveBeenCalled();
    expect(runtimeErrors.at(-1)).toContain("unsupported $include shape at the root");
  });

  it("fails closed for ambiguous local plugins when the whole config is include-owned", async () => {
    const localPath = fs.mkdtempSync(path.join(os.tmpdir(), "bot-demo-plugin-"));
    primeBlockedRootConfigMutation();
    installHooksFromPath.mockResolvedValue({
      ok: false,
      error: "package.json missing bot.hooks",
    });

    try {
      await expect(
        runAcknowledgedPluginsInstallCommand(["plugins", "install", localPath]),
      ).rejects.toThrow("__exit__:1");
    } finally {
      fs.rmSync(localPath, { recursive: true, force: true });
    }

    expect(installHooksFromPath).not.toHaveBeenCalled();
    expect(installPluginFromPath).not.toHaveBeenCalled();
    expect(writeConfigFile).not.toHaveBeenCalled();
    expect(runtimeErrors.at(-1)).toContain("unsupported $include shape at the root");
  });

  it("fails closed before installing a blocked ambiguous local plugin", async () => {
    const archivePath = path.join(os.tmpdir(), `bot-plugin-${process.pid}.tgz`);
    fs.writeFileSync(archivePath, "not-an-archive");
    primeBlockedPluginConfigMutation();
    installHooksFromPath.mockResolvedValue({
      ok: false,
      error: "package.json missing bot.hooks",
    });

    try {
      await expect(
        runAcknowledgedPluginsInstallCommand(["plugins", "install", archivePath]),
      ).rejects.toThrow("__exit__:1");
    } finally {
      fs.rmSync(archivePath, { force: true });
    }

    expect(installHooksFromPath).toHaveBeenCalledTimes(1);
    expect(hookPathInstallCall().inspection).toBe("package-kind");
    expect(installPluginFromPath).not.toHaveBeenCalled();
    expect(writeConfigFile).not.toHaveBeenCalled();
    expect(runtimeErrors.at(-1)).toContain(
      "Config plugins are stored in an external or unresolved top-level $include",
    );
  });

  it("fails closed when an npm hook probe finds a plugin-capable package", async () => {
    primeBlockedPluginConfigMutation();
    installHooksFromNpmSpec.mockResolvedValue({
      ...createHookPackInstallResult("/tmp/hooks/demo-hooks"),
      packageKind: "plugin-capable",
    });

    await expect(
      runAcknowledgedPluginsInstallCommand(["plugins", "install", "@acme/dual-package"]),
    ).rejects.toThrow("__exit__:1");

    expect(installHooksFromNpmSpec).toHaveBeenCalledTimes(1);
    expect(hookNpmInstallCall().inspection).toBe("package-kind");
    expect(installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(writeConfigFile).not.toHaveBeenCalled();
    expect(runtimeErrors.at(-1)).toContain(
      "Config plugins are stored in an external or unresolved top-level $include",
    );
  });

  it("fails closed when a local hook probe finds a plugin-capable package", async () => {
    const localPath = fs.mkdtempSync(path.join(os.tmpdir(), "bot-dual-package-"));
    primeBlockedPluginConfigMutation();
    installHooksFromPath.mockResolvedValue({
      ...createHookPackInstallResult(localPath),
      packageKind: "plugin-capable",
    });

    try {
      await expect(
        runAcknowledgedPluginsInstallCommand(["plugins", "install", localPath]),
      ).rejects.toThrow("__exit__:1");
    } finally {
      fs.rmSync(localPath, { recursive: true, force: true });
    }

    expect(installHooksFromPath).toHaveBeenCalledTimes(1);
    expect(hookPathInstallCall().inspection).toBe("package-kind");
    expect(installPluginFromPath).not.toHaveBeenCalled();
    expect(writeConfigFile).not.toHaveBeenCalled();
    expect(runtimeErrors.at(-1)).toContain(
      "Config plugins are stored in an external or unresolved top-level $include",
    );
  });

  it("fails closed for a local bundle plugin instead of installing its hooks", async () => {
    const localPath = fs.mkdtempSync(path.join(os.tmpdir(), "bot-bundle-plugin-"));
    primeBlockedPluginConfigMutation();
    installHooksFromPath.mockResolvedValue({
      ...createHookPackInstallResult(localPath),
      packageKind: "plugin-capable",
    });

    try {
      await expect(
        runAcknowledgedPluginsInstallCommand(["plugins", "install", localPath]),
      ).rejects.toThrow("__exit__:1");
    } finally {
      fs.rmSync(localPath, { recursive: true, force: true });
    }

    expect(installHooksFromPath).toHaveBeenCalledTimes(1);
    expect(hookPathInstallCall().inspection).toBe("package-kind");
    expect(installPluginFromPath).not.toHaveBeenCalled();
    expect(writeConfigFile).not.toHaveBeenCalled();
    expect(runtimeErrors.at(-1)).toContain(
      "Config plugins are stored in an external or unresolved top-level $include",
    );
  });

  it("fails closed when a blocked-config npm hook probe throws", async () => {
    primeBlockedPluginConfigMutation();
    installHooksFromNpmSpec.mockRejectedValue(new Error("hook validation exploded"));

    await expect(
      runAcknowledgedPluginsInstallCommand(["plugins", "install", "@acme/demo-plugin"]),
    ).rejects.toThrow("__exit__:1");

    expect(installHooksFromNpmSpec).toHaveBeenCalledTimes(1);
    expect(hookNpmInstallCall().inspection).toBe("package-kind");
    expect(installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(runtimeErrors.at(-1)).toContain(
      "Config plugins are stored in an external or unresolved top-level $include",
    );
  });

  it("fails closed when a blocked-config local hook probe throws", async () => {
    const localPluginDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-local-plugin-"));
    primeBlockedPluginConfigMutation();
    installHooksFromPath.mockRejectedValue(new Error("hook validation exploded"));

    try {
      await expect(
        runAcknowledgedPluginsInstallCommand(["plugins", "install", localPluginDir]),
      ).rejects.toThrow("__exit__:1");
    } finally {
      fs.rmSync(localPluginDir, { recursive: true, force: true });
    }

    expect(installHooksFromPath).toHaveBeenCalledTimes(1);
    expect(hookPathInstallCall().inspection).toBe("package-kind");
    expect(installPluginFromPath).not.toHaveBeenCalled();
    expect(runtimeErrors.at(-1)).toContain(
      "Config plugins are stored in an external or unresolved top-level $include",
    );
  });

  it.each([
    {
      label: "marketplace",
      args: ["plugins", "install", "demo", "--marketplace", "local/repo"],
      installer: installPluginFromMarketplace,
      setup: () =>
        installPluginFromMarketplace.mockResolvedValue({
          ok: true,
          pluginId: "demo",
          targetDir: cliInstallPath("demo"),
          extensions: ["index.js"],
          version: "1.2.3",
          marketplaceName: "Claude",
          marketplaceSource: "local/repo",
          marketplacePlugin: "demo",
        }),
    },
    {
      label: "git",
      args: ["plugins", "install", "git:github.com/acme/demo"],
      installer: installPluginFromGitSpec,
      setup: () => installPluginFromGitSpec.mockResolvedValue(createGitPluginInstallResult()),
    },
    {
      label: "npm-pack",
      args: ["plugins", "install", "npm-pack:/tmp/demo.tgz"],
      installer: installPluginFromNpmPackArchive,
      setup: () =>
        installPluginFromNpmPackArchive.mockResolvedValue(createNpmPackPluginInstallResult()),
    },
    {
      label: "ClawHub",
      args: ["plugins", "install", "clawhub:demo"],
      installer: installPluginFromClawHub,
      setup: () => {
        parseClawHubPluginSpec.mockReturnValue({ name: "demo" });
        installPluginFromClawHub.mockResolvedValue(
          createClawHubInstallResult({
            pluginId: "demo",
            packageName: "demo",
            version: "1.2.3",
            channel: "stable",
          }),
        );
      },
    },
  ])(
    "blocks explicit $label plugin installs before installer side effects",
    async ({ args, installer, setup }) => {
      primeBlockedPluginConfigMutation();
      setup();

      const commandArgs =
        args[2] === "clawhub:demo" ? args : withNonClawHubInstallAcknowledgement(args);
      await expect(runPluginsCommand(commandArgs)).rejects.toThrow("__exit__:1");

      expect(installer).not.toHaveBeenCalled();
      expect(writeConfigFile).not.toHaveBeenCalled();
      expect(runtimeErrors.at(-1)).toContain(
        "Config plugins are stored in an external or unresolved top-level $include",
      );
    },
  );

  it("blocks bare official plugins before installer side effects", async () => {
    primeBlockedPluginConfigMutation();
    findBundledPluginSourceMock.mockReturnValue(undefined);

    await expect(runPluginsCommand(["plugins", "install", "brave"])).rejects.toThrow("__exit__:1");

    expect(installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(writeConfigFile).not.toHaveBeenCalled();
    expect(runtimeErrors.at(-1)).toContain(
      "Config plugins are stored in an external or unresolved top-level $include",
    );
  });

  it("blocks bare bundled plugin ids before installer side effects", async () => {
    const pluginId = "config-required-plugin";
    primeBlockedPluginConfigMutation();
    findBundledPluginSourceMock.mockReturnValue({
      pluginId,
      localPath: `/app/dist/extensions/${pluginId}`,
    });

    await expect(runPluginsCommand(["plugins", "install", pluginId])).rejects.toThrow("__exit__:1");

    expect(installPluginFromPath).not.toHaveBeenCalled();
    expect(writeConfigFile).not.toHaveBeenCalled();
    expect(runtimeErrors.at(-1)).toContain(
      "Config plugins are stored in an external or unresolved top-level $include",
    );
  });

  it("blocks explicit plugins through nested include config before installer side effects", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bot-plugin-nested-"));
    primeNestedPluginConfigMutation(tempRoot);
    installPluginFromMarketplace.mockResolvedValue({
      ok: true,
      pluginId: "demo",
      targetDir: cliInstallPath("demo"),
      extensions: ["index.js"],
      version: "1.2.3",
      marketplaceName: "Claude",
      marketplaceSource: "local/repo",
      marketplacePlugin: "demo",
    });

    try {
      await expect(
        runAcknowledgedPluginsInstallCommand([
          "plugins",
          "install",
          "demo",
          "--marketplace",
          "local/repo",
        ]),
      ).rejects.toThrow("__exit__:1");
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }

    expect(installPluginFromMarketplace).not.toHaveBeenCalled();
    expect(writeConfigFile).not.toHaveBeenCalled();
    expect(runtimeErrors.at(-1)).toContain("nested $include");
  });

  it("exits when --marketplace is combined with --link", async () => {
    await expect(
      runAcknowledgedPluginsInstallCommand([
        "plugins",
        "install",
        "alpha",
        "--marketplace",
        "local/repo",
        "--link",
      ]),
    ).rejects.toThrow("__exit__:1");

    expect(runtimeErrors.at(-1)).toContain("--link is not supported with --marketplace.");
    expect(runtimeErrors.at(-1)).toContain("bot plugins install --link <path> --force");
    expect(installPluginFromMarketplace).not.toHaveBeenCalled();
  });

  it("exits when marketplace install fails", async () => {
    await expect(
      runAcknowledgedPluginsInstallCommand([
        "plugins",
        "install",
        "alpha",
        "--marketplace",
        "local/repo",
      ]),
    ).rejects.toThrow("__exit__:1");

    expect(marketplaceInstallCall().marketplace).toBe("local/repo");
    expect(marketplaceInstallCall().plugin).toBe("alpha");
    expect(writeConfigFile).not.toHaveBeenCalled();
  });

  it("passes the active profile extensions dir to marketplace installs", async () => {
    const extensionsDir = useProfileExtensionsDir();

    await expect(
      runAcknowledgedPluginsInstallCommand([
        "plugins",
        "install",
        "alpha",
        "--marketplace",
        "local/repo",
      ]),
    ).rejects.toThrow("__exit__:1");

    expect(marketplaceInstallCall().extensionsDir).toBe(extensionsDir);
    expect(marketplaceInstallCall().marketplace).toBe("local/repo");
    expect(marketplaceInstallCall().plugin).toBe("alpha");
  });

  it("fails closed for unrelated invalid config before installer side effects", async () => {
    const invalidConfigErr = new Error("config invalid");
    (invalidConfigErr as { code?: string }).code = "INVALID_CONFIG";
    loadConfig.mockImplementation(() => {
      throw invalidConfigErr;
    });
    readConfigFileSnapshot.mockResolvedValue({
      path: "/tmp/bot-config.json5",
      exists: true,
      raw: '{ "models": { "default": 123 } }',
      parsed: { models: { default: 123 } },
      resolved: { models: { default: 123 } },
      valid: false,
      config: { models: { default: 123 } },
      hash: "mock",
      issues: [{ path: "models.default", message: "invalid model ref" }],
      warnings: [],
      legacyIssues: [],
    });

    await expect(
      runAcknowledgedPluginsInstallCommand(["plugins", "install", "alpha"]),
    ).rejects.toThrow("__exit__:1");

    expect(runtimeErrors.at(-1)).toContain(
      "Config invalid; run `bot doctor --fix` before installing plugins.",
    );
    expect(installPluginFromMarketplace).not.toHaveBeenCalled();
    expect(installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(writeConfigFile).not.toHaveBeenCalled();
  });

  it("installs marketplace plugins and persists plugin index", async () => {
    const cfg = {
      plugins: {
        entries: {},
      },
    } as BotConfig;
    const enabledCfg = {
      plugins: {
        entries: {
          alpha: {
            enabled: true,
          },
        },
      },
    } as BotConfig;
    loadConfig.mockReturnValue(cfg);
    installPluginFromMarketplace.mockResolvedValue({
      ok: true,
      pluginId: "alpha",
      targetDir: cliInstallPath("alpha"),
      extensions: ["index.js"],
      version: "1.2.3",
      marketplaceName: "Claude",
      marketplaceSource: "local/repo",
      marketplacePlugin: "alpha",
    });
    enablePluginInConfig.mockReturnValue({ config: enabledCfg });
    buildPluginSnapshotReport.mockReturnValue({
      plugins: [{ id: "alpha", kind: "provider" }],
      diagnostics: [],
    });
    loadPluginManifestRegistry.mockReturnValue({
      plugins: [{ id: "alpha", kind: "memory" }],
      diagnostics: [],
    });
    applyExclusiveSlotSelection.mockReturnValue({
      config: enabledCfg,
      warnings: ["slot adjusted"],
    });

    await runAcknowledgedPluginsInstallCommand([
      "plugins",
      "install",
      "alpha",
      "--marketplace",
      "local/repo",
    ]);

    expect(persistedInstallRecord("alpha").source).toBe("marketplace");
    expect(persistedInstallRecord("alpha").installPath).toBe(cliInstallPath("alpha"));
    expect(writeConfigFile).toHaveBeenCalledWith(enabledCfg);
    expect(replaceConfigCall().baseHash).toBe("mock");
    expect(replaceConfigCall().nextConfig).toBe(enabledCfg);
    expect(runtimeLogsContain("slot adjusted")).toBe(true);
    expect(runtimeLogsContain("Installed plugin: alpha")).toBe(true);
    expect(clearPluginRegistryLoadCache).not.toHaveBeenCalled();
  });

  it("passes force through as overwrite mode for marketplace installs", async () => {
    await expect(
      runAcknowledgedPluginsInstallCommand([
        "plugins",
        "install",
        "alpha",
        "--marketplace",
        "local/repo",
        "--force",
      ]),
    ).rejects.toThrow("__exit__:1");

    expect(marketplaceInstallCall().marketplace).toBe("local/repo");
    expect(marketplaceInstallCall().plugin).toBe("alpha");
    expect(marketplaceInstallCall().mode).toBe("update");
  });

  it("requires acknowledgement for noninteractive non-ClawHub plugin installs", async () => {
    setTty(false);
    primeSuccessfulPluginPersistence("demo");
    installPluginFromNpmSpec.mockResolvedValue(createNpmPluginInstallResult("demo"));

    await expect(runPluginsCommand(["plugins", "install", "npm:demo"])).rejects.toThrow(
      "__exit__:1",
    );

    expect(installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(runtimeErrors.at(-1)).toContain("outside ClawHub review");
    expect(runtimeErrors.at(-1)).toContain(NON_CLAWHUB_INSTALL_FORCE_FLAG);
  });

  it.each([
    {
      label: "npm-pack",
      prepare: () => ({
        args: ["plugins", "install", "npm-pack:/tmp/demo.tgz"],
        expectNoInstallerSideEffects: () =>
          expect(installPluginFromNpmPackArchive).not.toHaveBeenCalled(),
      }),
    },
    {
      label: "git",
      prepare: () => ({
        args: ["plugins", "install", "git:github.com/acme/demo@v1.2.3"],
        expectNoInstallerSideEffects: () => expect(installPluginFromGitSpec).not.toHaveBeenCalled(),
      }),
    },
    {
      label: "marketplace",
      prepare: () => ({
        args: ["plugins", "install", "demo", "--marketplace", "local/repo"],
        expectNoInstallerSideEffects: () =>
          expect(installPluginFromMarketplace).not.toHaveBeenCalled(),
      }),
    },
    {
      label: "local path",
      prepare: () => {
        const localPath = fs.mkdtempSync(path.join(os.tmpdir(), "bot-plugin-source-"));
        return {
          args: ["plugins", "install", localPath],
          cleanup: () => fs.rmSync(localPath, { recursive: true, force: true }),
          expectNoInstallerSideEffects: () => expect(installPluginFromPath).not.toHaveBeenCalled(),
        };
      },
    },
    {
      label: "local archive",
      prepare: () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bot-plugin-source-"));
        const archivePath = `${tempRoot}.tgz`;
        fs.writeFileSync(archivePath, "archive");
        return {
          args: ["plugins", "install", archivePath],
          cleanup: () => {
            fs.rmSync(archivePath, { force: true });
            fs.rmSync(tempRoot, { recursive: true, force: true });
          },
          expectNoInstallerSideEffects: () => expect(installPluginFromPath).not.toHaveBeenCalled(),
        };
      },
    },
  ])(
    "requires acknowledgement for noninteractive $label installs before installer side effects",
    async ({ prepare }) => {
      setTty(false);
      const prepared: {
        args: string[];
        cleanup?: () => void;
        expectNoInstallerSideEffects: () => void;
      } = prepare();

      try {
        await expect(runPluginsCommand(prepared.args)).rejects.toThrow("__exit__:1");
      } finally {
        prepared.cleanup?.();
      }

      prepared.expectNoInstallerSideEffects();
      expect(runtimeErrors.at(-1)).toContain("outside ClawHub review");
      expect(runtimeErrors.at(-1)).toContain(NON_CLAWHUB_INSTALL_FORCE_FLAG);
    },
  );

  it("does not require acknowledgement for a bundled plugin's local source path", async () => {
    const localPath = fs.mkdtempSync(path.join(os.tmpdir(), "bot-bundled-plugin-source-"));
    findBundledPluginSourceMock.mockImplementation((params: unknown) => {
      const { lookup } = params as {
        lookup: { kind: "localPath" | "npmSpec" | "pluginId"; value: string };
      };
      return lookup.kind === "localPath" && path.resolve(lookup.value) === path.resolve(localPath)
        ? { pluginId: "demo", localPath }
        : undefined;
    });
    primeSuccessfulPluginPersistence("demo");
    installPluginFromPath.mockResolvedValue({
      ok: true,
      pluginId: "demo",
      targetDir: cliInstallPath("demo"),
      version: "1.0.0",
      extensions: ["index.js"],
    });

    try {
      await runPluginsCommand(["plugins", "install", localPath]);
    } finally {
      fs.rmSync(localPath, { recursive: true, force: true });
    }

    expect(promptYesNo).not.toHaveBeenCalled();
    expect(runtimeErrors.join("\n")).not.toContain("outside ClawHub review");
    expect(installPluginFromPath).toHaveBeenCalledTimes(1);
  });

  it("prompts interactive users before non-ClawHub plugin installs and cancels on no", async () => {
    setTty(true);
    promptYesNo.mockResolvedValueOnce(false);
    primeSuccessfulPluginPersistence("demo");
    installPluginFromNpmSpec.mockResolvedValue(createNpmPluginInstallResult("demo"));

    await expect(runPluginsCommand(["plugins", "install", "npm:demo"])).rejects.toThrow(
      "__exit__:1",
    );

    expect(promptYesNo).toHaveBeenCalledWith("Install this non-ClawHub plugin source?");
    expect(runtimeLogsContain("Installing plugin from npm registry")).toBe(true);
    expect(runtimeLogsContain("outside ClawHub review")).toBe(true);
    expect(installPluginFromNpmSpec).not.toHaveBeenCalled();
  });

  it("prompts interactive users before non-ClawHub plugin installs and proceeds on yes", async () => {
    setTty(true);
    promptYesNo.mockResolvedValueOnce(true);
    primeSuccessfulPluginPersistence("demo");
    installPluginFromNpmSpec.mockResolvedValue(createNpmPluginInstallResult("demo"));

    await runPluginsCommand(["plugins", "install", "npm:demo"]);

    expect(promptYesNo).toHaveBeenCalledWith("Install this non-ClawHub plugin source?");
    expect(runtimeLogsContain("Installing plugin from npm registry")).toBe(true);
    expect(runtimeLogsContain("outside ClawHub review")).toBe(true);
    expect(installPluginFromNpmSpec).toHaveBeenCalledTimes(1);
    expect(persistedInstallRecord("demo").source).toBe("npm");
  });

  it.each([
    {
      label: "npm",
      args: ["plugins", "install", "npm:demo"],
      expectedSource: "npm registry",
      setup: () => {
        primeSuccessfulPluginPersistence("demo");
        installPluginFromNpmSpec.mockResolvedValue(createNpmPluginInstallResult("demo"));
      },
    },
    {
      label: "npm-pack",
      args: ["plugins", "install", "npm-pack:/tmp/demo.tgz"],
      expectedSource: "local npm-pack archive",
      setup: () => {
        primeSuccessfulPluginPersistence("demo");
        installPluginFromNpmPackArchive.mockResolvedValue(createNpmPackPluginInstallResult("demo"));
      },
    },
    {
      label: "git",
      args: ["plugins", "install", "git:github.com/acme/demo@v1.2.3"],
      expectedSource: "Git repository",
      setup: () => {
        primeSuccessfulPluginPersistence("demo");
        installPluginFromGitSpec.mockResolvedValue(createGitPluginInstallResult("demo"));
      },
    },
    {
      label: "marketplace",
      args: ["plugins", "install", "demo", "--marketplace", "local/repo"],
      expectedSource: "marketplace source",
      setup: () => {
        primeSuccessfulPluginPersistence("demo");
        installPluginFromMarketplace.mockResolvedValue({
          ok: true,
          pluginId: "demo",
          targetDir: cliInstallPath("demo"),
          extensions: ["index.js"],
          version: "1.2.3",
          marketplaceName: "Claude",
          marketplaceSource: "local/repo",
          marketplacePlugin: "demo",
        });
      },
    },
  ])(
    "warns for acknowledged $label installs outside ClawHub",
    async ({ args, expectedSource, setup }) => {
      setup();

      await runAcknowledgedPluginsInstallCommand(args);

      expect(runtimeLogsContain(`Installing plugin from ${expectedSource}`)).toBe(true);
      expect(runtimeLogsContain("outside ClawHub review")).toBe(true);
    },
  );

  it.each([
    {
      label: "local path",
      expectedSource: "local path",
      suffix: "",
    },
    {
      label: "local archive",
      expectedSource: "local archive",
      suffix: ".tgz",
    },
  ])(
    "warns for acknowledged $label installs outside ClawHub",
    async ({ expectedSource, suffix }) => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bot-plugin-source-"));
      const localSource = suffix ? `${tempRoot}${suffix}` : tempRoot;
      if (suffix) {
        fs.writeFileSync(localSource, "archive");
      }
      primeSuccessfulPluginPersistence("demo");
      installPluginFromPath.mockResolvedValue({
        ok: true,
        pluginId: "demo",
        targetDir: cliInstallPath("demo"),
        version: "1.2.3",
        extensions: ["./dist/index.js"],
      });

      try {
        await runAcknowledgedPluginsInstallCommand(["plugins", "install", localSource]);
      } finally {
        fs.rmSync(localSource, { recursive: true, force: true });
        if (suffix) {
          fs.rmSync(tempRoot, { recursive: true, force: true });
        }
      }

      expect(runtimeLogsContain(`Installing plugin from ${expectedSource}`)).toBe(true);
      expect(runtimeLogsContain("outside ClawHub review")).toBe(true);
    },
  );

  it("does not show the non-ClawHub warning for explicit ClawHub installs", async () => {
    primeSuccessfulPluginPersistence("demo");
    parseClawHubPluginSpec.mockReturnValue({ name: "demo" });
    installPluginFromClawHub.mockResolvedValue(
      createClawHubInstallResult({
        pluginId: "demo",
        packageName: "demo",
        version: "1.2.3",
        channel: "official",
      }),
    );
    await runPluginsCommand(["plugins", "install", "clawhub:demo"]);

    expect(runtimeLogsContain("outside ClawHub review")).toBe(false);
    expect(installPluginFromNpmSpec).not.toHaveBeenCalled();
  });

  it("installs ClawHub plugins and persists source metadata", async () => {
    const cfg = {
      plugins: {
        entries: {},
      },
    } as BotConfig;
    const enabledCfg = createEnabledPluginConfig("demo");
    loadConfig.mockReturnValue(cfg);
    parseClawHubPluginSpec.mockReturnValue({ name: "demo" });
    installPluginFromClawHub.mockResolvedValue(
      createClawHubInstallResult({
        pluginId: "demo",
        packageName: "demo",
        version: "1.2.3",
        channel: "official",
      }),
    );
    enablePluginInConfig.mockReturnValue({ config: enabledCfg });
    applyExclusiveSlotSelection.mockReturnValue({
      config: enabledCfg,
      warnings: [],
    });

    await runPluginsCommand(["plugins", "install", "clawhub:demo"]);

    expect(clawHubInstallCall().spec).toBe("clawhub:demo");
    const record = persistedInstallRecord("demo");
    expect(record.source).toBe("clawhub");
    expect(record.spec).toBe("clawhub:demo");
    expect(record.installPath).toBe(cliInstallPath("demo"));
    expect(record.version).toBe("1.2.3");
    expect(record.clawhubPackage).toBe("demo");
    expect(record.clawhubFamily).toBe("code-plugin");
    expect(record.clawhubChannel).toBe("official");
    expect(record.clawpackSha256).toBe(
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(record.clawpackSpecVersion).toBe(1);
    expect(record.clawpackManifestSha256).toBe(
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );
    expect(record.clawpackSize).toBe(4096);
    expect(readConfigFileSnapshotForWrite).toHaveBeenCalledTimes(2);
    expect(writeConfigFile).toHaveBeenCalledWith(enabledCfg);
    expect(runtimeLogsContain("Installed plugin: demo")).toBe(true);
    expect(reportClawHubPluginInstallTelemetry).toHaveBeenCalledWith({
      baseUrl: "https://clawhub.ai",
      packageName: "demo",
      version: "1.2.3",
    });
    expect(installPluginFromNpmSpec).not.toHaveBeenCalled();
  });

  it("does not report a ClawHub install when durable persistence fails", async () => {
    loadConfig.mockReturnValue(createEmptyPluginConfig());
    parseClawHubPluginSpec.mockReturnValue({ name: "demo" });
    installPluginFromClawHub.mockResolvedValue(
      createClawHubInstallResult({
        pluginId: "demo",
        packageName: "demo",
        version: "1.2.3",
        channel: "official",
      }),
    );
    enablePluginInConfig.mockReturnValue({ config: createEnabledPluginConfig("demo") });
    applyExclusiveSlotSelection.mockReturnValue({
      config: createEnabledPluginConfig("demo"),
      warnings: [],
    });
    writeConfigFile.mockRejectedValueOnce(new Error("persistence failed"));

    await expect(runPluginsCommand(["plugins", "install", "clawhub:demo"])).rejects.toThrow(
      "persistence failed",
    );

    expect(reportClawHubPluginInstallTelemetry).not.toHaveBeenCalled();
  });

  it("passes ClawHub risk acknowledgement to explicit ClawHub installs", async () => {
    loadConfig.mockReturnValue(createEmptyPluginConfig());
    parseClawHubPluginSpec.mockReturnValue({ name: "demo" });
    installPluginFromClawHub.mockResolvedValue(
      createClawHubInstallResult({
        pluginId: "demo",
        packageName: "demo",
        version: "1.2.3",
        channel: "official",
        trust: {
          disposition: "review-required",
          scanStatus: "suspicious",
          reasons: ["payload_strings"],
          checkedAt: "2026-05-14T18:00:00.000Z",
          acknowledgedAt: "2026-05-14T18:00:03.000Z",
        },
      }),
    );
    enablePluginInConfig.mockReturnValue({ config: createEnabledPluginConfig("demo") });
    applyExclusiveSlotSelection.mockReturnValue({
      config: createEnabledPluginConfig("demo"),
      warnings: [],
    });

    await runPluginsCommand(["plugins", "install", "clawhub:demo", "--acknowledge-clawhub-risk"]);

    expect(installPluginFromClawHub).toHaveBeenCalledWith(
      expect.objectContaining({
        spec: "clawhub:demo",
        acknowledgeClawHubRisk: true,
      }),
    );
    const record = persistedInstallRecord("demo");
    expect(record.clawhubTrustDisposition).toBe("review-required");
    expect(record.clawhubTrustScanStatus).toBe("suspicious");
    expect(record.clawhubTrustReasons).toEqual(["payload_strings"]);
    expect(record.clawhubTrustCheckedAt).toBe("2026-05-14T18:00:00.000Z");
    expect(record.clawhubTrustAcknowledgedAt).toBe("2026-05-14T18:00:03.000Z");
  });

  it("prints acknowledgement guidance for unacknowledged ClawHub plugin installs", async () => {
    loadConfig.mockReturnValue(createEmptyPluginConfig());
    parseClawHubPluginSpec.mockReturnValue({ name: "demo" });
    installPluginFromClawHub.mockResolvedValue({
      ok: false,
      code: "clawhub_risk_acknowledgement_required",
      error:
        "Install cancelled; rerun with --acknowledge-clawhub-risk to continue after reviewing the warning.",
      warning: "WARNING - ClawHub found security risks in this release",
    });

    await expect(runPluginsCommand(["plugins", "install", "clawhub:demo"])).rejects.toThrow(
      "__exit__:1",
    );

    expect(runtimeErrors.at(-1)).toContain("--acknowledge-clawhub-risk");
  });

  it("prints blocked ClawHub download failures when no trust warning was emitted", async () => {
    loadConfig.mockReturnValue(createEmptyPluginConfig());
    parseClawHubPluginSpec.mockReturnValue({ name: "demo" });
    installPluginFromClawHub.mockResolvedValue({
      ok: false,
      code: "clawhub_download_blocked",
      error:
        'ClawHub blocked artifact download for "demo@1.2.3"; install was not started. ClawHub /api/v1/packages/demo/versions/1.2.3/artifact/download failed (403): blocked.',
    });

    await expect(runPluginsCommand(["plugins", "install", "clawhub:demo"])).rejects.toThrow(
      "__exit__:1",
    );

    expect(runtimeErrors.at(-1)).toContain("ClawHub blocked artifact download");
  });

  it("passes the active profile extensions dir to ClawHub installs", async () => {
    const extensionsDir = useProfileExtensionsDir();
    const cfg = createEmptyPluginConfig();
    const enabledCfg = createEnabledPluginConfig("demo");

    loadConfig.mockReturnValue(cfg);
    parseClawHubPluginSpec.mockReturnValue({ name: "demo" });
    installPluginFromClawHub.mockResolvedValue(
      createClawHubInstallResult({
        pluginId: "demo",
        packageName: "demo",
        version: "1.2.3",
        channel: "official",
      }),
    );
    enablePluginInConfig.mockReturnValue({ config: enabledCfg });
    applyExclusiveSlotSelection.mockReturnValue({
      config: enabledCfg,
      warnings: [],
    });

    await runPluginsCommand(["plugins", "install", "clawhub:demo"]);

    expect(clawHubInstallCall().extensionsDir).toBe(extensionsDir);
    expect(clawHubInstallCall().spec).toBe("clawhub:demo");
  });

  it("preserves non-config policy for unconfigured bundled installs", async () => {
    const pluginId = "config-required-plugin";
    const cfg = {
      plugins: {
        entries: {
          [pluginId]: {
            hooks: { timeoutMs: 5_000 },
          },
        },
        load: {
          paths: ["/existing/plugin"],
        },
      },
    } as BotConfig;
    loadConfig.mockReturnValue(cfg);
    findBundledPluginSourceMock.mockReturnValue({
      pluginId,
      localPath: `/app/dist/extensions/${pluginId}`,
      configSchema: {
        type: "object",
        required: ["token"],
        properties: {
          token: {
            type: "string",
          },
        },
      },
      requiresConfig: true,
    });

    await runPluginsCommand(["plugins", "install", pluginId]);

    const writtenConfig = writeConfigFile.mock.calls[
      writeConfigFile.mock.calls.length - 1
    ]?.[0] as BotConfig;
    expect(writtenConfig.plugins?.entries?.[pluginId]).toEqual({
      enabled: false,
      hooks: { timeoutMs: 5_000 },
    });
    expect(writtenConfig.plugins?.load?.paths).toEqual(["/existing/plugin"]);
    const record = persistedInstallRecord(pluginId);
    expect(record.source).toBe("path");
    expect(String(record.sourcePath)).toContain(pluginId);
    expect(String(record.installPath)).toContain(pluginId);
    expect(enablePluginInConfig).not.toHaveBeenCalled();
    expect(applyExclusiveSlotSelection).not.toHaveBeenCalled();
    expect(runtimeLogsContain("requires configuration first")).toBe(true);
  });

  it("rejects invalid authored config for config-gated bundled installs", async () => {
    const pluginId = "config-required-plugin";
    const cfg = {
      plugins: {
        entries: {
          [pluginId]: {
            config: {},
            hooks: { timeoutMs: 5_000 },
          },
        },
      },
    } as BotConfig;
    loadConfig.mockReturnValue(cfg);
    findBundledPluginSourceMock.mockReturnValue({
      pluginId,
      localPath: `/app/dist/extensions/${pluginId}`,
      configSchema: {
        type: "object",
        required: ["token"],
        properties: { token: { type: "string" } },
      },
      requiresConfig: true,
    });

    await expect(runPluginsCommand(["plugins", "install", pluginId])).rejects.toThrow(
      "has invalid configured settings",
    );

    expect(writeConfigFile).not.toHaveBeenCalled();
    expect(enablePluginInConfig).not.toHaveBeenCalled();
  });

  it("enables config-gated bundled installs when provider-backed config is explicit", async () => {
    const pluginId = "config-required-plugin";
    const cfg = {
      plugins: {
        entries: {
          [pluginId]: {
            config: {
              token: "sk-test",
            },
          },
        },
      },
    } as BotConfig;
    const enabledCfg = createEnabledPluginConfig(pluginId);
    loadConfig.mockReturnValue(cfg);
    findBundledPluginSourceMock.mockReturnValue({
      pluginId,
      localPath: `/app/dist/extensions/${pluginId}`,
      configSchema: {
        type: "object",
        required: ["token"],
        properties: {
          token: {
            type: "string",
          },
        },
      },
      requiresConfig: true,
    });
    enablePluginInConfig.mockReturnValue({ config: enabledCfg });

    await runPluginsCommand(["plugins", "install", pluginId]);

    expect(enablePluginInConfig).toHaveBeenCalledTimes(1);
    expect(writeConfigFile).toHaveBeenCalledWith(enabledCfg);
    expect(runtimeLogsContain("requires configuration first")).toBe(false);
  });

  it("passes force through as overwrite mode for ClawHub installs", async () => {
    const cfg = {
      plugins: {
        entries: {},
      },
    } as BotConfig;
    const enabledCfg = createEnabledPluginConfig("demo");

    loadConfig.mockReturnValue(cfg);
    parseClawHubPluginSpec.mockReturnValue({ name: "demo" });
    installPluginFromClawHub.mockResolvedValue(
      createClawHubInstallResult({
        pluginId: "demo",
        packageName: "demo",
        version: "1.2.3",
        channel: "official",
      }),
    );
    enablePluginInConfig.mockReturnValue({ config: enabledCfg });
    recordPluginInstall.mockReturnValue(enabledCfg);
    applyExclusiveSlotSelection.mockReturnValue({
      config: enabledCfg,
      warnings: [],
    });

    await runPluginsCommand(["plugins", "install", "clawhub:demo", "--force"]);

    expect(clawHubInstallCall().spec).toBe("clawhub:demo");
    expect(clawHubInstallCall().mode).toBe("update");
  });

  it("keeps explicit ClawHub versions pinned in install records", async () => {
    const cfg = {
      plugins: {
        entries: {},
      },
    } as BotConfig;
    const enabledCfg = createEnabledPluginConfig("demo");

    loadConfig.mockReturnValue(cfg);
    parseClawHubPluginSpec.mockReturnValue({ name: "demo", version: "1.2.3" });
    installPluginFromClawHub.mockResolvedValue(
      createClawHubInstallResult({
        pluginId: "demo",
        packageName: "demo",
        version: "1.2.3",
        channel: "official",
      }),
    );
    enablePluginInConfig.mockReturnValue({ config: enabledCfg });
    applyExclusiveSlotSelection.mockReturnValue({
      config: enabledCfg,
      warnings: [],
    });

    await runPluginsCommand(["plugins", "install", "clawhub:demo@1.2.3"]);

    expect(clawHubInstallCall().spec).toBe("clawhub:demo@1.2.3");
    const record = persistedInstallRecord("demo");
    expect(record.source).toBe("clawhub");
    expect(record.spec).toBe("clawhub:demo@1.2.3");
    expect(record.installPath).toBe(cliInstallPath("demo"));
    expect(record.version).toBe("1.2.3");
    expect(record.clawhubPackage).toBe("demo");
    expect(record.clawpackSha256).toBe(
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(record.clawpackSpecVersion).toBe(1);
    expect(record.clawpackManifestSha256).toBe(
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );
    expect(record.clawpackSize).toBe(4096);
  });

  it("resolves exact official external plugin ids through their npm package", async () => {
    const { enabledCfg } = primeSuccessfulPluginPersistence("brave");
    findBundledPluginSourceMock.mockReturnValue(undefined);
    installPluginFromNpmSpec.mockResolvedValue(createNpmPluginInstallResult("brave"));

    await runPluginsCommand(["plugins", "install", "brave"]);

    expect(findBundledPluginSourceMock).toHaveBeenCalledWith({
      lookup: { kind: "pluginId", value: "brave" },
    });
    expect(installPluginFromClawHub).not.toHaveBeenCalled();
    expect(npmInstallCall().spec).toBe("@hanzo/bot-brave-plugin");
    expect(npmInstallCall().expectedPluginId).toBe("brave");
    expect(npmInstallCall().trustedSourceLinkedOfficialInstall).toBe(true);
    expect(runtimeLogsContain("outside ClawHub review")).toBe(false);
    const record = persistedInstallRecord("brave");
    expect(record.source).toBe("npm");
    expect(record.spec).toBe("@hanzo/bot-brave-plugin");
    expect(record.installPath).toBe(cliInstallPath("brave"));
    expect(record.version).toBe("1.2.3");
    expect(writeConfigFile).toHaveBeenCalledWith(enabledCfg);
  });

  it("passes third-party external catalog integrity with catalog install trust", async () => {
    primeSuccessfulPluginPersistence("wecom-bot-plugin");
    findBundledPluginSourceMock.mockReturnValue(undefined);
    installPluginFromNpmSpec.mockResolvedValue(
      createNpmPluginInstallResult("wecom-bot-plugin"),
    );

    await runPluginsCommand(["plugins", "install", "wecom"]);

    expect(npmInstallCall().spec).toBe("@wecom/wecom-bot-plugin@2026.5.7");
    expect(npmInstallCall().expectedPluginId).toBe("wecom-bot-plugin");
    expect(npmInstallCall().expectedIntegrity).toBe(
      "sha512-TCkP9as00WfEhgFWG8YL/rcmaWGIshAki2HQh83nTRccGfVBCoGjrEboTTqq3yDmK9koWTV11zi8u8A4dNtvug==",
    );
    expect(npmInstallCall().trustedSourceLinkedOfficialInstall).toBe(true);
  });

  it.each(OFFICIAL_EXTERNAL_NPM_INSTALLS_WITHOUT_INTEGRITY)(
    "keeps official external npm installs trusted without integrity for $pluginId",
    async ({ pluginId, npmSpec }) => {
      primeSuccessfulPluginPersistence(pluginId);
      findBundledPluginSourceMock.mockReturnValue(undefined);
      installPluginFromNpmSpec.mockResolvedValue(createNpmPluginInstallResult(pluginId));

      await runPluginsCommand(["plugins", "install", pluginId]);

      expect(findBundledPluginSourceMock).toHaveBeenCalledWith({
        lookup: { kind: "pluginId", value: pluginId },
      });
      expect(installPluginFromClawHub).not.toHaveBeenCalled();
      expect(npmInstallCall().spec).toBe(npmSpec);
      expect(npmInstallCall().expectedPluginId).toBe(pluginId);
      expect(npmInstallCall().trustedSourceLinkedOfficialInstall).toBe(true);
      expect(npmInstallCall().expectedIntegrity).toBeUndefined();
    },
  );

  it("passes third-party external catalog integrity to hook-pack fallback", async () => {
    loadConfig.mockReturnValue(createEmptyPluginConfig());
    findBundledPluginSourceMock.mockReturnValue(undefined);
    installPluginFromNpmSpec.mockResolvedValue({
      ok: false,
      error: "package.json missing bot.extensions",
      code: "missing_bot_extensions",
    });
    installHooksFromNpmSpec.mockResolvedValue({
      ok: false,
      error:
        "aborted: npm package integrity drift detected for @wecom/wecom-bot-plugin@2026.5.7",
    });

    await expect(runPluginsCommand(["plugins", "install", "wecom"])).rejects.toThrow("__exit__:1");

    expect(npmInstallCall().trustedSourceLinkedOfficialInstall).toBe(true);
    expect(hookNpmInstallCall().spec).toBe("@wecom/wecom-bot-plugin@2026.5.7");
    expect(hookNpmInstallCall().expectedIntegrity).toBe(
      "sha512-TCkP9as00WfEhgFWG8YL/rcmaWGIshAki2HQh83nTRccGfVBCoGjrEboTTqq3yDmK9koWTV11zi8u8A4dNtvug==",
    );
  });

  it("installs ordinary bare plugin specs through npm without ClawHub lookup", async () => {
    const { enabledCfg } = primeSuccessfulPluginPersistence("demo");
    installPluginFromNpmSpec.mockResolvedValue(createNpmPluginInstallResult("demo"));

    await runAcknowledgedPluginsInstallCommand(["plugins", "install", "demo"]);

    expect(installPluginFromClawHub).not.toHaveBeenCalled();
    expect(npmInstallCall().spec).toBe("demo");
    expect(runtimeLogsContain("Installing plugin from npm registry")).toBe(true);
    expect(runtimeLogsContain("outside ClawHub review")).toBe(true);
    const record = persistedInstallRecord("demo");
    expect(record.source).toBe("npm");
    expect(record.spec).toBe("demo");
    expect(record.installPath).toBe(cliInstallPath("demo"));
    expect(record.version).toBe("1.2.3");
    expect(writeConfigFile).toHaveBeenCalledWith(enabledCfg);
  });

  it("stores npm resolution metadata without changing the active plugin install selector", async () => {
    primeSuccessfulPluginPersistence("demo");
    installPluginFromNpmSpec.mockResolvedValue({
      ok: true,
      pluginId: "demo",
      targetDir: cliInstallPath("demo"),
      version: "1.2.3",
      npmResolution: {
        name: "demo",
        version: "1.2.3",
        resolvedSpec: "demo@1.2.3",
        integrity: "sha512-demo",
      },
    });
    await runAcknowledgedPluginsInstallCommand(["plugins", "install", "demo"]);

    const record = persistedInstallRecord("demo");
    expect(record.spec).toBe("demo");
    expect(record.resolvedSpec).toBe("demo@1.2.3");
    expect(record.integrity).toBe("sha512-demo");
  });

  it("passes bare npm selectors through npm without ClawHub lookup", async () => {
    primeSuccessfulPluginPersistence("demo");
    installPluginFromNpmSpec.mockResolvedValue(createNpmPluginInstallResult("demo"));

    await runAcknowledgedPluginsInstallCommand(["plugins", "install", "demo@beta"]);

    expect(installPluginFromClawHub).not.toHaveBeenCalled();
    expect(npmInstallCall().spec).toBe("demo@beta");
  });

  it("installs directly from npm when npm: prefix is used", async () => {
    const { enabledCfg } = primeSuccessfulPluginPersistence("demo");
    installPluginFromNpmSpec.mockResolvedValue(createNpmPluginInstallResult("demo"));

    await runAcknowledgedPluginsInstallCommand(["plugins", "install", "npm:demo"]);

    expect(npmInstallCall().spec).toBe("demo");
    expect(npmInstallCall().mode).toBe("update");
    expect(runtimeLogsContain("Installing plugin from npm registry")).toBe(true);
    expect(runtimeLogsContain("outside ClawHub review")).toBe(true);
    expect(installPluginFromClawHub).not.toHaveBeenCalled();
    expect(persistedInstallRecord("demo").source).toBe("npm");
    expect(persistedInstallRecord("demo").spec).toBe("demo");
    expect(persistedInstallRecord("demo").installPath).toBe(cliInstallPath("demo"));
    expect(writeConfigFile).toHaveBeenCalledWith(enabledCfg);
  });

  it("installs npm-pack archives through npm install semantics", async () => {
    const { enabledCfg } = primeSuccessfulPluginPersistence("demo");
    const archivePath = "/tmp/bot-demo-1.2.3.tgz";
    installPluginFromNpmPackArchive.mockResolvedValue(createNpmPackPluginInstallResult("demo"));

    await runAcknowledgedPluginsInstallCommand(["plugins", "install", `npm-pack:${archivePath}`]);

    expect(npmPackInstallCall().archivePath).toBe(archivePath);
    expect(npmPackInstallCall().mode).toBe("update");
    expect(installPluginFromPath).not.toHaveBeenCalled();
    expect(installPluginFromNpmSpec).not.toHaveBeenCalled();
    const record = persistedInstallRecord("demo");
    expect(record.source).toBe("npm");
    expect(record.spec).toBe("@hanzo/bot-demo@1.2.3");
    expect(record.sourcePath).toBe(archivePath);
    expect(record.installPath).toBe(cliInstallPath("demo"));
    expect(record.version).toBe("1.2.3");
    expect(record.artifactKind).toBe("npm-pack");
    expect(record.artifactFormat).toBe("tgz");
    expect(record.npmIntegrity).toBe("sha512-pack-demo");
    expect(record.npmShasum).toBe("packdemosha");
    expect(record.npmTarballName).toBe("bot-demo-1.2.3.tgz");
    expect(writeConfigFile).toHaveBeenCalledWith(enabledCfg);
  });

  it("keeps npm-prefixed official plugin ids on explicit npm semantics", async () => {
    primeSuccessfulPluginPersistence("brave");
    installPluginFromNpmSpec.mockResolvedValue(createNpmPluginInstallResult("brave"));

    await runAcknowledgedPluginsInstallCommand(["plugins", "install", "npm:brave"]);

    expect(npmInstallCall().spec).toBe("brave");
    expect(npmInstallCall().expectedPluginId).toBeUndefined();
    expect(npmInstallCall().trustedSourceLinkedOfficialInstall).toBeUndefined();
    expect(runtimeLogsContain("Installing plugin from npm registry")).toBe(true);
    expect(runtimeLogsContain("outside ClawHub review")).toBe(true);
    expect(installPluginFromClawHub).not.toHaveBeenCalled();
  });

  it("marks explicit official npm package installs as trusted", async () => {
    primeSuccessfulPluginPersistence("discord");
    installPluginFromNpmSpec.mockResolvedValue(createNpmPluginInstallResult("discord"));

    await runPluginsCommand(["plugins", "install", "npm:@hanzo/bot-discord"]);

    expect(npmInstallCall().spec).toBe("@hanzo/bot-discord");
    expect(npmInstallCall().expectedPluginId).toBe("discord");
    expect(npmInstallCall().trustedSourceLinkedOfficialInstall).toBe(true);
    expect(runtimeLogsContain("outside ClawHub review")).toBe(false);
    expect(installPluginFromClawHub).not.toHaveBeenCalled();
  });

  it("marks scoped official npm package installs as trusted", async () => {
    primeSuccessfulPluginPersistence("discord");
    findBundledPluginSourceMock.mockReturnValue(undefined);
    installPluginFromNpmSpec.mockResolvedValue(createNpmPluginInstallResult("discord"));

    await runPluginsCommand(["plugins", "install", "@hanzo/bot-discord"]);

    expect(npmInstallCall().spec).toBe("@hanzo/bot-discord");
    expect(npmInstallCall().expectedPluginId).toBe("discord");
    expect(npmInstallCall().trustedSourceLinkedOfficialInstall).toBe(true);
    expect(installPluginFromClawHub).not.toHaveBeenCalled();
  });

  it("uses bundled Bot package specs instead of pinning stale managed npm overrides", async () => {
    primeSuccessfulPluginPersistence("discord");
    const bundledPath = "/app/dist/extensions/discord";
    findBundledPluginSourceMock.mockImplementation((params: unknown) => {
      const { lookup } = params as {
        lookup: { kind: "pluginId" | "npmSpec"; value: string };
      };
      return lookup.kind === "npmSpec" && lookup.value === "@hanzo/bot-discord"
        ? {
            pluginId: "discord",
            localPath: bundledPath,
            npmSpec: "@hanzo/bot-discord",
            version: "2026.5.24-beta.2",
          }
        : undefined;
    });
    await runPluginsCommand([
      "plugins",
      "install",
      "@hanzo/bot-discord@2026.5.20",
      "--pin",
      "--force",
    ]);

    expect(installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(findBundledPluginSourceMock).toHaveBeenCalledWith({
      lookup: { kind: "npmSpec", value: "@hanzo/bot-discord@2026.5.20" },
    });
    expect(findBundledPluginSourceMock).toHaveBeenCalledWith({
      lookup: { kind: "npmSpec", value: "@hanzo/bot-discord" },
    });
    const record = persistedInstallRecord("discord");
    expect(record.source).toBe("path");
    expect(record.spec).toBe("@hanzo/bot-discord@2026.5.20");
    expect(record.sourcePath).toBe(bundledPath);
    expect(record.installPath).toBe(bundledPath);
    expect(runtimeLogsContain("ships with the current Bot build")).toBe(true);
    expect(runtimeLogsContain("npm:@hanzo/bot-discord@2026.5.20")).toBe(true);
  });

  it("marks catalog npm package installs with alternate selectors as trusted", async () => {
    primeSuccessfulPluginPersistence("wecom-bot-plugin");
    findBundledPluginSourceMock.mockReturnValue(undefined);
    installPluginFromNpmSpec.mockResolvedValue(
      createNpmPluginInstallResult("wecom-bot-plugin"),
    );

    await runPluginsCommand(["plugins", "install", "@wecom/wecom-bot-plugin@latest"]);

    // Alternate selectors stay trusted by catalog package name, but must not
    // inherit catalog integrity unless the install spec matches exactly.
    expect(npmInstallCall().spec).toBe("@wecom/wecom-bot-plugin@latest");
    expect(npmInstallCall().expectedPluginId).toBe("wecom-bot-plugin");
    expect(npmInstallCall().trustedSourceLinkedOfficialInstall).toBe(true);
    expect(npmInstallCall().expectedIntegrity).toBeUndefined();
    expect(runtimeLogsContain("outside ClawHub review")).toBe(false);
    expect(installPluginFromClawHub).not.toHaveBeenCalled();
  });

  it("passes the active profile extensions dir to npm installs", async () => {
    const extensionsDir = useProfileExtensionsDir();
    primeSuccessfulPluginPersistence("demo");
    installPluginFromNpmSpec.mockResolvedValue(createNpmPluginInstallResult("demo"));

    await runAcknowledgedPluginsInstallCommand(["plugins", "install", "npm:demo"]);

    expect(npmInstallCall().extensionsDir).toBe(extensionsDir);
    expect(npmInstallCall().spec).toBe("demo");
  });

  it("passes npm: prefix installs through npm options without ClawHub lookup", async () => {
    primeSuccessfulPluginPersistence("demo");
    installPluginFromNpmSpec.mockResolvedValue(createNpmPluginInstallResult("demo"));

    await runAcknowledgedPluginsInstallCommand([
      "plugins",
      "install",
      "npm:demo",
      "--force",
      "--dangerously-force-unsafe-install",
    ]);

    expect(npmInstallCall().spec).toBe("demo");
    expect(npmInstallCall().mode).toBe("update");
    expect(npmInstallCall().dangerouslyForceUnsafeInstall).toBe(true);
    expect(
      runtimeLogsContain(
        "--dangerously-force-unsafe-install is deprecated and no longer affects plugin installs",
      ),
    ).toBe(true);
    expect(installPluginFromClawHub).not.toHaveBeenCalled();
  });

  it("reports npm install failures without trying ClawHub when npm: prefix is used", async () => {
    loadConfig.mockReturnValue({} as BotConfig);
    installPluginFromNpmSpec.mockResolvedValue({
      ok: false,
      error: "npm install failed",
    });
    installHooksFromNpmSpec.mockResolvedValue({
      ok: false,
      error: "package.json missing bot.hooks",
      code: "missing_bot_hooks",
    });

    await expect(
      runAcknowledgedPluginsInstallCommand(["plugins", "install", "npm:demo"]),
    ).rejects.toThrow("__exit__:1");

    expect(installPluginFromClawHub).not.toHaveBeenCalled();
    expect(runtimeErrors.at(-1)).toContain("npm install failed");
    expect(runtimeErrors.at(-1)).not.toContain("Also not a valid hook pack");
  });

  it("keeps actionable hook-pack fallback details", async () => {
    loadConfig.mockReturnValue({} as BotConfig);
    installPluginFromNpmSpec.mockResolvedValue({
      ok: false,
      error: "npm install failed",
    });
    installHooksFromNpmSpec.mockResolvedValue({
      ok: false,
      error: "HOOK.md missing in /tmp/demo-hook",
    });

    await expect(
      runAcknowledgedPluginsInstallCommand(["plugins", "install", "npm:demo-hook"]),
    ).rejects.toThrow("__exit__:1");

    expect(runtimeErrors.at(-1)).toContain("npm install failed");
    expect(runtimeErrors.at(-1)).toContain(
      "Also not a valid hook pack: HOOK.md missing in /tmp/demo-hook",
    );
  });

  it("adds a Git PATH hint when npm plugin dependency install cannot spawn git", async () => {
    loadConfig.mockReturnValue({} as BotConfig);
    installPluginFromNpmSpec.mockResolvedValue({
      ok: false,
      error: [
        "npm install failed:",
        "npm error code ENOENT",
        "npm error syscall spawn git",
        "npm error path git",
      ].join("\n"),
    });
    installHooksFromNpmSpec.mockResolvedValue({
      ok: false,
      error: "package.json missing bot.hooks",
      code: "missing_bot_hooks",
    });

    await expect(
      runAcknowledgedPluginsInstallCommand(["plugins", "install", "npm:@hanzo/bot-whatsapp"]),
    ).rejects.toThrow("__exit__:1");

    expect(installPluginFromClawHub).not.toHaveBeenCalled();
    expect(runtimeErrors.at(-1)).toContain(
      "one of this plugin's npm dependencies is fetched from a git URL",
    );
    expect(runtimeErrors.at(-1)).toContain("winget install --id Git.Git -e");
    expect(runtimeErrors.at(-1)).not.toContain("Also not a valid hook pack");
  });

  it("does not resolve npm: prefixed bundled plugin ids through bundled installs", async () => {
    loadConfig.mockReturnValue({ plugins: { load: { paths: [] } } } as BotConfig);
    installPluginFromNpmSpec.mockResolvedValue({
      ok: false,
      error: "Package not found on npm: memory-lancedb.",
      code: "npm_package_not_found",
    });
    installHooksFromNpmSpec.mockResolvedValue({
      ok: false,
      error: "package.json missing bot.hooks",
      code: "missing_bot_hooks",
    });

    await expect(
      runAcknowledgedPluginsInstallCommand(["plugins", "install", "npm:memory-lancedb"]),
    ).rejects.toThrow("__exit__:1");

    expect(npmInstallCall().spec).toBe("memory-lancedb");
    expect(installPluginFromClawHub).not.toHaveBeenCalled();
    expect(writeConfigFile).not.toHaveBeenCalled();
    expect(runtimeErrors.at(-1)).toContain("Package not found on npm: memory-lancedb.");
    expect(runtimeErrors.at(-1)).not.toContain("Also not a valid hook pack");
  });

  it("rejects empty npm: prefix installs before resolver lookup", async () => {
    loadConfig.mockReturnValue({} as BotConfig);

    await expect(
      runAcknowledgedPluginsInstallCommand(["plugins", "install", "npm:"]),
    ).rejects.toThrow("__exit__:1");

    expect(installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(installPluginFromClawHub).not.toHaveBeenCalled();
    expect(runtimeErrors.at(-1)).toContain("Unsupported npm plugin spec: missing package.");
  });

  it("installs directly from git when git: prefix is used", async () => {
    const { enabledCfg } = primeSuccessfulPluginPersistence("demo");
    installPluginFromGitSpec.mockResolvedValue(createGitPluginInstallResult("demo"));

    await runAcknowledgedPluginsInstallCommand([
      "plugins",
      "install",
      "git:github.com/acme/demo@v1.2.3",
    ]);

    expect(gitInstallCall().spec).toBe("git:github.com/acme/demo@v1.2.3");
    expect(gitInstallCall().mode).toBe("update");
    expect(installPluginFromClawHub).not.toHaveBeenCalled();
    expect(installPluginFromNpmSpec).not.toHaveBeenCalled();
    const record = persistedInstallRecord("demo");
    expect(record.source).toBe("git");
    expect(record.spec).toBe("git:github.com/acme/demo@v1.2.3");
    expect(record.installPath).toBe(cliInstallPath("demo"));
    expect(record.gitUrl).toBe("https://github.com/acme/demo.git");
    expect(record.gitRef).toBe("v1.2.3");
    expect(record.gitCommit).toBe("abc123");
    expect(writeConfigFile).toHaveBeenCalledWith(enabledCfg);
  });

  it("rejects --pin for git installs and points at git refs", async () => {
    loadConfig.mockReturnValue({} as BotConfig);

    await expect(
      runAcknowledgedPluginsInstallCommand([
        "plugins",
        "install",
        "git:github.com/acme/demo",
        "--pin",
      ]),
    ).rejects.toThrow("__exit__:1");

    expect(installPluginFromGitSpec).not.toHaveBeenCalled();
    expect(runtimeErrors.at(-1)).toContain("bot plugins install git:<repo>@<ref> --force");
  });

  it("passes dangerous force unsafe install to marketplace installs", async () => {
    await expect(
      runAcknowledgedPluginsInstallCommand([
        "plugins",
        "install",
        "alpha",
        "--marketplace",
        "local/repo",
        "--dangerously-force-unsafe-install",
      ]),
    ).rejects.toThrow("__exit__:1");

    expect(marketplaceInstallCall().marketplace).toBe("local/repo");
    expect(marketplaceInstallCall().plugin).toBe("alpha");
    expect(marketplaceInstallCall().dangerouslyForceUnsafeInstall).toBe(true);
  });

  it("passes dangerous force unsafe install to npm installs", async () => {
    primeNpmPluginFallback();

    await runAcknowledgedPluginsInstallCommand([
      "plugins",
      "install",
      "demo",
      "--dangerously-force-unsafe-install",
    ]);

    expect(npmInstallCall().spec).toBe("demo");
    expect(npmInstallCall().dangerouslyForceUnsafeInstall).toBe(true);
  });

  it("passes dangerous force unsafe install to linked path probe installs", async () => {
    const cfg = {
      plugins: {
        entries: {},
      },
    } as BotConfig;
    const enabledCfg = createEnabledPluginConfig("demo");
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bot-plugin-link-"));

    loadConfig.mockReturnValue(cfg);
    installPluginFromPath.mockResolvedValueOnce({
      ok: true,
      pluginId: "demo",
      targetDir: tmpRoot,
      version: "1.2.3",
      extensions: ["./dist/index.js"],
    });
    enablePluginInConfig.mockReturnValue({ config: enabledCfg });
    recordPluginInstall.mockReturnValue(enabledCfg);
    applyExclusiveSlotSelection.mockReturnValue({
      config: enabledCfg,
      warnings: [],
    });

    try {
      await runAcknowledgedPluginsInstallCommand([
        "plugins",
        "install",
        tmpRoot,
        "--link",
        "--dangerously-force-unsafe-install",
      ]);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }

    expect(pathInstallCall().path).toBe(tmpRoot);
    expect(pathInstallCall().mode).toBe("install");
    expect(pathInstallCall().dryRun).toBe(true);
    expect(pathInstallCall().allowSourceTypeScriptEntries).toBe(true);
    expect(pathInstallCall().dangerouslyForceUnsafeInstall).toBe(true);
  });

  it("passes dangerous force unsafe install to linked hook-pack probe fallback", async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bot-hook-link-"));
    primeHookPackPathFallback({
      tmpRoot,
      pluginInstallError: "plugin install probe failed",
    });

    try {
      await runAcknowledgedPluginsInstallCommand([
        "plugins",
        "install",
        tmpRoot,
        "--link",
        "--dangerously-force-unsafe-install",
      ]);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }

    expect(hookPathInstallCall().path).toBe(tmpRoot);
    expect(hookPathInstallCall().dryRun).toBe(true);
    expect(hookPathInstallCall().dangerouslyForceUnsafeInstall).toBe(true);
  });

  it("does not fall back to hook pack for linked path when a no-flag security scan blocks", async () => {
    const localPluginDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-link-plugin-"));
    const pluginInstallError = "plugin blocked by security scan";

    loadConfig.mockReturnValue({} as BotConfig);
    installPluginFromPath.mockResolvedValue({
      ok: false,
      error: pluginInstallError,
      code: "security_scan_blocked",
    });

    try {
      await expect(
        runAcknowledgedPluginsInstallCommand(["plugins", "install", localPluginDir, "--link"]),
      ).rejects.toThrow("__exit__:1");
    } finally {
      fs.rmSync(localPluginDir, { recursive: true, force: true });
    }

    expect(installHooksFromPath).not.toHaveBeenCalled();
    expect(runtimeErrors.at(-1)).toContain(pluginInstallError);
    expect(runtimeErrors.at(-1)).not.toContain("Also not a valid hook pack");
  });

  it("passes dangerous force unsafe install to local hook-pack fallback installs", async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bot-hook-install-"));
    primeHookPackPathFallback({
      tmpRoot,
      pluginInstallError: "plugin install failed",
    });

    try {
      await runAcknowledgedPluginsInstallCommand([
        "plugins",
        "install",
        tmpRoot,
        "--dangerously-force-unsafe-install",
      ]);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }

    expect(hookPathInstallCall().path).toBe(tmpRoot);
    expect(hookPathInstallCall().mode).toBe("update");
    expect(hookPathInstallCall().dangerouslyForceUnsafeInstall).toBe(true);
  });

  it("passes the active profile extensions dir to local path installs", async () => {
    const extensionsDir = useProfileExtensionsDir();
    const localPluginDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-local-plugin-"));
    primeSuccessfulPluginPersistence("demo");
    installPluginFromPath.mockResolvedValue({
      ok: true,
      pluginId: "demo",
      targetDir: path.join(extensionsDir, "demo"),
      version: "1.2.3",
      extensions: ["./dist/index.js"],
    });
    try {
      await runAcknowledgedPluginsInstallCommand(["plugins", "install", localPluginDir]);
    } finally {
      fs.rmSync(localPluginDir, { recursive: true, force: true });
    }

    expect(pathInstallCall().extensionsDir).toBe(extensionsDir);
    expect(pathInstallCall().path).toBe(localPluginDir);
  });
  it("passes force through as overwrite mode for npm installs", async () => {
    primeNpmPluginFallback();

    await runAcknowledgedPluginsInstallCommand(["plugins", "install", "demo", "--force"]);

    expect(npmInstallCall().spec).toBe("demo");
    expect(npmInstallCall().mode).toBe("update");
  });

  it("suggests update or --force when npm plugin install target already exists", async () => {
    loadConfig.mockReturnValue({} as BotConfig);
    mockClawHubPackageNotFound("@example/lossless-claw");
    installPluginFromNpmSpec.mockResolvedValue({
      ok: false,
      error:
        "plugin already exists: /home/bot/.bot/extensions/lossless-claw (delete it first)",
    });
    installHooksFromNpmSpec.mockResolvedValue({
      ok: false,
      error: "package.json missing bot.hooks",
    });

    await expect(
      runAcknowledgedPluginsInstallCommand(["plugins", "install", "@example/lossless-claw"]),
    ).rejects.toThrow("__exit__:1");

    expect(runtimeErrors.at(-1)).toContain(
      "Use `bot plugins update <id-or-npm-spec>` to upgrade the tracked plugin, or rerun install with `--force` to replace it.",
    );
    expect(runtimeErrors.at(-1)).not.toContain("Also not a valid hook pack");
  });

  it("does not append hook-pack fallback details for managed extensions boundary failures", async () => {
    const localPluginDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-local-plugin-"));

    loadConfig.mockReturnValue({} as BotConfig);
    installPluginFromPath.mockResolvedValue({
      ok: false,
      error: "Invalid path: must stay within extensions directory",
    });
    installHooksFromPath.mockResolvedValue({
      ok: false,
      error: "package.json missing bot.hooks",
    });

    try {
      await expect(
        runAcknowledgedPluginsInstallCommand(["plugins", "install", localPluginDir]),
      ).rejects.toThrow("__exit__:1");
    } finally {
      fs.rmSync(localPluginDir, { recursive: true, force: true });
    }

    expect(runtimeErrors.at(-1)).toBe("Invalid path: must stay within extensions directory");
    expect(runtimeErrors.at(-1)).not.toContain("Also not a valid hook pack");
  });

  it("passes the install logger to the --link dry-run probe", async () => {
    const localPluginDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-link-plugin-"));
    const cfg = {
      plugins: {
        entries: {},
        load: {
          paths: [],
        },
      },
    } as BotConfig;
    const enabledCfg = createEnabledPluginConfig("demo");

    loadConfig.mockReturnValue(cfg);
    installPluginFromPath.mockImplementation(async (...args: unknown[]) => {
      const [params] = args as [
        {
          logger?: { warn?: (message: string) => void };
          path: string;
          dryRun?: boolean;
          dangerouslyForceUnsafeInstall?: boolean;
        },
      ];
      params.logger?.warn?.("WARNING: installer warning from dry-run probe");
      return {
        ok: true,
        pluginId: "demo",
        targetDir: localPluginDir,
        version: "1.0.0",
        extensions: [],
      };
    });
    enablePluginInConfig.mockReturnValue({ config: enabledCfg });
    recordPluginInstall.mockReturnValue(enabledCfg);
    applyExclusiveSlotSelection.mockReturnValue({
      config: enabledCfg,
      warnings: [],
    });

    try {
      await runAcknowledgedPluginsInstallCommand([
        "plugins",
        "install",
        localPluginDir,
        "--link",
        "--dangerously-force-unsafe-install",
      ]);
    } finally {
      fs.rmSync(localPluginDir, { recursive: true, force: true });
    }

    expect(pathInstallCall().path).toBe(localPluginDir);
    expect(pathInstallCall().dryRun).toBe(true);
    expect(pathInstallCall().allowSourceTypeScriptEntries).toBe(true);
    expect(pathInstallCall().dangerouslyForceUnsafeInstall).toBe(true);
    expect(typeof pathInstallCall().logger?.info).toBe("function");
    expect(typeof pathInstallCall().logger?.warn).toBe("function");
    expect(runtimeLogsContain("installer warning from dry-run probe")).toBe(true);
    expect(
      runtimeLogsContain(
        "--dangerously-force-unsafe-install is deprecated and no longer affects plugin installs",
      ),
    ).toBe(true);
  });

  it.each([
    {
      name: "a no-flag security scan fails",
      code: "security_scan_failed",
      error: "plugin security scan failed",
      flags: [],
    },
    {
      name: "dangerous force unsafe install is set",
      code: "security_scan_blocked",
      error: "plugin blocked by security scan",
      flags: ["--dangerously-force-unsafe-install"],
    },
    {
      name: "security scan fails under dangerous force unsafe install",
      code: "security_scan_failed",
      error: "plugin security scan failed",
      flags: ["--dangerously-force-unsafe-install"],
    },
  ] as const)("does not fall back to hook pack for local path when $name", async (testCase) => {
    const localPluginDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-local-plugin-"));
    loadConfig.mockReturnValue({} as BotConfig);
    installPluginFromPath.mockResolvedValue({
      ok: false,
      error: testCase.error,
      code: testCase.code,
    });

    try {
      await expect(
        runAcknowledgedPluginsInstallCommand([
          "plugins",
          "install",
          localPluginDir,
          ...testCase.flags,
        ]),
      ).rejects.toThrow("__exit__:1");
    } finally {
      fs.rmSync(localPluginDir, { recursive: true, force: true });
    }

    expect(installHooksFromPath).not.toHaveBeenCalled();
    expect(runtimeErrors.at(-1)).toContain(testCase.error);
    expect(runtimeErrors.at(-1)).not.toContain("Also not a valid hook pack");
  });

  it.each([
    {
      name: "dangerous force unsafe install is set",
      code: "security_scan_blocked",
      error: "plugin blocked by security scan",
      spec: "demo",
      flags: ["--dangerously-force-unsafe-install"],
    },
    {
      name: "a no-flag security scan blocks",
      code: "security_scan_blocked",
      error:
        'Plugin "unsafe-plugin" installation blocked: dangerous code patterns detected: finding details',
      spec: "@acme/unsafe-plugin",
      flags: [],
    },
    {
      name: "security scan fails under dangerous force unsafe install",
      code: "security_scan_failed",
      error: "plugin security scan failed",
      spec: "demo",
      flags: ["--dangerously-force-unsafe-install"],
    },
  ] as const)("does not fall back to hook pack for npm installs when $name", async (testCase) => {
    loadConfig.mockReturnValue({} as BotConfig);
    mockClawHubPackageNotFound(testCase.spec);
    installPluginFromNpmSpec.mockResolvedValue({
      ok: false,
      error: testCase.error,
      code: testCase.code,
    });

    await expect(
      runAcknowledgedPluginsInstallCommand([
        "plugins",
        "install",
        testCase.spec,
        ...testCase.flags,
      ]),
    ).rejects.toThrow("__exit__:1");

    expect(installHooksFromNpmSpec).not.toHaveBeenCalled();
    expect(runtimeErrors.at(-1)).toContain(testCase.error);
    expect(runtimeErrors.at(-1)).not.toContain("Also not a valid hook pack");
  });

  it("still falls back to local hook pack when dangerous force unsafe install is set for non-security errors", async () => {
    const localHookDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-local-hook-pack-"));
    loadConfig.mockReturnValue({} as BotConfig);
    installPluginFromPath.mockResolvedValue({
      ok: false,
      error: "package.json missing bot.plugin.json",
      code: "missing_bot_extensions",
    });
    installHooksFromPath.mockResolvedValue({
      ok: true,
      hookPackId: "demo-hooks",
      hooks: ["command-audit"],
      targetDir: "/tmp/hooks/demo-hooks",
      version: "1.2.3",
    });
    recordHookInstall.mockReturnValue(createPathHookPackInstalledConfig(localHookDir));

    try {
      await runAcknowledgedPluginsInstallCommand([
        "plugins",
        "install",
        localHookDir,
        "--dangerously-force-unsafe-install",
      ]);
    } finally {
      fs.rmSync(localHookDir, { recursive: true, force: true });
    }

    expect(hookPathInstallCall().path).toBe(localHookDir);
    expect(runtimeLogsContain("Installed hook pack: demo-hooks")).toBe(true);
  });

  it("still falls back to npm hook pack when dangerous force unsafe install is set for non-security errors", async () => {
    primeHookPackNpmFallback();

    await runAcknowledgedPluginsInstallCommand([
      "plugins",
      "install",
      "@acme/demo-hooks",
      "--dangerously-force-unsafe-install",
    ]);

    expect(hookNpmInstallCall().spec).toBe("@acme/demo-hooks");
    expect(runtimeLogsContain("Installed hook pack: demo-hooks")).toBe(true);
  });

  it("does not fall back to npm when explicit ClawHub rejects a real package", async () => {
    parseClawHubPluginSpec.mockReturnValue({ name: "demo" });
    installPluginFromClawHub.mockResolvedValue({
      ok: false,
      error: 'Use "bot skills install demo" instead.',
      code: "skill_package",
    });

    await expect(runPluginsCommand(["plugins", "install", "clawhub:demo"])).rejects.toThrow(
      "__exit__:1",
    );

    expect(installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(runtimeErrors.at(-1)).toContain('Use "bot skills install demo" instead.');
  });

  it("falls back to installing hook packs from npm specs", async () => {
    const { installedCfg } = primeHookPackNpmFallback();

    await runAcknowledgedPluginsInstallCommand(["plugins", "install", "@acme/demo-hooks"]);

    expect(hookNpmInstallCall().spec).toBe("@acme/demo-hooks");
    const record = recordHookInstallCall();
    expect(record.hookId).toBe("demo-hooks");
    expect(record.spec).toBe("@acme/demo-hooks");
    expect(record.resolvedVersion).toBe("1.2.3");
    expect(record.resolvedSpec).toBe("@acme/demo-hooks@1.2.3");
    expect(record.integrity).toBe("sha256-demo");
    expect(record.hooks).toEqual(["command-audit"]);
    expect(writeConfigFile).toHaveBeenCalledWith(installedCfg);
    expect(runtimeLogsContain("Installed hook pack: demo-hooks")).toBe(true);
  });

  it("passes force through as overwrite mode for hook-pack npm fallback installs", async () => {
    primeHookPackNpmFallback();

    await runAcknowledgedPluginsInstallCommand([
      "plugins",
      "install",
      "@acme/demo-hooks",
      "--force",
    ]);

    expect(hookNpmInstallCall().spec).toBe("@acme/demo-hooks");
    expect(hookNpmInstallCall().mode).toBe("update");
  });
});
/* oxlint-disable max-lines -- TODO: split this grandfathered oversized file. */
