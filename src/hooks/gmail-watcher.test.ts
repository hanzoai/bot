import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtimeConfig = {
  account: "clawdbot@gmail.com",
  label: "INBOX",
  topic: "projects/test/topics/gog-gmail-watch",
  subscription: "gog-gmail-watch-push",
  pushToken: "push-token",
  hookToken: "hook-token",
  hookUrl: "http://127.0.0.1:18789/hooks/gmail",
  includeBody: false,
  maxBytes: 0,
  renewEveryMinutes: 720,
  serve: { bind: "127.0.0.1", port: 8788, path: "/" },
  tailscale: { mode: "off", path: "/gmail-pubsub" },
};

class MockChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  exitCode: number | null = null;
  kill = vi.fn();
}

const spawnMock = vi.fn(() => new MockChild() as unknown as ChildProcess);

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>(
    "node:child_process",
  );
  return {
    ...actual,
    spawn: spawnMock,
  };
});

const runCommandWithTimeoutMock = vi.fn(async () => ({
  code: 0,
  stdout: "",
  stderr: "",
}));

vi.mock("../agents/skills.js", () => ({
  hasBinary: () => true,
}));

vi.mock("../process/exec.js", () => ({
  runCommandWithTimeout: runCommandWithTimeoutMock,
}));

vi.mock("./gmail-setup-utils.js", () => ({
  ensureTailscaleEndpoint: vi.fn(async () => {}),
}));

vi.mock("./gmail.js", () => ({
  buildGogWatchServeArgs: () => [
    "gmail",
    "watch",
    "serve",
    "--token",
    runtimeConfig.pushToken,
    "--hook-url",
    runtimeConfig.hookUrl,
    "--hook-token",
    runtimeConfig.hookToken,
  ],
  buildGogWatchStartArgs: () => ["gmail", "watch", "start"],
  resolveGmailHookRuntimeConfig: () => ({ ok: true, value: runtimeConfig }),
}));

const { startGmailWatcher, stopGmailWatcher } = await import(
  "./gmail-watcher.js"
);

const cfg = {
  hooks: {
    enabled: true,
    gmail: { account: runtimeConfig.account },
  },
};

beforeEach(() => {
  spawnMock.mockClear();
  runCommandWithTimeoutMock.mockClear();
});

afterEach(async () => {
  await stopGmailWatcher();
  vi.useRealTimers();
});

describe("gmail watcher", () => {
  it("does not start twice when already running", async () => {
    const first = await startGmailWatcher(cfg);
    const second = await startGmailWatcher(cfg);

    expect(first.started).toBe(true);
    expect(second.started).toBe(true);
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it("restarts the gog watcher after a process error", async () => {
    vi.useFakeTimers();

    await startGmailWatcher(cfg);
    const child = spawnMock.mock.results[0]?.value as MockChild | undefined;
    expect(child).toBeDefined();
    child?.emit("error", new Error("boom"));

    expect(spawnMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(spawnMock).toHaveBeenCalledTimes(2);

    const restartChild = spawnMock.mock.results[1]?.value as
      | MockChild
      | undefined;
    const stopPromise = stopGmailWatcher();
    restartChild?.emit("exit", 0, null);
    await stopPromise;
  });
});
