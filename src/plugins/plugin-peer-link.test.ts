// Covers plugin peer linking for development installs.
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  auditBotPeerDependenciesInManagedNpmRoot,
  linkBotPeerDependencies,
  relinkBotPeerDependenciesInManagedNpmRoot,
} from "./plugin-peer-link.js";
import { cleanupTrackedTempDirs, makeTrackedTempDir } from "./test-helpers/fs-fixtures.js";

const tempDirs: string[] = [];

afterEach(() => {
  cleanupTrackedTempDirs(tempDirs);
});

function makeTempDir() {
  return makeTrackedTempDir("bot-plugin-peer-link", tempDirs);
}

describe("plugin peer links", () => {
  it("relinks bot peers in the managed npm root", async () => {
    const npmRoot = makeTempDir();
    const packageDir = path.join(npmRoot, "node_modules", "peer-plugin");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "package.json"),
      JSON.stringify({
        name: "peer-plugin",
        version: "1.0.0",
        peerDependencies: {
          bot: ">=2026.0.0",
        },
      }),
      "utf8",
    );

    const messages: string[] = [];
    const result = await relinkBotPeerDependenciesInManagedNpmRoot({
      npmRoot,
      logger: {
        info: (message) => messages.push(message),
        warn: (message) => messages.push(message),
      },
    });

    const linkPath = path.join(packageDir, "node_modules", "bot");
    expect(result).toEqual({ checked: 1, attempted: 1, repaired: 1, skipped: 0 });
    expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);
    expect(fs.realpathSync(linkPath)).toBe(fs.realpathSync(process.cwd()));
    expect(messages.join("\n")).toContain('Linked peerDependency "bot"');
  });

  it("reports one unreadable package and continues repairing its sibling", async () => {
    const npmRoot = makeTempDir();
    const unreadableDir = path.join(npmRoot, "node_modules", "bad-plugin");
    const peerDir = path.join(npmRoot, "node_modules", "peer-plugin");
    fs.mkdirSync(unreadableDir, { recursive: true });
    fs.mkdirSync(peerDir, { recursive: true });
    fs.writeFileSync(path.join(unreadableDir, "package.json"), "{", "utf8");
    fs.writeFileSync(
      path.join(peerDir, "package.json"),
      JSON.stringify({
        name: "peer-plugin",
        peerDependencies: { bot: ">=2026.0.0" },
      }),
      "utf8",
    );
    const failures: Array<{ error: unknown; packageDir: string }> = [];

    const result = await relinkBotPeerDependenciesInManagedNpmRoot({
      npmRoot,
      logger: {},
      onPackageReadError: (error, packageDir) => failures.push({ error, packageDir }),
    });

    expect(result).toEqual({ checked: 1, attempted: 1, repaired: 1, skipped: 1 });
    expect(failures).toHaveLength(1);
    expect(failures[0]?.packageDir).toBe(unreadableDir);
    expect(failures[0]?.error).toBeInstanceOf(SyntaxError);
    expect(fs.lstatSync(path.join(peerDir, "node_modules", "bot")).isSymbolicLink()).toBe(
      true,
    );
  });

  it("reports one unreadable package and continues auditing its sibling", async () => {
    const npmRoot = makeTempDir();
    const unreadableDir = path.join(npmRoot, "node_modules", "bad-plugin");
    const peerDir = path.join(npmRoot, "node_modules", "peer-plugin");
    fs.mkdirSync(unreadableDir, { recursive: true });
    fs.mkdirSync(peerDir, { recursive: true });
    fs.writeFileSync(path.join(unreadableDir, "package.json"), "{", "utf8");
    fs.writeFileSync(
      path.join(peerDir, "package.json"),
      JSON.stringify({
        name: "peer-plugin",
        peerDependencies: { bot: ">=2026.0.0" },
      }),
      "utf8",
    );
    const failures: Array<{ error: unknown; packageDir: string }> = [];

    const result = await auditBotPeerDependenciesInManagedNpmRoot({
      npmRoot,
      onPackageReadError: (error, packageDir) => failures.push({ error, packageDir }),
    });

    expect(result.checked).toBe(1);
    expect(result.broken).toBe(1);
    expect(result.issues[0]?.packageName).toBe("peer-plugin");
    expect(failures).toHaveLength(1);
    expect(failures[0]?.packageDir).toBe(unreadableDir);
  });

  it("audits missing managed npm bot peer links without relinking", async () => {
    const npmRoot = makeTempDir();
    const packageDir = path.join(npmRoot, "node_modules", "peer-plugin");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "package.json"),
      JSON.stringify({
        name: "peer-plugin",
        version: "1.0.0",
        peerDependencies: {
          bot: ">=2026.0.0",
        },
      }),
      "utf8",
    );

    const result = await auditBotPeerDependenciesInManagedNpmRoot({ npmRoot });

    const linkPath = path.join(packageDir, "node_modules", "bot");
    expect(result.checked).toBe(1);
    expect(result.broken).toBe(1);
    expect(result.issues[0]?.packageName).toBe("peer-plugin");
    expect(result.issues[0]?.reason).toContain(linkPath);
    expect(fs.existsSync(linkPath)).toBe(false);
  });

  it.runIf(process.platform !== "win32")(
    "does not follow a package-local node_modules symlink while linking bot peers",
    async () => {
      const root = makeTempDir();
      const packageDir = path.join(root, "peer-plugin");
      const outsideDir = path.join(root, "outside-node-modules");
      fs.mkdirSync(packageDir, { recursive: true });
      fs.mkdirSync(outsideDir, { recursive: true });
      fs.symlinkSync(outsideDir, path.join(packageDir, "node_modules"), "dir");

      const warnings: string[] = [];
      const result = await linkBotPeerDependencies({
        installedDir: packageDir,
        peerDependencies: {
          bot: ">=2026.0.0",
        },
        logger: {
          warn: (message) => warnings.push(message),
        },
      });

      expect(result).toEqual({ repaired: 0, skipped: 1 });
      expect(fs.existsSync(path.join(outsideDir, "bot"))).toBe(false);
      expect(warnings.join("\n")).toContain("is not a real directory");
    },
  );

  it("replaces an existing real bot package directory", async () => {
    const root = makeTempDir();
    const packageDir = path.join(root, "peer-plugin");
    const existingBotDir = path.join(packageDir, "node_modules", "bot");
    fs.mkdirSync(existingBotDir, { recursive: true });
    fs.writeFileSync(path.join(existingBotDir, "package.json"), '{"name":"bot"}', "utf8");

    const messages: string[] = [];
    const result = await linkBotPeerDependencies({
      installedDir: packageDir,
      peerDependencies: {
        bot: ">=2026.0.0",
      },
      logger: {
        info: (message) => messages.push(message),
      },
    });

    expect(result).toEqual({ repaired: 1, skipped: 0 });
    expect(fs.lstatSync(existingBotDir).isSymbolicLink()).toBe(true);
    expect(fs.realpathSync(existingBotDir)).toBe(fs.realpathSync(process.cwd()));
    expect(messages.join("\n")).toContain('Linked peerDependency "bot"');
  });

  it("does not delete an unrelated existing package directory", async () => {
    const root = makeTempDir();
    const packageDir = path.join(root, "peer-plugin");
    const existingBotDir = path.join(packageDir, "node_modules", "bot");
    fs.mkdirSync(existingBotDir, { recursive: true });
    fs.writeFileSync(
      path.join(existingBotDir, "package.json"),
      '{"name":"not-bot"}',
      "utf8",
    );

    const warnings: string[] = [];
    const result = await linkBotPeerDependencies({
      installedDir: packageDir,
      peerDependencies: {
        bot: ">=2026.0.0",
      },
      logger: {
        warn: (message) => warnings.push(message),
      },
    });

    expect(result).toEqual({ repaired: 0, skipped: 1 });
    expect(fs.existsSync(path.join(existingBotDir, "package.json"))).toBe(true);
    expect(warnings.join("\n")).toContain("already exists and is not a symlink");
  });
});
