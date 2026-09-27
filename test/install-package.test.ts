// Install package tests pin every installer to the @hanzo/bot npm package.
// npm `bot` belongs to an unrelated publisher and npm `hanzo-bot` is unclaimed,
// so an installer that names either one unscoped runs someone else's code.
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGE = "@hanzo/bot";
const INSTALLERS = ["scripts/install.sh", "scripts/install.ps1"];

// A line that runs npm against a package: npm, npm.cmd or Invoke-NpmCommand.
const NPM_PACKAGE_CALL =
  /(?:\bnpm(?:\.cmd)?\b|Invoke-NpmCommand\b).*\b(?:install|i|add|view|info|show|uninstall|remove|rm|list|ls|pack)\b/;
// `bot` or `hanzo-bot` as a whole package argument, not the tail of `@hanzo/bot`.
const UNSCOPED_PACKAGE = /(?<![\w@/.$-])(?:bot|hanzo-bot)(?:@[^\s"'`),]*)?(?=$|[\s"'`),])/;
// A package directory built from npm's global root without the @hanzo scope.
const UNSCOPED_PATH = /(?:node_modules|\$\{?npm_root(?:%\/)?\}?"?)\/(?:bot|hanzo-bot)(?=$|[/"'\s])/;

function offendingLines(file: string, matches: (line: string) => boolean): string[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .flatMap((line, index) => (matches(line) ? [`${file}:${index + 1}: ${line.trim()}`] : []));
}

function withNpmSandbox<T>(run: (paths: { tmp: string; bin: string; calls: string }) => T): T {
  const tmp = mkdtempSync(join(tmpdir(), "bot-install-package-"));
  const bin = join(tmp, "bin");
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(tmp, "home"), { recursive: true });
  mkdirSync(join(tmp, "prefix", "lib", "node_modules"), { recursive: true });
  const fakeNpm = join(bin, "npm");
  writeFileSync(
    fakeNpm,
    [
      "#!/bin/bash",
      'printf "%s\\n" "$*" >> "$NPM_FAKE_CALLS"',
      'case "$1" in',
      "  config) printf 'null\\n'; exit 0 ;;",
      '  root) printf "%s\\n" "$NPM_FAKE_ROOT"; exit 0 ;;',
      '  prefix) printf "%s\\n" "$NPM_FAKE_PREFIX"; exit 0 ;;',
      "  view) printf '2026.6.5\\n'; exit 0 ;;",
      "esac",
      'for arg in "$@"; do',
      '  if [[ "$arg" == "install" && "${NPM_FAKE_INSTALL_FAIL:-0}" == "1" ]]; then',
      "    printf 'npm error code E404\\nnpm error 404 Not Found - GET https://registry.npmjs.org/fake\\n' >&2",
      "    exit 1",
      "  fi",
      "done",
      "exit 0",
      "",
    ].join("\n"),
  );
  chmodSync(fakeNpm, 0o755);
  try {
    return run({ tmp, bin, calls: join(tmp, "npm-calls.txt") });
  } finally {
    rmSync(tmp, { force: true, recursive: true });
  }
}

function runInstallSh(tmp: string, bin: string, calls: string, body: string[], env = {}) {
  return spawnSync(
    "bash",
    ["-c", ["set -euo pipefail", 'source "scripts/install.sh"', ...body].join("\n")],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: join(tmp, "home"),
        PATH: `${bin}:/usr/bin:/bin`,
        BASH_ENV: "",
        ENV: "",
        BOT_INSTALL_SH_NO_RUN: "1",
        NPM_FAKE_CALLS: calls,
        NPM_FAKE_ROOT: join(tmp, "prefix", "lib", "node_modules"),
        NPM_FAKE_PREFIX: join(tmp, "prefix"),
        ...env,
      },
    },
  );
}

function installCalls(calls: string): string[] {
  return readFileSync(calls, "utf8")
    .split("\n")
    .filter((line) => /\binstall\b/.test(line));
}

