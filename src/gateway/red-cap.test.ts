import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Bus } from "../infra/bus.js";
import type { Sandboxes } from "./cloud-sandbox.js";

vi.mock("../config/config.js", () => ({ loadConfig: () => ({}) }));

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "red-cap-"));
process.env.BOT_STATE_DIR = stateDir;

const { BotRuns, MAX_LIVE_RUNS_PER_ORG } = await import("./bot-runs.js");

describe("red: the per-org live-run ceiling", () => {
  it("holds against launches that arrive together", async () => {
    let leased = 0;
    const never = new Promise<never>(() => {});
    const sandboxes: Sandboxes = {
      lease: async () => {
        leased++;
        return never;
      },
      exec: async () => never,
      end: async () => {},
    };
    const bus: Bus = { publish: () => {}, close: async () => {} };
    const runs = new BotRuns({ sandboxes, bus });
    const caller = { org: "acme", bearer: "b" };
    const n = MAX_LIVE_RUNS_PER_ORG * 4;
    const results = await Promise.allSettled(
      Array.from({ length: n }, () =>
        runs.launch({ caller, bot: "main", task: "t", surface: "terminal", timeoutSec: 60 }),
      ),
    );
    const started = results.filter((r) => r.status === "fulfilled").length;
    await new Promise((r) => setTimeout(r, 50));
    // Each started run leases a sandbox on cloud's nodes.
    expect(leased).toBeLessThanOrEqual(MAX_LIVE_RUNS_PER_ORG);
    expect(started).toBeLessThanOrEqual(MAX_LIVE_RUNS_PER_ORG);
  });
});
