import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SECRETS, writeFileLayout } from "../migrate/openclaw/test-fixtures.js";

/** `hanzo-bot migrate openclaw`, run as a person runs it: its own process, its own HOME. */
describe("hanzo-bot migrate openclaw", () => {
  let home: string;

  beforeAll(() => {
    home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "bot-migrate-e2e-")));
    writeFileLayout(path.join(home, ".openclaw"));
  });

  afterAll(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  function run(...args: string[]) {
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: home,
      USERPROFILE: home,
      NO_COLOR: "1",
      BOT_HIDE_BANNER: "1",
      TERM: "dumb",
    };
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", path.resolve("src/entry.ts"), "migrate", "openclaw", ...args],
      { cwd: process.cwd(), env, encoding: "utf8", timeout: 120_000 },
    );
    const output = `${result.stdout}${result.stderr}`;
    for (const secret of Object.values(SECRETS)) {
      expect(output).not.toContain(secret);
    }
    return { status: result.status, output, stdout: result.stdout };
  }

  it("shows the plan and writes nothing by default", () => {
    const { status, output } = run();
    expect(status, output).toBe(0);
    expect(output).toContain("OpenClaw → Hanzo Bot   ~/.openclaw → ~/.bot");
    expect(output).toMatch(/create\s+bot\.json/);
    expect(output).toMatch(/create\s+agents\/main\/agent\/auth-profiles\.json\s+anthropic:default/);
    expect(output).toContain(".env#OPENCLAW_GATEWAY_TOKEN → .env#BOT_GATEWAY_TOKEN");
    expect(output).toContain("Dry run: nothing was written.");
    expect(fs.existsSync(path.join(home, ".bot"))).toBe(false);
  });

  it("applies with --apply, then finds nothing left to do", () => {
    const applied = run("--apply");
    expect(applied.status, applied.output).toBe(0);
    expect(applied.output).toContain("The OpenClaw install at ~/.openclaw is untouched.");
    expect(fs.existsSync(path.join(home, ".bot", "bot.json"))).toBe(true);
    expect(fs.existsSync(path.join(home, ".bot", "workspace", "AGENTS.md"))).toBe(true);

    const again = run("--json");
    expect(again.status, again.output).toBe(0);
    expect(again.output).not.toContain("Invalid config");
    const plan = JSON.parse(again.stdout) as {
      items: Array<{ op: string; status?: string }>;
    };
    const moves = plan.items.filter((item) => item.op === "write" || item.op === "copy");
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((item) => item.status === "unchanged")).toBe(true);
  });

  it("names the dir it could not find", () => {
    const { status, output } = run("--from", path.join(home, "nope"));
    expect(status).not.toBe(0);
    expect(output).toContain("no OpenClaw install at");
  });
});
