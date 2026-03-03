import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MANIFEST_KEY } from "../compat/legacy-names.js";
import {
  extractArchive,
  fileExists,
  readJsonFile,
  resolveArchiveKind,
  resolvePackedRootDir,
} from "../infra/archive.js";
import { installPackageDir } from "../infra/install-package-dir.js";
import { resolveSafeInstallDir, unscopedPackageName } from "../infra/install-safe-path.js";
import { validateRegistryNpmSpec } from "../infra/npm-registry-spec.js";
import { runCommandWithTimeout } from "../process/exec.js";
import { CONFIG_DIR, resolveUserPath } from "../utils.js";
import { parseFrontmatter } from "./frontmatter.js";

export type HookInstallLogger = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
};

type HookPackageManifest = {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
} & Partial<Record<typeof MANIFEST_KEY, { hooks?: string[] }>>;

export type InstallHooksResult =
  | {
      ok: true;
      hookPackId: string;
      hooks: string[];
      targetDir: string;
      version?: string;
    }
  | { ok: false; error: string };

const defaultLogger: HookInstallLogger = {};

type HookInstallForwardParams = {
  hooksDir?: string;
  timeoutMs?: number;
  logger?: HookInstallLogger;
  mode?: "install" | "update";
  dryRun?: boolean;
  expectedHookPackId?: string;
};

type HookPackageInstallParams = { packageDir: string } & HookInstallForwardParams;
type HookArchiveInstallParams = { archivePath: string } & HookInstallForwardParams;
type HookPathInstallParams = { path: string } & HookInstallForwardParams;

function buildHookInstallForwardParams(params: HookInstallForwardParams): HookInstallForwardParams {
  return {
    hooksDir: params.hooksDir,
    timeoutMs: params.timeoutMs,
    logger: params.logger,
    mode: params.mode,
    dryRun: params.dryRun,
    expectedHookPackId: params.expectedHookPackId,
  };
}

function validateHookId(hookId: string): string | null {
  if (!hookId) {
    return "invalid hook name: missing";
  }
  if (hookId === "." || hookId === "..") {
    return "invalid hook name: reserved path segment";
  }
  if (hookId.includes("/") || hookId.includes("\\")) {
    return "invalid hook name: path separators not allowed";
  }
  return null;
}

export function resolveHookInstallDir(hookId: string, hooksDir?: string): string {
  const hooksBase = hooksDir ? resolveUserPath(hooksDir) : path.join(CONFIG_DIR, "hooks");
  const hookIdError = validateHookId(hookId);
  if (hookIdError) {
    throw new Error(hookIdError);
  }
  const targetDirResult = resolveSafeInstallDir({
    baseDir: hooksBase,
    id: hookId,
    invalidNameMessage: "invalid hook name: path traversal detected",
  });
  if (!targetDirResult.ok) {
    throw new Error(targetDirResult.error);
  }
  return targetDirResult.path;
}

async function ensureBotHooks(manifest: HookPackageManifest) {
  const hooks = manifest[MANIFEST_KEY]?.hooks;
  if (!Array.isArray(hooks)) {
    throw new Error("package.json missing bot.hooks");
  }
  const list = hooks.map((e) => (typeof e === "string" ? e.trim() : "")).filter(Boolean);
  if (list.length === 0) {
    throw new Error("package.json bot.hooks is empty");
  }
  return list;
}

function resolveHookInstallModeOptions(params: {
  logger?: HookInstallLogger;
  mode?: "install" | "update";
  dryRun?: boolean;
}): { logger: HookInstallLogger; mode: "install" | "update"; dryRun: boolean } {
  return {
    logger: params.logger ?? defaultLogger,
    mode: params.mode ?? "install",
    dryRun: params.dryRun ?? false,
  };
}

function resolveTimedHookInstallModeOptions(params: {
  logger?: HookInstallLogger;
  timeoutMs?: number;
  mode?: "install" | "update";
  dryRun?: boolean;
}): { logger: HookInstallLogger; timeoutMs: number; mode: "install" | "update"; dryRun: boolean } {
  return {
    ...resolveHookInstallModeOptions(params),
    timeoutMs: params.timeoutMs ?? 120_000,
  };
}

