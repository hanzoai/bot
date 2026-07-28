// Links plugin peer packages for local development installs.
import fs from "node:fs/promises";
import path from "node:path";
import { hasErrnoCode } from "../infra/errors.js";
import { resolveBotPackageRootSync } from "../infra/bot-root.js";

type PluginPeerLinkLogger = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
};

type RelinkManagedNpmRootResult = {
  checked: number;
  attempted: number;
  repaired: number;
  skipped: number;
};

export type BotPeerLinkAuditIssue = {
  packageName: string;
  packageDir: string;
  reason: string;
};

type AuditManagedNpmRootResult = {
  checked: number;
  broken: number;
  issues: BotPeerLinkAuditIssue[];
};

type BotPeerLinkResult = "linked" | "skipped" | "unchanged";

function readStringRecord(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const record: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string") {
      record[key] = raw;
    }
  }
  return record;
}

async function readPackagePeerDependencies(packageDir: string): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(path.join(packageDir, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { peerDependencies?: unknown };
    return readStringRecord(parsed.peerDependencies);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function listManagedNpmRootPackageDirs(npmRoot: string): Promise<string[]> {
  const nodeModulesDir = path.join(npmRoot, "node_modules");
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(nodeModulesDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const packageDirs: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === ".bin") {
      continue;
    }
    const entryPath = path.join(nodeModulesDir, entry.name);
    if (entry.name.startsWith("@")) {
      const scopedEntries = await fs
        .readdir(entryPath, { withFileTypes: true })
        .catch((error: unknown) => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return [];
          }
          throw error;
        });
      for (const scopedEntry of scopedEntries) {
        if (scopedEntry.isDirectory()) {
          packageDirs.push(path.join(entryPath, scopedEntry.name));
        }
      }
      continue;
    }
    if (!entry.name.startsWith(".")) {
      packageDirs.push(entryPath);
    }
  }
  return packageDirs.toSorted((a, b) => a.localeCompare(b));
}

async function safeRealpath(filePath: string): Promise<string | null> {
  try {
    return await fs.realpath(filePath);
  } catch {
    return null;
  }
}

function managedPackageNameFromDir(params: { npmRoot: string; packageDir: string }): string {
  return path
    .relative(path.join(params.npmRoot, "node_modules"), params.packageDir)
    .split(path.sep)
    .join("/");
}

async function auditBotPeerDependency(params: {
  hostRoot: string;
  packageDir: string;
  npmRoot?: string;
  packageName?: string;
}): Promise<BotPeerLinkAuditIssue | null> {
  const packageName =
    params.packageName ??
    (params.npmRoot
      ? managedPackageNameFromDir({
          npmRoot: params.npmRoot,
          packageDir: params.packageDir,
        })
      : path.basename(params.packageDir));
  const nodeModulesDir = path.join(params.packageDir, "node_modules");
  try {
    const existing = await fs.lstat(nodeModulesDir);
    if (!existing.isDirectory() || existing.isSymbolicLink()) {
      return {
        packageName,
        packageDir: params.packageDir,
        reason: `${nodeModulesDir} is not a real directory`,
      };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        packageName,
        packageDir: params.packageDir,
        reason: `missing ${path.join(nodeModulesDir, "bot")}`,
      };
    }
    throw error;
  }

  const linkPath = path.join(nodeModulesDir, "bot");
  const currentTarget = await safeRealpath(linkPath);
  if (!currentTarget) {
    return {
      packageName,
      packageDir: params.packageDir,
      reason: `missing ${linkPath}`,
    };
  }
  const expectedTarget = (await safeRealpath(params.hostRoot)) ?? params.hostRoot;
  if (currentTarget !== expectedTarget) {
    return {
      packageName,
      packageDir: params.packageDir,
      reason: `${linkPath} points to ${currentTarget} instead of ${expectedTarget}`,
    };
  }
  return null;
}

export async function auditBotPeerDependencyLink(params: {
  packageDir: string;
  packageName?: string;
}): Promise<BotPeerLinkAuditIssue | null> {
  const packageName = params.packageName ?? path.basename(params.packageDir);
  const hostRoot = resolveBotPackageRootSync({
    argv1: process.argv[1],
    moduleUrl: import.meta.url,
    cwd: process.cwd(),
  });
  if (!hostRoot) {
    return {
      packageName,
      packageDir: params.packageDir,
      reason: "could not locate bot package root",
    };
  }
  return await auditBotPeerDependency({
    hostRoot,
    packageDir: params.packageDir,
    packageName,
  });
}

