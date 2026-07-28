// Package git fixture tests cover package-derived Docker git install fixtures.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { useAutoCleanupTempDirTracker } from "../helpers/temp-dir.js";

describe("package git fixture", () => {
  const tempDirs = useAutoCleanupTempDirTracker(afterEach);

  it("stages bundled ai runtime as a local file dependency", async () => {
    const root = tempDirs.make("bot-package-git-fixture-");
    writeFileSync(path.join(root, ".gitignore"), "dist/\n");
    mkdirSync(path.join(root, "node_modules", "@bot", "ai"), { recursive: true });
    writeFileSync(
      path.join(root, "package.json"),
      `${JSON.stringify(
        {
          dependencies: { "@hanzo/bot-ai": "2026.6.11", chalk: "5.6.2" },
          bundleDependencies: ["@hanzo/bot-ai", "chalk"],
        },
        null,
        2,
      )}\n`,
    );
    writeFileSync(
      path.join(root, "node_modules", "@bot", "ai", "package.json"),
      `${JSON.stringify({ name: "@hanzo/bot-ai", version: "2026.6.11" })}\n`,
    );

    const result = spawnSync(
      process.execPath,
      ["scripts/e2e/lib/package-git-fixture.mjs", "prepare", root],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(readFileSync(path.join(root, ".gitignore"), "utf8").split(/\r?\n/u)).toEqual(
      expect.arrayContaining(["dist/", "node_modules", "**/node_modules/", "pnpm-lock.yaml"]),
    );
    const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    expect(packageJson.dependencies["@hanzo/bot-ai"]).toBe("file:.bot-fixture/packages/ai");
    expect(packageJson.bundleDependencies).toEqual(["chalk"]);
    expect(
      JSON.parse(
        readFileSync(
          path.join(root, ".bot-fixture", "packages", "ai", "package.json"),
          "utf8",
        ),
      ).name,
    ).toBe("@hanzo/bot-ai");

    mkdirSync(path.join(root, "node_modules", "chalk"), { recursive: true });
    writeFileSync(path.join(root, "node_modules", "chalk", "package.json"), "{}\n");
    mkdirSync(path.join(root, ".bot-fixture", "packages", "ai", "node_modules", "zod"), {
      recursive: true,
    });
    writeFileSync(
      path.join(root, ".bot-fixture", "packages", "ai", "node_modules", "zod", "package.json"),
      "{}\n",
    );
    writeFileSync(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    expect(spawnSync("git", ["init", "-q", root], { encoding: "utf8" }).status).toBe(0);
    expect(spawnSync("git", ["-C", root, "add", "-A"], { encoding: "utf8" }).status).toBe(0);
    const staged = spawnSync("git", ["-C", root, "diff", "--cached", "--name-only"], {
      encoding: "utf8",
    });
    expect(staged.status).toBe(0);
    expect(staged.stdout).not.toContain("node_modules");
    expect(staged.stdout).not.toContain("pnpm-lock.yaml");
  });
});
