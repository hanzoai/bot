// Browser tests cover server context.ensure browser available.waits for cdp ready plugin behavior.
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import "./server-context.chrome-test-harness.js";
import { PROFILE_ATTACH_RETRY_TIMEOUT_MS } from "./cdp-timeouts.js";
import type { RunningChrome } from "./chrome.js";
import * as chromeModule from "./chrome.js";
import { BROWSER_ERROR_REASONS, BrowserProfileUnavailableError } from "./errors.js";
import { createBrowserRouteContext } from "./server-context.js";
import { beginProfileTransition, getProfileLifecycle } from "./server-context.lifecycle.js";
import { makeBrowserServerState, mockLaunchedChrome } from "./server-context.test-harness.js";

const PROFILE_HTTP_REACHABILITY_TIMEOUT_MS = 300;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fakeRunning(pid: number): RunningChrome {
  return {
    pid,
    exe: { kind: "chromium", path: "/usr/bin/chromium" },
    userDataDir: "/tmp/bot-test",
    cdpPort: 18800,
    startedAt: Date.now(),
    proc: new EventEmitter() as unknown as ChildProcessWithoutNullStreams,
  };
}

function setupEnsureBrowserAvailableHarness() {
  vi.useFakeTimers();

  const launchBotChrome = vi.mocked(chromeModule.launchBotChrome);
  const stopBotChrome = vi.mocked(chromeModule.stopBotChrome);
  const isChromeReachable = vi.mocked(chromeModule.isChromeReachable);
  const isChromeCdpOwnedByPid = vi.mocked(chromeModule.isChromeCdpOwnedByPid);
  const isChromeCdpReady = vi.mocked(chromeModule.isChromeCdpReady);
  isChromeReachable.mockResolvedValue(false);
  isChromeCdpOwnedByPid.mockResolvedValue(true);

  const state = makeBrowserServerState();
  const ctx = createBrowserRouteContext({ getState: () => state });
  const profile = ctx.forProfile("bot");

  return {
    launchBotChrome,
    stopBotChrome,
    isChromeCdpOwnedByPid,
    isChromeCdpReady,
    profile,
    state,
  };
}

function createAttachOnlyLoopbackProfile(cdpUrl: string) {
  const state = makeBrowserServerState({
    profile: {
      name: "manual-cdp",
      cdpUrl,
      cdpHost: "127.0.0.1",
      cdpIsLoopback: true,
      cdpPort: 9222,
      color: "#00AA00",
      driver: "bot",
      headless: false,
      attachOnly: true,
    },
    resolvedOverrides: {
      defaultProfile: "manual-cdp",
      ssrfPolicy: {},
    },
  });
  const ctx = createBrowserRouteContext({ getState: () => state });
  return { profile: ctx.forProfile("manual-cdp"), state };
}

