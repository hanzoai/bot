import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SubsystemLogger } from "../logging/subsystem.js";
import {
  resolvePlaygroundRegistrationConfig,
  startPlaygroundRegistration,
  type PlaygroundRegistrationConfig,
} from "./playground-registration.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockLogger(): SubsystemLogger {
  return {
    subsystem: "test",
    isEnabled: () => true,
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    raw: vi.fn(),
    child: () => createMockLogger(),
  };
}

// ---------------------------------------------------------------------------
// resolvePlaygroundRegistrationConfig
// ---------------------------------------------------------------------------

describe("resolvePlaygroundRegistrationConfig", () => {
  it("returns null when PLAYGROUND_URL is not set", () => {
    const result = resolvePlaygroundRegistrationConfig({
      env: {},
      gatewayPort: 18789,
      log: createMockLogger(),
    });
    expect(result).toBeNull();
  });

  it("resolves config from env vars", () => {
    const result = resolvePlaygroundRegistrationConfig({
      env: {
        PLAYGROUND_URL: "http://playground:8080",
        HANZO_NODE_ID: "my-node",
      },
      gatewayPort: 18789,
      log: createMockLogger(),
    });
    expect(result).not.toBeNull();
    expect(result!.playgroundUrl).toBe("http://playground:8080");
    expect(result!.nodeId).toBe("my-node");
    expect(result!.baseUrl).toBe("http://bot-gateway.hanzo.svc:80");
    expect(result!.bots).toHaveLength(1);
    expect(result!.skills).toHaveLength(2);
  });

  it("uses default nodeId when HANZO_NODE_ID is not set", () => {
    const result = resolvePlaygroundRegistrationConfig({
      env: { PLAYGROUND_URL: "http://playground:8080" },
      gatewayPort: 18789,
      log: createMockLogger(),
    });
    expect(result!.nodeId).toBe("bot-gateway");
  });

  it("uses raw port when gatewayPort is not 18789", () => {
    const result = resolvePlaygroundRegistrationConfig({
      env: { PLAYGROUND_URL: "http://playground:8080" },
      gatewayPort: 9999,
      log: createMockLogger(),
    });
    expect(result!.baseUrl).toBe("http://bot-gateway.hanzo.svc:9999");
  });

  it("respects HANZO_NODE_BASE_URL override", () => {
    const result = resolvePlaygroundRegistrationConfig({
      env: {
        PLAYGROUND_URL: "http://playground:8080",
        HANZO_NODE_BASE_URL: "https://custom.example.com",
      },
      gatewayPort: 18789,
      log: createMockLogger(),
    });
    expect(result!.baseUrl).toBe("https://custom.example.com");
  });
});

// ---------------------------------------------------------------------------
// startPlaygroundRegistration
// ---------------------------------------------------------------------------

describe("startPlaygroundRegistration", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchSpy);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function makeConfig(
    overrides?: Partial<PlaygroundRegistrationConfig>,
  ): PlaygroundRegistrationConfig {
    return {
      playgroundUrl: "http://playground:8080",
      nodeId: "test-node",
      baseUrl: "http://bot-gateway:80",
      bots: [{ id: "chat" }],
      skills: [{ id: "translate" }, { id: "summarize" }],
      heartbeatIntervalMs: 30_000,
      log: createMockLogger(),
      ...overrides,
    };
  }

  it("sends register + immediate heartbeat on start", async () => {
    const handle = await startPlaygroundRegistration(makeConfig());

    // register call
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://playground:8080/api/v1/nodes/register",
      expect.objectContaining({ method: "POST" }),
    );

    // immediate heartbeat
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://playground:8080/api/v1/nodes/test-node/heartbeat",
      expect.objectContaining({ method: "POST" }),
    );

    await handle.stop();
  });

  it("sends periodic heartbeats", async () => {
    const handle = await startPlaygroundRegistration(makeConfig({ heartbeatIntervalMs: 1_000 }));

    // Clear initial calls
    fetchSpy.mockClear();

    // Advance past one heartbeat interval
    await vi.advanceTimersByTimeAsync(1_000);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://playground:8080/api/v1/nodes/test-node/heartbeat",
      expect.objectContaining({ method: "POST" }),
    );

    await handle.stop();
  });

  it("sends offline heartbeat on stop", async () => {
    const handle = await startPlaygroundRegistration(makeConfig());
    fetchSpy.mockClear();

    await handle.stop();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe("http://playground:8080/api/v1/nodes/test-node/heartbeat");
    const body = JSON.parse(opts.body);
    expect(body.status).toBe("offline");
  });

  it("stop is idempotent", async () => {
    const handle = await startPlaygroundRegistration(makeConfig());
    fetchSpy.mockClear();

    await handle.stop();
    await handle.stop();

    // Only one offline call
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does not crash when registration fails", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("connection refused"));
    const log = createMockLogger();

    const handle = await startPlaygroundRegistration(makeConfig({ log }));

    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("connection refused"));

    await handle.stop();
  });

  it("logs warning on non-ok response", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => "Service Unavailable",
    });
    const log = createMockLogger();

    const handle = await startPlaygroundRegistration(makeConfig({ log }));

    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("503"));

    await handle.stop();
  });
});