async function withTempDir<T>(prefix: string, fn: (tmpDir: string) => Promise<T>): Promise<T> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await fn(tmpDir);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function resolveInstallTargetDir(
  id: string,
  hooksDir?: string,
): Promise<{ ok: true; targetDir: string } | { ok: false; error: string }> {
  const baseHooksDir = hooksDir ? resolveUserPath(hooksDir) : path.join(CONFIG_DIR, "hooks");
  return await resolveCanonicalInstallTarget({
    baseDir: baseHooksDir,
    id,
    invalidNameMessage: "invalid hook name: path traversal detected",
    boundaryLabel: "hooks directory",
  });
}

async function resolveAvailableHookInstallTarget(params: {
  id: string;
  hooksDir?: string;
  mode: "install" | "update";
  alreadyExistsError: (targetDir: string) => string;
}): Promise<{ ok: true; targetDir: string } | { ok: false; error: string }> {
  const targetDirResult = await resolveInstallTargetDir(params.id, params.hooksDir);
  if (!targetDirResult.ok) {
    return targetDirResult;
  }
  const targetDir = targetDirResult.targetDir;
  const availability = await ensureInstallTargetAvailable({
    mode: params.mode,
    targetDir,
    alreadyExistsError: params.alreadyExistsError(targetDir),
  });
  if (!availability.ok) {
    return availability;
  }
  return { ok: true, targetDir };
}

async function installFromResolvedHookDir(
  resolvedDir: string,
  params: HookInstallForwardParams,
): Promise<InstallHooksResult> {
  const manifestPath = path.join(resolvedDir, "package.json");
  if (await fileExists(manifestPath)) {
    return await installHookPackageFromDir({
      packageDir: resolvedDir,
      hooksDir: params.hooksDir,
      timeoutMs: params.timeoutMs,
      logger: params.logger,
      mode: params.mode,
      dryRun: params.dryRun,
      expectedHookPackId: params.expectedHookPackId,
    });
  }
  return await installHookFromDir({
    hookDir: resolvedDir,
    hooksDir: params.hooksDir,
    logger: params.logger,
    mode: params.mode,
    dryRun: params.dryRun,
    expectedHookPackId: params.expectedHookPackId,
  });
}

async function resolveHookNameFromDir(hookDir: string): Promise<string> {
  const hookMdPath = path.join(hookDir, "HOOK.md");
  if (!(await fileExists(hookMdPath))) {
    throw new Error(`HOOK.md missing in ${hookDir}`);
  }
  const raw = await fs.readFile(hookMdPath, "utf-8");
  const frontmatter = parseFrontmatter(raw);
  return frontmatter.name || path.basename(hookDir);
}

async function validateHookDir(hookDir: string): Promise<void> {
  const hookMdPath = path.join(hookDir, "HOOK.md");
  if (!(await fileExists(hookMdPath))) {
    throw new Error(`HOOK.md missing in ${hookDir}`);
  }

  const handlerCandidates = ["handler.ts", "handler.js", "index.ts", "index.js"];
  const hasHandler = await Promise.all(
    handlerCandidates.map(async (candidate) => fileExists(path.join(hookDir, candidate))),
  ).then((results) => results.some(Boolean));

  if (!hasHandler) {
    throw new Error(`handler.ts/handler.js/index.ts/index.js missing in ${hookDir}`);
  }
}

