import { describe, expect, it } from "vitest";
import { isHanzoBotManagedMatrixDevice, summarizeMatrixDeviceHealth } from "./device-health.js";

describe("matrix device health", () => {
  it("detects Hanzo Bot-managed device names", () => {
    expect(isHanzoBotManagedMatrixDevice("Hanzo Bot Gateway")).toBe(true);
    expect(isHanzoBotManagedMatrixDevice("Hanzo Bot Debug")).toBe(true);
    expect(isHanzoBotManagedMatrixDevice("Element iPhone")).toBe(false);
    expect(isHanzoBotManagedMatrixDevice(null)).toBe(false);
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
    expect(summary.currentHanzoBotDevices).toEqual([
      expect.objectContaining({ deviceId: "du314Zpw3A" }),
    ]);
    expect(summary.staleHanzoBotDevices).toEqual([
      expect.objectContaining({ deviceId: "BritdXC6iL" }),
      expect.objectContaining({ deviceId: "G6NJU9cTgs" }),
    ]);
  });
});
