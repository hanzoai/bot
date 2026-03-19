import { describe, expect, it } from "vitest";
import { isHanzo BotManagedMatrixDevice, summarizeMatrixDeviceHealth } from "./device-health.js";

describe("matrix device health", () => {
  it("detects Hanzo Bot-managed device names", () => {
    expect(isHanzo BotManagedMatrixDevice("Hanzo Bot Gateway")).toBe(true);
    expect(isHanzo BotManagedMatrixDevice("Hanzo Bot Debug")).toBe(true);
    expect(isHanzo BotManagedMatrixDevice("Element iPhone")).toBe(false);
    expect(isHanzo BotManagedMatrixDevice(null)).toBe(false);
  });

  it("summarizes stale Hanzo Bot-managed devices separately from the current device", () => {
    const summary = summarizeMatrixDeviceHealth([
      {
        deviceId: "du314Zpw3A",
        displayName: "Hanzo Bot Gateway",
        current: true,
      },
      {
        deviceId: "BritdXC6iL",
        displayName: "Hanzo Bot Gateway",
        current: false,
      },
      {
        deviceId: "G6NJU9cTgs",
        displayName: "Hanzo Bot Debug",
        current: false,
      },
      {
        deviceId: "phone123",
        displayName: "Element iPhone",
        current: false,
      },
    ]);

    expect(summary.currentDeviceId).toBe("du314Zpw3A");
    expect(summary.currentHanzo BotDevices).toEqual([
      expect.objectContaining({ deviceId: "du314Zpw3A" }),
    ]);
    expect(summary.staleHanzo BotDevices).toEqual([
      expect.objectContaining({ deviceId: "BritdXC6iL" }),
      expect.objectContaining({ deviceId: "G6NJU9cTgs" }),
    ]);
  });
});