async function installHookPackageFromDir(params: {
  packageDir: string;
  hooksDir?: string;
  timeoutMs?: number;
  logger?: HookInstallLogger;
  mode?: "install" | "update";
  dryRun?: boolean;
  expectedHookPackId?: string;
}): Promise<InstallHooksResult> {
  const { logger, timeoutMs, mode, dryRun } = resolveTimedHookInstallModeOptions(params);

  const manifestPath = path.join(params.packageDir, "package.json");
  if (!(await fileExists(manifestPath))) {
    return { ok: false, error: "package.json missing" };
  }

  let manifest: HookPackageManifest;
  try {
    manifest = await readJsonFile<HookPackageManifest>(manifestPath);
  } catch (err) {
    return { ok: false, error: `invalid package.json: ${String(err)}` };
  }

  let hookEntries: string[];
  try {
    hookEntries = await ensureBotHooks(manifest);
  } catch (err) {
    return { ok: false, error: String(err) };
  }

  const pkgName = typeof manifest.name === "string" ? manifest.name : "";
  const hookPackId = pkgName ? unscopedPackageName(pkgName) : path.basename(params.packageDir);
  const hookIdError = validateHookId(hookPackId);
  if (hookIdError) {
    return { ok: false, error: hookIdError };
  }
  if (params.expectedHookPackId && params.expectedHookPackId !== hookPackId) {
    return {
      ok: false,
      error: `hook pack id mismatch: expected ${params.expectedHookPackId}, got ${hookPackId}`,
    };
  }

  const target = await resolveAvailableHookInstallTarget({
    id: hookPackId,
    hooksDir: params.hooksDir,
    mode,
    alreadyExistsError: (targetDir) => `hook pack already exists: ${targetDir} (delete it first)`,
  });
  if (!target.ok) {
    return target;
  }
  const targetDir = target.targetDir;

  const resolvedHooks = [] as string[];
  for (const entry of hookEntries) {
    const hookDir = path.resolve(params.packageDir, entry);
    await validateHookDir(hookDir);
    const hookName = await resolveHookNameFromDir(hookDir);
    resolvedHooks.push(hookName);
  }

  if (dryRun) {
    return {
      ok: true,
      hookPackId,
      hooks: resolvedHooks,
      targetDir,
      version: typeof manifest.version === "string" ? manifest.version : undefined,
    };
  }

  const installRes = await installPackageDirWithManifestDeps({
    sourceDir: params.packageDir,
    targetDir,
    mode,
    timeoutMs,
    logger,
    copyErrorPrefix: "failed to copy hook pack",
    depsLogMessage: "Installing hook pack dependencies…",
    manifestDependencies: manifest.dependencies,
  });
  if (!installRes.ok) {
    return installRes;
  }

  return {
    ok: true,
    hookPackId,
    hooks: resolvedHooks,
    targetDir,
    version: typeof manifest.version === "string" ? manifest.version : undefined,
  };
}

async function installHookFromDir(params: {
  hookDir: string;
  hooksDir?: string;
  logger?: HookInstallLogger;
  mode?: "install" | "update";
  dryRun?: boolean;
  expectedHookPackId?: string;
}): Promise<InstallHooksResult> {
  const { logger, mode, dryRun } = resolveHookInstallModeOptions(params);

  await validateHookDir(params.hookDir);
  const hookName = await resolveHookNameFromDir(params.hookDir);
  const hookIdError = validateHookId(hookName);
  if (hookIdError) {
    return { ok: false, error: hookIdError };
  }

  if (params.expectedHookPackId && params.expectedHookPackId !== hookName) {
    return {
      ok: false,
      error: `hook id mismatch: expected ${params.expectedHookPackId}, got ${hookName}`,
    };
  }

  const target = await resolveAvailableHookInstallTarget({
    id: hookName,
    hooksDir: params.hooksDir,
    mode,
    alreadyExistsError: (targetDir) => `hook already exists: ${targetDir} (delete it first)`,
  });
  if (!target.ok) {
    return target;
  }
  const targetDir = target.targetDir;

  if (dryRun) {
    return { ok: true, hookPackId: hookName, hooks: [hookName], targetDir };
  }

  const installRes = await installPackageDir({
    sourceDir: params.hookDir,
    targetDir,
    mode,
    timeoutMs: 120_000,
    logger,
    copyErrorPrefix: "failed to copy hook",
    hasDeps: false,
    depsLogMessage: "Installing hook dependencies…",
  });
  if (!installRes.ok) {
    return installRes;
  }

  return { ok: true, hookPackId: hookName, hooks: [hookName], targetDir };
}

