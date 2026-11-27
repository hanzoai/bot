import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerLocalBot } from "./local-cloud-register.js";

describe("registerLocalBot", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not schedule heartbeats when initial registration returns 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal("fetch", fetchMock);

    const stop = await registerLocalBot({ accessToken: "expired-token", port: 18789 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    stop();
  });

  it("stops heartbeats immediately when a heartbeat receives 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200 }) // register
      .mockResolvedValueOnce({ ok: true, status: 200 }) // first heartbeat
      .mockResolvedValueOnce({ ok: false, status: 401 }); // expired token heartbeat
    vi.stubGlobal("fetch", fetchMock);

    const stop = await registerLocalBot({ accessToken: "valid-then-expired", port: 18789 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Must not keep polling after receiving 401.
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    stop();
  });

  it("continues heartbeats on 200 and stops cleanly on cleanup", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const stop = await registerLocalBot({ accessToken: "good-token", port: 18789 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