async function ensureRealNodeModulesDir(params: {
  installedDir: string;
  logger: PluginPeerLinkLogger;
}): Promise<string | null> {
  const nodeModulesDir = path.join(params.installedDir, "node_modules");
  try {
    const existing = await fs.lstat(nodeModulesDir);
    if (!existing.isDirectory() || existing.isSymbolicLink()) {
      params.logger.warn?.(
        `Skipping bot peerDependency link because ${nodeModulesDir} is not a real directory.`,
      );
      return null;
    }
    return nodeModulesDir;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  await fs.mkdir(nodeModulesDir, { recursive: true });
  const created = await fs.lstat(nodeModulesDir);
  if (!created.isDirectory() || created.isSymbolicLink()) {
    params.logger.warn?.(
      `Skipping bot peerDependency link because ${nodeModulesDir} is not a real directory.`,
    );
    return null;
  }
  return nodeModulesDir;
}

async function linkBotPeerDependency(params: {
  hostRoot: string;
  installedDir: string;
  peerName: string;
  logger: PluginPeerLinkLogger;
}): Promise<BotPeerLinkResult> {
  const nodeModulesDir = await ensureRealNodeModulesDir({
    installedDir: params.installedDir,
    logger: params.logger,
  });
  if (!nodeModulesDir) {
    return "skipped";
  }

  const linkPath = path.join(nodeModulesDir, params.peerName);
  const expectedTarget = (await safeRealpath(params.hostRoot)) ?? params.hostRoot;
  const currentTarget = await safeRealpath(linkPath);
  if (currentTarget === expectedTarget) {
    return "unchanged";
  }

  try {
    const existing = await fs.lstat(linkPath).catch((err: unknown) => {
      if (hasErrnoCode(err, "ENOENT")) {
        return null;
      }
      throw err;
    });
    if (existing) {
      if (!existing.isSymbolicLink()) {
        if (params.peerName === "bot" && existing.isDirectory()) {
          const existingPackageName = await readPackageName(linkPath);
          if (existingPackageName === "bot") {
            await fs.rm(linkPath, { recursive: true, force: true });
            await fs.symlink(params.hostRoot, linkPath, "junction");
            params.logger.info?.(
              `Linked peerDependency "${params.peerName}" -> ${params.hostRoot}`,
            );
            return "linked";
          }
        }
        params.logger.warn?.(
          `Skipping bot peerDependency link because ${linkPath} already exists and is not a symlink.`,
        );
        return "skipped";
      }
      await fs.unlink(linkPath);
    }
    await fs.symlink(params.hostRoot, linkPath, "junction");
    params.logger.info?.(`Linked peerDependency "${params.peerName}" -> ${params.hostRoot}`);
    return "linked";
  } catch (err) {
    params.logger.warn?.(`Failed to symlink peerDependency "${params.peerName}": ${String(err)}`);
    return "skipped";
  }
}

async function readPackageName(packageDir: string): Promise<string | undefined> {
  try {
    const raw = await fs.readFile(path.join(packageDir, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { name?: unknown };
    return typeof parsed.name === "string" ? parsed.name : undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

/**
 * Symlink the host bot package for plugins that declare it as a peer.
 * Plugin package managers still own third-party dependencies; this only wires
 * the host SDK package into the plugin-local Node graph.
 */
export async function linkBotPeerDependencies(params: {
  installedDir: string;
  peerDependencies: Record<string, string>;
  logger: PluginPeerLinkLogger;
}): Promise<{ repaired: number; skipped: number }> {
  const peers = Object.keys(params.peerDependencies).filter((name) => name === "bot");
  if (peers.length === 0) {
    return { repaired: 0, skipped: 0 };
  }

  const hostRoot = resolveBotPackageRootSync({
    argv1: process.argv[1],
    moduleUrl: import.meta.url,
    cwd: process.cwd(),
  });
  if (!hostRoot) {
    params.logger.warn?.(
      "Could not locate bot package root to symlink peerDependencies; plugin may fail to resolve bot at runtime.",
    );
    return { repaired: 0, skipped: peers.length };
  }

  let repaired = 0;
  let skipped = 0;
  for (const peerName of peers) {
    const result = await linkBotPeerDependency({
      hostRoot,
      installedDir: params.installedDir,
      peerName,
      logger: params.logger,
    });
    if (result === "linked") {
      repaired += 1;
    } else if (result === "skipped") {
      skipped += 1;
    }
  }
  return { repaired, skipped };
}

export async function relinkBotPeerDependenciesInManagedNpmRoot(params: {
  npmRoot: string;
  logger: PluginPeerLinkLogger;
  onPackageReadError?: (error: unknown, packageDir: string) => void;
}): Promise<RelinkManagedNpmRootResult> {
  let checked = 0;
  let attempted = 0;
  let repaired = 0;
  let skipped = 0;
  for (const packageDir of await listManagedNpmRootPackageDirs(params.npmRoot)) {
    let peerDependencies: Record<string, string>;
    try {
      peerDependencies = await readPackagePeerDependencies(packageDir);
    } catch (error) {
      if (!params.onPackageReadError) {
        throw error;
      }
      params.onPackageReadError(error, packageDir);
      skipped += 1;
      continue;
    }
    if (!Object.hasOwn(peerDependencies, "bot")) {
      continue;
    }
    checked += 1;
    const result = await linkBotPeerDependencies({
      installedDir: packageDir,
      peerDependencies,
      logger: params.logger,
    });
    attempted += 1;
    repaired += result.repaired;
    skipped += result.skipped;
  }
  return { checked, attempted, repaired, skipped };
}

export async function auditBotPeerDependenciesInManagedNpmRoot(params: {
  npmRoot: string;
  onPackageReadError?: (error: unknown, packageDir: string) => void;
}): Promise<AuditManagedNpmRootResult> {
  const hostRoot = resolveBotPackageRootSync({
    argv1: process.argv[1],
    moduleUrl: import.meta.url,
    cwd: process.cwd(),
  });
  if (!hostRoot) {
    return { checked: 0, broken: 0, issues: [] };
  }

  let checked = 0;
  const issues: BotPeerLinkAuditIssue[] = [];
  for (const packageDir of await listManagedNpmRootPackageDirs(params.npmRoot)) {
    let peerDependencies: Record<string, string>;
    try {
      peerDependencies = await readPackagePeerDependencies(packageDir);
    } catch (error) {
      if (!params.onPackageReadError) {
        throw error;
      }
      params.onPackageReadError(error, packageDir);
      continue;
    }
    if (!Object.hasOwn(peerDependencies, "bot")) {
      continue;
    }
    checked += 1;
    const issue = await auditBotPeerDependency({
      hostRoot,
      npmRoot: params.npmRoot,
      packageDir,
    });
    if (issue) {
      issues.push(issue);
    }
  }
  return { checked, broken: issues.length, issues };
}