describe("installer npm package", () => {
  it.each(INSTALLERS)("%s names no unscoped bot package in an npm call", (file) => {
    expect(
      offendingLines(file, (line) => NPM_PACKAGE_CALL.test(line) && UNSCOPED_PACKAGE.test(line)),
    ).toEqual([]);
  });

  it.each(INSTALLERS)("%s builds no unscoped global package path", (file) => {
    expect(offendingLines(file, (line) => UNSCOPED_PATH.test(line))).toEqual([]);
  });

  it.each(INSTALLERS)("%s has no @next fallback", (file) => {
    expect(offendingLines(file, (line) => /(?:bot|hanzo-bot)@next\b/.test(line))).toEqual([]);
  });

  it("assigns only @hanzo/bot as the package name", () => {
    const sh = readFileSync("scripts/install.sh", "utf8");
    const names = [...sh.matchAll(/package_name="([^"$][^"]*)"/g)].map((match) => match[1]);
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names)).toEqual(new Set([PACKAGE]));
  });

  it("recognises a checkout by this repo's package.json name", () => {
    const { name } = JSON.parse(readFileSync("package.json", "utf8")) as { name: string };
    expect(name).toBe(PACKAGE);
    withNpmSandbox(({ tmp, bin, calls }) => {
      const checkout = join(tmp, "checkout");
      mkdirSync(checkout);
      writeFileSync(join(checkout, "package.json"), `${JSON.stringify({ name }, null, 2)}\n`);
      writeFileSync(join(checkout, "pnpm-workspace.yaml"), "packages: []\n");
      const result = runInstallSh(tmp, bin, calls, [
        `detect_bot_checkout ${JSON.stringify(checkout)}`,
      ]);
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe(checkout);
    });
  });

  it("install.sh installs @hanzo/bot@latest with no fallback when no bin appears", () => {
    withNpmSandbox(({ tmp, bin, calls }) => {
      const result = runInstallSh(tmp, bin, calls, [
        "BOT_VERSION=latest",
        "USE_BETA=0",
        "install_hanzo-bot",
      ]);
      expect(result.status).toBe(0);
      expect(readFileSync(calls, "utf8")).toContain(`view ${PACKAGE}@latest version`);
      const installs = installCalls(calls);
      expect(installs).toHaveLength(1);
      expect(installs[0]).toMatch(/ install -g @hanzo\/bot@latest$/);
      expect(readFileSync(calls, "utf8")).not.toContain("@next");
    });
  });

  it.each([
    ["BOT_VERSION", ["BOT_VERSION=2026.6.5", "USE_BETA=0", "install_hanzo-bot"]],
    ["--version", ["parse_args --version 2026.6.5", "USE_BETA=0", "install_hanzo-bot"]],
  ])("install.sh resolves %s as @hanzo/bot@<version>", (_source, body) => {
    withNpmSandbox(({ tmp, bin, calls }) => {
      const result = runInstallSh(tmp, bin, calls, body);
      expect(result.status).toBe(0);
      const installs = installCalls(calls);
      expect(installs).toHaveLength(1);
      expect(installs[0]).toMatch(/ install -g @hanzo\/bot@2026\.6\.5$/);
    });
  });

  it("install.sh fails loudly when @hanzo/bot@latest cannot install", () => {
    withNpmSandbox(({ tmp, bin, calls }) => {
      const result = runInstallSh(
        tmp,
        bin,
        calls,
        ["BOT_VERSION=latest", "USE_BETA=0", "install_hanzo-bot", "printf 'reached-end\\n'"],
        { NPM_FAKE_INSTALL_FAIL: "1" },
      );
      expect(result.status).not.toBe(0);
      expect(result.stdout).not.toContain("reached-end");
      expect(`${result.stdout}${result.stderr}`).toContain("npm error code E404");
      const installs = installCalls(calls);
      expect(installs.length).toBeGreaterThan(0);
      for (const call of installs) {
        expect(call).toMatch(/ install -g @hanzo\/bot@latest$/);
      }
      expect(readFileSync(calls, "utf8")).not.toContain("@next");
    });
  });

  it.each(INSTALLERS)("%s clones only github.com/hanzoai/bot", (file) => {
    const urls = [...readFileSync(file, "utf8").matchAll(/https:\/\/github\.com\/[^\s"']+\.git/g)];
    expect(urls.length).toBeGreaterThan(0);
    expect(new Set(urls.map((match) => match[0]))).toEqual(
      new Set(["https://github.com/hanzoai/bot.git"]),
    );
  });

  it("install.ps1 passes the scoped spec to npm quoted", () => {
    const ps1 = readFileSync("scripts/install.ps1", "utf8");
    expect(ps1).toContain('npm install -g "@hanzo/bot@$Version"');
  });
});
