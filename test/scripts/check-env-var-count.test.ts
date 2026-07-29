import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectEnvVarNames,
  isCountedSourcePath,
  main,
  parseBudget,
} from "../../scripts/check-env-var-count.mjs";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

describe("check-env-var-count", () => {
  it("counts production source and excludes tests and QA Lab", () => {
    expect(isCountedSourcePath("src/config/paths.ts")).toBe(true);
    expect(isCountedSourcePath("packages/api/src/index.ts")).toBe(true);
    expect(isCountedSourcePath("extensions/demo/src/index.ts")).toBe(true);
    expect(isCountedSourcePath("src/config/paths.test.ts")).toBe(false);
    expect(isCountedSourcePath("extensions/qa-lab/src/index.ts")).toBe(false);
  });

  it("collects each distinct name once", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bot-env-count-"));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "src/runtime.ts"),
      'const a = process.env.BOT_ALPHA; const b = "BOT_ALPHA BOT_BETA";\n',
    );
    fs.writeFileSync(path.join(root, "src/runtime.test.ts"), "BOT_TEST_ONLY\n");
    execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });

    expect(collectEnvVarNames(root)).toEqual(["BOT_ALPHA", "BOT_BETA"]);
    fs.rmSync(path.join(root, "src/runtime.ts"));
    expect(collectEnvVarNames(root)).toEqual([]);
  });

  it("parses exactly one integer budget", () => {
    expect(parseBudget("# count\n42\n")).toBe(42);
    expect(() => parseBudget("42\n43\n")).toThrow();
    expect(() => parseBudget("many\n")).toThrow();
  });

  it("reads staged source from the index", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bot-env-count-staged-"));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    const sourcePath = path.join(root, "src/runtime.ts");
    fs.writeFileSync(sourcePath, "process.env.BOT_STAGED;\n");
    execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["add", "src/runtime.ts"], { cwd: root, stdio: "ignore" });
    fs.writeFileSync(sourcePath, "process.env.BOT_WORKTREE;\n");

    expect(collectEnvVarNames(root, { staged: true })).toEqual(["BOT_STAGED"]);
    expect(collectEnvVarNames(root)).toEqual(["BOT_WORKTREE"]);
  });

  it("fails closed when the base ref cannot be resolved", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bot-env-count-base-"));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, "config"), { recursive: true });
    fs.writeFileSync(path.join(root, "config/env-var-count-budget.txt"), "0\n");
    execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });

    expect(() => main(["--base", "missing"], root)).toThrow(/Could not resolve/u);
  });

  it("compares against the fork budget when the base branch later shrinks", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bot-env-count-fork-"));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, "config"), { recursive: true });
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "config/env-var-count-budget.txt"), "2\n");
    fs.writeFileSync(
      path.join(root, "src/runtime.ts"),
      "process.env.BOT_ONE; process.env.BOT_TWO;\n",
    );
    execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["add", "."], { cwd: root, stdio: "ignore" });
    execFileSync(
      "git",
      ["-c", "user.name=Bot", "-c", "user.email=test@bot.local", "commit", "-m", "base"],
      { cwd: root, stdio: "ignore" },
    );
    execFileSync("git", ["branch", "release"], { cwd: root, stdio: "ignore" });
    fs.writeFileSync(path.join(root, "config/env-var-count-budget.txt"), "1\n");
    fs.writeFileSync(path.join(root, "src/runtime.ts"), "process.env.BOT_ONE;\n");
    execFileSync("git", ["add", "."], { cwd: root, stdio: "ignore" });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Bot",
        "-c",
        "user.email=test@bot.local",
        "commit",
        "-m",
        "shrink main",
      ],
      { cwd: root, stdio: "ignore" },
    );
    execFileSync("git", ["branch", "moving-main"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["checkout", "release"], { cwd: root, stdio: "ignore" });

    expect(() => main(["--base", "moving-main"], root)).not.toThrow();
  });

  it("rejects growth above the budget", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bot-env-count-grow-"));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, "config"), { recursive: true });
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "config/env-var-count-budget.txt"), "1\n");
    fs.writeFileSync(
      path.join(root, "src/runtime.ts"),
      "process.env.BOT_ONE; process.env.BOT_TWO;\n",
    );
    execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["add", "."], { cwd: root, stdio: "ignore" });
    execFileSync(
      "git",
      ["-c", "user.name=Bot", "-c", "user.email=test@bot.local", "commit", "-m", "base"],
      { cwd: root, stdio: "ignore" },
    );

    expect(() => main(["--base", "HEAD"], root)).toThrow(/exceeds budget|over budget/u);
  });

  it("passes when the count exactly matches the budget", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bot-env-count-exact-"));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, "config"), { recursive: true });
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "config/env-var-count-budget.txt"), "1\n");
    fs.writeFileSync(path.join(root, "src/runtime.ts"), "process.env.BOT_ONLY;\n");
    execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["add", "."], { cwd: root, stdio: "ignore" });
    execFileSync(
      "git",
      ["-c", "user.name=Bot", "-c", "user.email=test@bot.local", "commit", "-m", "base"],
      { cwd: root, stdio: "ignore" },
    );

    expect(() => main(["--base", "HEAD"], root)).not.toThrow();
  });

  it("rejects stale headroom after the count shrinks", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bot-env-count-tight-"));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, "config"), { recursive: true });
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "config/env-var-count-budget.txt"), "2\n");
    fs.writeFileSync(path.join(root, "src/runtime.ts"), "process.env.BOT_ONLY;\n");
    execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["add", "."], { cwd: root, stdio: "ignore" });
    execFileSync(
      "git",
      ["-c", "user.name=Bot", "-c", "user.email=test@bot.local", "commit", "-m", "base"],
      { cwd: root, stdio: "ignore" },
    );

    expect(() => main(["--base", "HEAD"], root)).toThrow(/is below budget/u);
  });
});