export async function installHooksFromArchive(
  params: HookArchiveInstallParams,
): Promise<InstallHooksResult> {
  const logger = params.logger ?? defaultLogger;
  const timeoutMs = params.timeoutMs ?? 120_000;

  const archivePath = resolveUserPath(params.archivePath);
  if (!(await fileExists(archivePath))) {
    return { ok: false, error: `archive not found: ${archivePath}` };
  }

  if (!resolveArchiveKind(archivePath)) {
    return { ok: false, error: `unsupported archive: ${archivePath}` };
  }

  return await withTempDir("bot-hook-", async (tmpDir) => {
    const extractDir = path.join(tmpDir, "extract");
    await fs.mkdir(extractDir, { recursive: true });

    logger.info?.(`Extracting ${archivePath}…`);
    try {
      await extractArchive({ archivePath, destDir: extractDir, timeoutMs, logger });
    } catch (err) {
      return { ok: false, error: `failed to extract archive: ${String(err)}` };
    }

    let rootDir = "";
    try {
      rootDir = await resolvePackedRootDir(extractDir);
    } catch (err) {
      return { ok: false, error: String(err) };
    }

    const manifestPath = path.join(rootDir, "package.json");
    if (await fileExists(manifestPath)) {
      return await installHookPackageFromDir({
        packageDir: rootDir,
        hooksDir: params.hooksDir,
        timeoutMs,
        logger,
        mode: params.mode,
        dryRun: params.dryRun,
        expectedHookPackId: params.expectedHookPackId,
      });
    }

    return await installHookFromDir({
      hookDir: rootDir,
      hooksDir: params.hooksDir,
      logger,
      mode: params.mode,
      dryRun: params.dryRun,
      expectedHookPackId: params.expectedHookPackId,
    });
  });
}

export async function installHooksFromNpmSpec(params: {
  spec: string;
  hooksDir?: string;
  timeoutMs?: number;
  logger?: HookInstallLogger;
  mode?: "install" | "update";
  dryRun?: boolean;
  expectedHookPackId?: string;
}): Promise<InstallHooksResult> {
  const { logger, timeoutMs, mode, dryRun } = resolveTimedHookInstallModeOptions(params);
  const expectedHookPackId = params.expectedHookPackId;
  const spec = params.spec;

  return await withTempDir("bot-hook-pack-", async (tmpDir) => {
    logger.info?.(`Downloading ${spec}…`);
    const res = await runCommandWithTimeout(["npm", "pack", spec, "--ignore-scripts"], {
      timeoutMs: Math.max(timeoutMs, 300_000),
      cwd: tmpDir,
      env: {
        COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
        NPM_CONFIG_IGNORE_SCRIPTS: "true",
      },
    });
    if (res.code !== 0) {
      return { ok: false, error: `npm pack failed: ${res.stderr.trim() || res.stdout.trim()}` };
    }

    const packed = (res.stdout || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .pop();
    if (!packed) {
      return { ok: false, error: "npm pack produced no archive" };
    }

    const archivePath = path.join(tmpDir, packed);
    return await installHooksFromArchive({
      archivePath,
      hooksDir: params.hooksDir,
      timeoutMs,
      logger,
      mode,
      dryRun,
      expectedHookPackId,
    });
  });
}

export async function installHooksFromPath(params: {
  path: string;
  hooksDir?: string;
  timeoutMs?: number;
  logger?: HookInstallLogger;
  mode?: "install" | "update";
  dryRun?: boolean;
  expectedHookPackId?: string;
}): Promise<InstallHooksResult> {
  const resolved = resolveUserPath(params.path);
  if (!(await fileExists(resolved))) {
    return { ok: false, error: `path not found: ${resolved}` };
  }

  const stat = await fs.stat(resolved);
  if (stat.isDirectory()) {
    return await installFromResolvedHookDir(resolved, forwardParams);
  }

  if (!resolveArchiveKind(resolved)) {
    return { ok: false, error: `unsupported hook file: ${resolved}` };
  }

  return await installHooksFromArchive({
    archivePath: resolved,
    ...forwardParams,
  });
}