function requireFirstLaunchOptions(launchBotChrome: {
  mock: { calls: unknown[][] };
}): unknown {
  const [call] = launchBotChrome.mock.calls;
  if (!call) {
    throw new Error("expected Chrome launch call");
  }
  return call[2];
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("browser server-context ensureBrowserAvailable", () => {
  it("rejects and cleans a deferred launch before stop returns, then allows restart", async () => {
    const { launchBotChrome, stopBotChrome, isChromeCdpReady, profile, state } =
      setupEnsureBrowserAvailableHarness();
    const deferredLaunch = deferred<RunningChrome>();
    const launchEntered = deferred<void>();
    const late = fakeRunning(1201);
    const replacement = fakeRunning(1202);
    launchBotChrome
      .mockImplementationOnce(async () => {
        launchEntered.resolve();
        return await deferredLaunch.promise;
      })
      .mockResolvedValueOnce(replacement);
    isChromeCdpReady.mockResolvedValue(true);

    const start = profile.ensureBrowserAvailable();
    await launchEntered.promise;
    expect(launchBotChrome).toHaveBeenCalledTimes(1);
    const stopping = profile.stopRunningBrowser();
    deferredLaunch.resolve(late);

    await expect(start).rejects.toThrow(/lifecycle changed|superseded/i);
    await expect(stopping).resolves.toEqual({ stopped: true });
    expect(stopBotChrome).toHaveBeenCalledTimes(1);
    expect(stopBotChrome).toHaveBeenCalledWith(late);
    expect(state.profiles.get("bot")?.running).toBeNull();
    const runtime = state.profiles.get("bot");
    expect(runtime ? getProfileLifecycle(runtime).handles.size : 0).toBe(0);

    await expect(profile.ensureBrowserAvailable()).resolves.toBeUndefined();
    expect(state.profiles.get("bot")?.running).toBe(replacement);
  });

  it("does not count canceled managed starts toward the launch cooldown", async () => {
    const { launchBotChrome, stopBotChrome, isChromeCdpReady, profile, state } =
      setupEnsureBrowserAvailableHarness();
    isChromeCdpReady.mockResolvedValue(true);
    const runtime = state.profiles.get("bot");
    if (!runtime) {
      throw new Error("expected bot runtime");
    }
    const previousFailure = {
      consecutiveFailures: 2,
      lastFailureAt: Date.now(),
      lastError: "earlier launch failure",
    };
    runtime.managedLaunchFailure = previousFailure;
    const launchEntered = deferred<void>();
    const deferredLaunch = deferred<RunningChrome>();
    launchBotChrome.mockImplementationOnce(async () => {
      launchEntered.resolve();
      return await deferredLaunch.promise;
    });

    const start = profile.ensureBrowserAvailable();
    await launchEntered.promise;
    const canceling = beginProfileTransition({
      state,
      runtime,
      reason: "profile config changed",
    });
    deferredLaunch.resolve(fakeRunning(1300));

    await expect(start).rejects.toThrow(/lifecycle changed|superseded/i);
    await expect(canceling).resolves.toEqual({ stopped: true });
    expect(runtime.managedLaunchFailure).toBe(previousFailure);

    const replacement = fakeRunning(1400);
    launchBotChrome.mockResolvedValueOnce(replacement);
    await expect(profile.ensureBrowserAvailable()).resolves.toBeUndefined();

    expect(launchBotChrome).toHaveBeenCalledTimes(2);
    expect(stopBotChrome).toHaveBeenCalledTimes(1);
    expect(state.profiles.get("bot")?.running).toBe(replacement);
    expect(state.profiles.get("bot")?.managedLaunchFailure).toBeUndefined();
  });

  it("waits for CDP readiness after launching to avoid follow-up PortInUseError races (#21149)", async () => {
    const { launchBotChrome, stopBotChrome, isChromeCdpReady, profile } =
      setupEnsureBrowserAvailableHarness();
    isChromeCdpReady.mockResolvedValueOnce(false).mockResolvedValue(true);
    mockLaunchedChrome(launchBotChrome, 123);

    const promise = profile.ensureBrowserAvailable();
    await vi.advanceTimersByTimeAsync(100);
    await expect(promise).resolves.toBeUndefined();

    expect(launchBotChrome).toHaveBeenCalledTimes(1);
    expect(isChromeCdpReady).toHaveBeenCalled();
    expect(stopBotChrome).not.toHaveBeenCalled();
  });

  it("stops launched chrome when CDP readiness never arrives", async () => {
    const { launchBotChrome, stopBotChrome, isChromeCdpReady, profile } =
      setupEnsureBrowserAvailableHarness();
    isChromeCdpReady.mockResolvedValue(false);
    mockLaunchedChrome(launchBotChrome, 321);

    const promise = profile.ensureBrowserAvailable();
    const rejected = expect(promise).rejects.toThrow("not reachable after start");
    const diagnosticRejected = expect(promise).rejects.toThrow(
      "CDP diagnostic: websocket_health_command_timeout; mock CDP diagnostic.",
    );
    await vi.advanceTimersByTimeAsync(8100);
    await rejected;
    await diagnosticRejected;

    expect(launchBotChrome).toHaveBeenCalledTimes(1);
    expect(stopBotChrome).toHaveBeenCalledTimes(1);
  });

  it("rejects a foreign listener that wins the managed CDP port after spawn", async () => {
    const {
      launchBotChrome,
      stopBotChrome,
      isChromeCdpOwnedByPid,
      isChromeCdpReady,
      profile,
      state,
    } = setupEnsureBrowserAvailableHarness();
    const launched = fakeRunning(1234);
    launchBotChrome.mockResolvedValue(launched);
    isChromeCdpReady.mockResolvedValue(true);
    isChromeCdpOwnedByPid.mockResolvedValue(false);

    await expect(profile.ensureBrowserAvailable()).rejects.toThrow("did not own its CDP endpoint");

    expect(isChromeCdpOwnedByPid).toHaveBeenCalledWith(
      "http://127.0.0.1:18800",
      launched.pid,
      expect.any(Number),
      undefined,
    );
    expect(stopBotChrome).toHaveBeenCalledExactlyOnceWith(launched);
    expect(state.profiles.get("bot")?.running).toBeNull();
  });

  it("does not adopt a managed child that exits during the ownership probe", async () => {
    const {
      launchBotChrome,
      stopBotChrome,
      isChromeCdpOwnedByPid,
      isChromeCdpReady,
      profile,
      state,
    } = setupEnsureBrowserAvailableHarness();
    const launched = fakeRunning(1235);
    const ownershipEntered = deferred<void>();
    const ownership = deferred<boolean>();
    launchBotChrome.mockResolvedValue(launched);
    isChromeCdpReady.mockResolvedValue(true);
    isChromeCdpOwnedByPid.mockImplementationOnce(async () => {
      ownershipEntered.resolve();
      return await ownership.promise;
    });

    const start = profile.ensureBrowserAvailable();
    await ownershipEntered.promise;
    launched.proc.emit("exit", 0, null);
    ownership.resolve(true);

    await expect(start).rejects.toThrow("exited before adoption");
    const runtime = state.profiles.get("bot");
    expect(runtime?.running).toBeNull();
    expect(runtime ? getProfileLifecycle(runtime).handles.size : 0).toBe(0);
    expect(stopBotChrome).toHaveBeenCalledExactlyOnceWith(launched);
  });

  it("uses configured local CDP readiness timeout after launching", async () => {
    const { launchBotChrome, stopBotChrome, isChromeCdpReady, profile, state } =
      setupEnsureBrowserAvailableHarness();
    state.resolved.localCdpReadyTimeoutMs = 250;
    isChromeCdpReady.mockResolvedValue(false);
    mockLaunchedChrome(launchBotChrome, 322);

    const promise = profile.ensureBrowserAvailable();
    const rejected = expect(promise).rejects.toThrow("not reachable after start");
    await vi.advanceTimersByTimeAsync(300);
    await rejected;

    expect(launchBotChrome).toHaveBeenCalledTimes(1);
    expect(stopBotChrome).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent lazy-start calls to prevent PortInUseError", async () => {
    const { launchBotChrome, stopBotChrome, isChromeCdpReady, profile } =
      setupEnsureBrowserAvailableHarness();
    isChromeCdpReady.mockResolvedValue(true);
    mockLaunchedChrome(launchBotChrome, 456);

    const first = profile.ensureBrowserAvailable();
    const second = profile.ensureBrowserAvailable();
    await vi.advanceTimersByTimeAsync(100);
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);

    expect(launchBotChrome).toHaveBeenCalledTimes(1);
    expect(stopBotChrome).not.toHaveBeenCalled();
  });

  it("deduplicates concurrent lazy-start calls across fresh profile contexts", async () => {
    const { launchBotChrome, stopBotChrome, isChromeCdpReady, state } =
      setupEnsureBrowserAvailableHarness();
    isChromeCdpReady.mockResolvedValue(true);
    mockLaunchedChrome(launchBotChrome, 457);

    const firstCtx = createBrowserRouteContext({ getState: () => state });
    const secondCtx = createBrowserRouteContext({ getState: () => state });
    const first = firstCtx.forProfile("bot").ensureBrowserAvailable();
    const second = secondCtx.forProfile("bot").ensureBrowserAvailable();
    await vi.advanceTimersByTimeAsync(100);
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);

    expect(launchBotChrome).toHaveBeenCalledTimes(1);
    expect(stopBotChrome).not.toHaveBeenCalled();
  });

  it("passes request-local headless override to initial launch", async () => {
    const { launchBotChrome, stopBotChrome, isChromeCdpReady, profile } =
      setupEnsureBrowserAvailableHarness();
    isChromeCdpReady.mockResolvedValue(true);
    mockLaunchedChrome(launchBotChrome, 654);

    const promise = profile.ensureBrowserAvailable({ headless: true });
    await vi.advanceTimersByTimeAsync(100);
    await expect(promise).resolves.toBeUndefined();

    expect(launchBotChrome).toHaveBeenCalledTimes(1);
    expect(requireFirstLaunchOptions(launchBotChrome)).toEqual(
      expect.objectContaining({ headlessOverride: true, signal: expect.any(AbortSignal) }),
    );
    expect(stopBotChrome).not.toHaveBeenCalled();
  });

  it("passes request-local headless override to the owned restart path", async () => {
    const { launchBotChrome, stopBotChrome, isChromeCdpReady, profile, state } =
      setupEnsureBrowserAvailableHarness();
    const isChromeReachable = vi.mocked(chromeModule.isChromeReachable);
    const existingProc = new EventEmitter() as unknown as ChildProcessWithoutNullStreams;
    const runtime = state.profiles.get("bot");
    if (!runtime) {
      throw new Error("expected bot runtime");
    }
    runtime.running = {
      pid: 111,
      exe: { kind: "chromium", path: "/usr/bin/chromium" },
      userDataDir: "/tmp/bot-test",
      cdpPort: 18800,
      startedAt: Date.now(),
      proc: existingProc,
    };
    isChromeReachable.mockResolvedValueOnce(true).mockResolvedValue(false);
    isChromeCdpReady.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mockLaunchedChrome(launchBotChrome, 987);

    await expect(profile.ensureBrowserAvailable({ headless: true })).resolves.toBeUndefined();

    expect(stopBotChrome).toHaveBeenCalledTimes(1);
    expect(launchBotChrome).toHaveBeenCalledTimes(1);
    expect(requireFirstLaunchOptions(launchBotChrome)).toEqual(
      expect.objectContaining({ headlessOverride: true, signal: expect.any(AbortSignal) }),
    );
  });

  it("does not share inflight lazy-start promises across different headless overrides", async () => {
    const { launchBotChrome, isChromeCdpReady, profile } =
      setupEnsureBrowserAvailableHarness();
    const isChromeReachable = vi.mocked(chromeModule.isChromeReachable);
    isChromeReachable.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    isChromeCdpReady.mockResolvedValue(true);
    mockLaunchedChrome(launchBotChrome, 456);

    const first = profile.ensureBrowserAvailable();
    const second = profile.ensureBrowserAvailable({ headless: true });
    await vi.advanceTimersByTimeAsync(100);
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);

    expect(launchBotChrome).toHaveBeenCalledTimes(1);
    expect(isChromeReachable.mock.calls.length).toBeGreaterThan(1);
  });

  it("clears the concurrent lazy-start guard after launch failure", async () => {
    const { launchBotChrome, stopBotChrome, isChromeCdpReady, profile } =
      setupEnsureBrowserAvailableHarness();
    isChromeCdpReady.mockResolvedValue(true);
    launchBotChrome.mockRejectedValueOnce(
      new Error("PortInUseError: listen EADDRINUSE 127.0.0.1:18800"),
    );

    const first = profile.ensureBrowserAvailable();
    const second = profile.ensureBrowserAvailable();
    await expect(Promise.all([first, second])).rejects.toThrow("PortInUseError");

    mockLaunchedChrome(launchBotChrome, 789);
    const retry = profile.ensureBrowserAvailable();
    await vi.advanceTimersByTimeAsync(100);
    await expect(retry).resolves.toBeUndefined();

    expect(launchBotChrome).toHaveBeenCalledTimes(2);
    expect(stopBotChrome).not.toHaveBeenCalled();
  });

  it("cools down repeated managed Chrome launch failures across route contexts", async () => {
    const { launchBotChrome, stopBotChrome, isChromeCdpReady, state } =
      setupEnsureBrowserAvailableHarness();
    isChromeCdpReady.mockResolvedValue(true);
    launchBotChrome.mockRejectedValue(new Error("Failed to start Chrome CDP"));

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const ctx = createBrowserRouteContext({ getState: () => state });
      await expect(ctx.forProfile("bot").ensureBrowserAvailable()).rejects.toThrow(
        "Failed to start Chrome CDP",
      );
    }

    const cooledDownCtx = createBrowserRouteContext({ getState: () => state });
    await expect(cooledDownCtx.forProfile("bot").ensureBrowserAvailable()).rejects.toThrow(
      'Browser launch for profile "bot" is cooling down after 3 consecutive managed Chrome launch failures.',
    );
    await expect(cooledDownCtx.forProfile("bot").ensureBrowserAvailable()).rejects.toThrow(
      "set browser.enabled=false if the browser tool is not needed",
    );

    expect(launchBotChrome).toHaveBeenCalledTimes(3);
    expect(stopBotChrome).not.toHaveBeenCalled();
  });

  it("does not let no-display preflight failures block explicit headless recovery", async () => {
    const { launchBotChrome, stopBotChrome, isChromeCdpReady, state } =
      setupEnsureBrowserAvailableHarness();
    isChromeCdpReady.mockResolvedValue(true);
    launchBotChrome.mockRejectedValue(
      new BrowserProfileUnavailableError("display required", {
        metadata: {
          reason: BROWSER_ERROR_REASONS.noDisplayForHeadedProfile,
          details: {
            profile: "bot",
            requestedHeadless: false,
            headlessSource: "config",
            displayPresent: false,
          },
        },
      }),
    );

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const ctx = createBrowserRouteContext({ getState: () => state });
      await expect(ctx.forProfile("bot").ensureBrowserAvailable()).rejects.toThrow(
        "display required",
      );
    }

    mockLaunchedChrome(launchBotChrome, 987);
    const recoveryCtx = createBrowserRouteContext({ getState: () => state });
    const recovery = recoveryCtx.forProfile("bot").ensureBrowserAvailable({ headless: true });
    await vi.advanceTimersByTimeAsync(100);
    await expect(recovery).resolves.toBeUndefined();

    expect(launchBotChrome).toHaveBeenCalledTimes(4);
    expect(launchBotChrome.mock.calls.at(-1)?.[2]).toEqual(
      expect.objectContaining({ headlessOverride: true, signal: expect.any(AbortSignal) }),
    );
    expect(state.profiles.get("bot")?.managedLaunchFailure).toBeUndefined();
    expect(stopBotChrome).not.toHaveBeenCalled();
  });

  it("allows one managed Chrome launch attempt after the cooldown expires", async () => {
    const { launchBotChrome, isChromeCdpReady, state } = setupEnsureBrowserAvailableHarness();
    isChromeCdpReady.mockResolvedValue(true);
    launchBotChrome.mockRejectedValue(new Error("Failed to start Chrome CDP"));

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const ctx = createBrowserRouteContext({ getState: () => state });
      await expect(ctx.forProfile("bot").ensureBrowserAvailable()).rejects.toThrow(
        "Failed to start Chrome CDP",
      );
    }

    await vi.advanceTimersByTimeAsync(30_000);
    const retryCtx = createBrowserRouteContext({ getState: () => state });
    await expect(retryCtx.forProfile("bot").ensureBrowserAvailable()).rejects.toThrow(
      "Failed to start Chrome CDP",
    );

    expect(launchBotChrome).toHaveBeenCalledTimes(4);
  });

  it("reuses a pre-existing loopback browser after an initial short probe miss", async () => {
    const { launchBotChrome, stopBotChrome, isChromeCdpReady, profile, state } =
      setupEnsureBrowserAvailableHarness();
    const isChromeReachable = vi.mocked(chromeModule.isChromeReachable);
    state.resolved.ssrfPolicy = {};

    isChromeReachable.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    isChromeCdpReady.mockResolvedValueOnce(true);

    await expect(profile.ensureBrowserAvailable()).resolves.toBeUndefined();

    expect(isChromeReachable).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:18800",
      PROFILE_HTTP_REACHABILITY_TIMEOUT_MS,
      undefined,
    );
    expect(isChromeReachable).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:18800",
      PROFILE_ATTACH_RETRY_TIMEOUT_MS,
      undefined,
    );
    expect(launchBotChrome).not.toHaveBeenCalled();
    expect(stopBotChrome).not.toHaveBeenCalled();
  });

  it("explains attachOnly for externally managed loopback CDP services", async () => {
    const { launchBotChrome, stopBotChrome, isChromeCdpReady, profile } =
      setupEnsureBrowserAvailableHarness();
    const isChromeReachable = vi.mocked(chromeModule.isChromeReachable);

    isChromeReachable.mockResolvedValue(true);
    isChromeCdpReady.mockResolvedValue(false);

    const promise = profile.ensureBrowserAvailable();
    await expect(promise).rejects.toThrow(
      'Port 18800 is in use for profile "bot" but not by bot.',
    );
    await expect(promise).rejects.toThrow(
      "set browser.profiles.bot.attachOnly=true so Bot attaches without trying to manage the local process",
    );
    await expect(promise).rejects.toThrow(
      "For Browserless Docker, set EXTERNAL to the same WebSocket endpoint Bot can reach via browser.profiles.<name>.cdpUrl.",
    );

    expect(launchBotChrome).not.toHaveBeenCalled();
    expect(stopBotChrome).not.toHaveBeenCalled();
  });

  it("retries remote CDP websocket reachability once before failing", async () => {
    const { launchBotChrome, stopBotChrome, isChromeCdpReady } =
      setupEnsureBrowserAvailableHarness();
    const isChromeReachable = vi.mocked(chromeModule.isChromeReachable);

    const state = makeBrowserServerState();
    state.resolved.profiles.bot = {
      cdpUrl: "ws://browserless:3001",
      color: "#00AA00",
    };
    const ctx = createBrowserRouteContext({ getState: () => state });
    const profile = ctx.forProfile("bot");
    const expectedRemoteHttpTimeoutMs = state.resolved.remoteCdpTimeoutMs;
    const expectedRemoteWsTimeoutMs = state.resolved.remoteCdpHandshakeTimeoutMs;

    isChromeReachable.mockResolvedValueOnce(true);
    isChromeCdpReady.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await expect(profile.ensureBrowserAvailable()).resolves.toBeUndefined();

    expect(isChromeReachable).toHaveBeenCalledTimes(1);
    expect(isChromeCdpReady).toHaveBeenCalledTimes(2);
    expect(isChromeCdpReady).toHaveBeenNthCalledWith(
      1,
      "ws://browserless:3001",
      expectedRemoteHttpTimeoutMs,
      expectedRemoteWsTimeoutMs,
      {
        allowPrivateNetwork: true,
        allowedHostnames: ["browserless"],
      },
    );
    expect(isChromeCdpReady).toHaveBeenNthCalledWith(
      2,
      "ws://browserless:3001",
      expectedRemoteHttpTimeoutMs,
      expectedRemoteWsTimeoutMs,
      {
        allowPrivateNetwork: true,
        allowedHostnames: ["browserless"],
      },
    );
    expect(launchBotChrome).not.toHaveBeenCalled();
    expect(stopBotChrome).not.toHaveBeenCalled();
  });

  it("treats attachOnly loopback CDP as local control with remote-class probe timeouts", async () => {
    const { launchBotChrome, stopBotChrome } = setupEnsureBrowserAvailableHarness();
    const isChromeReachable = vi.mocked(chromeModule.isChromeReachable);
    const isChromeCdpReady = vi.mocked(chromeModule.isChromeCdpReady);

    const { profile, state } = createAttachOnlyLoopbackProfile("http://127.0.0.1:9222");

    isChromeReachable.mockResolvedValueOnce(true);
    isChromeCdpReady.mockResolvedValueOnce(true);

    await expect(profile.ensureBrowserAvailable()).resolves.toBeUndefined();

    expect(isChromeReachable).toHaveBeenCalledWith(
      "http://127.0.0.1:9222",
      state.resolved.remoteCdpTimeoutMs,
      undefined,
    );
    expect(isChromeCdpReady).toHaveBeenCalledWith(
      "http://127.0.0.1:9222",
      state.resolved.remoteCdpTimeoutMs,
      state.resolved.remoteCdpHandshakeTimeoutMs,
      undefined,
    );
    expect(launchBotChrome).not.toHaveBeenCalled();
    expect(stopBotChrome).not.toHaveBeenCalled();
  });

  it("resolves for attachOnly loopback profile with a bare ws:// cdpUrl when CDP is reachable (#68027)", async () => {
    // Regression for #68027: a bare `ws://host:port` cdpUrl on a loopback
    // attachOnly profile must not surface as
    //   `Browser attachOnly is enabled and profile "<name>" is not running.`
    // when the underlying CDP endpoint is actually healthy. The low-level
    // fix lives in chrome.ts/cdp.ts (see chrome.test.ts #68027 tests); this
    // higher-level test locks the user-facing symptom at
    // ensureBrowserAvailable() so future refactors of the availability flow
    // cannot silently reintroduce the bug by munging/short-circuiting bare
    // ws:// URLs before they reach the helpers.
    const { launchBotChrome, stopBotChrome } = setupEnsureBrowserAvailableHarness();
    const isChromeReachable = vi.mocked(chromeModule.isChromeReachable);
    const isChromeCdpReady = vi.mocked(chromeModule.isChromeCdpReady);

    const { profile, state } = createAttachOnlyLoopbackProfile("ws://127.0.0.1:9222");

    isChromeReachable.mockResolvedValueOnce(true);
    isChromeCdpReady.mockResolvedValueOnce(true);

    await expect(profile.ensureBrowserAvailable()).resolves.toBeUndefined();

    // The bare ws:// URL must pass through unchanged — the helpers own the
    // discovery-first-then-fallback strategy for bare ws roots.
    expect(isChromeReachable).toHaveBeenCalledWith(
      "ws://127.0.0.1:9222",
      state.resolved.remoteCdpTimeoutMs,
      undefined,
    );
    expect(isChromeCdpReady).toHaveBeenCalledWith(
      "ws://127.0.0.1:9222",
      state.resolved.remoteCdpTimeoutMs,
      state.resolved.remoteCdpHandshakeTimeoutMs,
      undefined,
    );
    expect(launchBotChrome).not.toHaveBeenCalled();
    expect(stopBotChrome).not.toHaveBeenCalled();
  });

  it("redacts credentials in remote CDP availability errors", async () => {
    const { launchBotChrome, stopBotChrome } = setupEnsureBrowserAvailableHarness();
    const isChromeReachable = vi.mocked(chromeModule.isChromeReachable);

    const state = makeBrowserServerState({
      profile: {
        name: "remote",
        cdpUrl: "https://user:pass@browserless.example.com?token=supersecret123",
        cdpHost: "browserless.example.com",
        cdpIsLoopback: false,
        cdpPort: 443,
        color: "#00AA00",
        driver: "bot",
        headless: false,
        attachOnly: false,
      },
      resolvedOverrides: {
        defaultProfile: "remote",
        ssrfPolicy: {},
      },
    });
    const ctx = createBrowserRouteContext({ getState: () => state });
    const profile = ctx.forProfile("remote");

    isChromeReachable.mockResolvedValue(false);

    const promise = profile.ensureBrowserAvailable();
    await expect(promise).rejects.toThrow(BrowserProfileUnavailableError);
    await expect(promise).rejects.toThrow(
      'Remote CDP for profile "remote" is not reachable at https://browserless.example.com/?token=***.',
    );

    expect(launchBotChrome).not.toHaveBeenCalled();
    expect(stopBotChrome).not.toHaveBeenCalled();
  });
});
