// Migrate Hermes provider module implements model/runtime integration.
import fs from "node:fs/promises";
import path from "node:path";
import type { MigrationProviderContext } from "bot/plugin-sdk/plugin-entry";
import type { BotConfig } from "bot/plugin-sdk/provider-auth";
import { resolvePreferredBotTmpDir } from "bot/plugin-sdk/temp-path";

const tempRoots = new Set<string>();
const TEMP_ROOT_PREFIX = "bot-migrate-hermes-";

function noop() {}

const logger: MigrationProviderContext["logger"] = {
  debug: noop,
  error: noop,
  info: noop,
  warn: noop,
};

export async function makeTempRoot() {
  const root = await fs.mkdtemp(path.join(resolvePreferredBotTmpDir(), TEMP_ROOT_PREFIX));
  tempRoots.add(root);
  return root;
}

export async function cleanupTempRoots() {
  await Promise.all([...tempRoots].map((root) => fs.rm(root, { force: true, recursive: true })));
  tempRoots.clear();
}

export async function writeFile(filePath: string, content: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

export function makeConfigRuntime(
  config: BotConfig,
  onWrite?: (next: BotConfig) => void,
): NonNullable<MigrationProviderContext["runtime"]> {
  const commitConfig = (next: BotConfig) => {
    (Object.keys(config) as Array<keyof BotConfig>).forEach((key) => delete config[key]);
    Object.assign(config, next);
    onWrite?.(next);
  };

  return {
    config: {
      current: () => config,
      mutateConfigFile: async ({
        afterWrite,
        mutate,
      }: {
        afterWrite?: unknown;
        mutate: (draft: BotConfig, context: unknown) => Promise<unknown> | void;
      }) => {
        const next = structuredClone(config);
        const result = await mutate(next, {
          previousHash: null,
          persistedHash: null,
          snapshot: { config, raw: "", hash: null },
        });
        commitConfig(next);
        return {
          afterWrite,
          followUp: { mode: "auto", requiresRestart: false },
          nextConfig: next,
          result,
        };
      },
      replaceConfigFile: async ({
        afterWrite,
        nextConfig,
      }: {
        afterWrite?: unknown;
        nextConfig: BotConfig;
      }) => {
        commitConfig(nextConfig);
        return { afterWrite, followUp: { mode: "auto", requiresRestart: false }, nextConfig };
      },
    },
  } as NonNullable<MigrationProviderContext["runtime"]>;
}

export function makeContext(params: {
  source: string;
  stateDir: string;
  workspaceDir: string;
  config?: BotConfig;
  includeSecrets?: boolean;
  overwrite?: boolean;
  itemKinds?: string[];
  targetAgentId?: string;
  model?: NonNullable<NonNullable<BotConfig["agents"]>["defaults"]>["model"];
  reportDir?: string;
  runtime?: MigrationProviderContext["runtime"];
}): MigrationProviderContext {
  const config =
    params.config ??
    ({
      agents: {
        defaults: {
          workspace: params.workspaceDir,
          ...(params.model !== undefined ? { model: params.model } : {}),
        },
      },
    } as BotConfig);
  return {
    config,
    stateDir: params.stateDir,
    source: params.source,
    includeSecrets: params.includeSecrets,
    overwrite: params.overwrite,
    itemKinds: params.itemKinds,
    targetAgentId: params.targetAgentId,
    reportDir: params.reportDir,
    runtime: params.runtime,
    logger,
  };
}
