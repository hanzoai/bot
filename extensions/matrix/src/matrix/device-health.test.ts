// Matrix tests cover device health plugin behavior.
import { describe, expect, it } from "vitest";
import { isBotManagedMatrixDevice, summarizeMatrixDeviceHealth } from "./device-health.js";

describe("matrix device health", () => {
  it("detects Bot-managed device names", () => {
    expect(isBotManagedMatrixDevice("Bot Gateway")).toBe(true);
    expect(isBotManagedMatrixDevice("Bot Debug")).toBe(true);
    expect(isBotManagedMatrixDevice("Element iPhone")).toBe(false);
    expect(isBotManagedMatrixDevice(null)).toBe(false);
  });

  it("summarizes stale Bot-managed devices separately from the current device", () => {
    const summary = summarizeMatrixDeviceHealth([
      {
        deviceId: "du314Zpw3A",
        displayName: "Bot Gateway",
        current: true,
      },
      {
        deviceId: "BritdXC6iL",
        displayName: "Bot Gateway",
        current: false,
      },
      {
        deviceId: "G6NJU9cTgs",
        displayName: "Bot Debug",
        current: false,
      },
      {
        deviceId: "phone123",
        displayName: "Element iPhone",
        current: false,
      },
    ]);

    expect(summary).toEqual({
      currentDeviceId: "du314Zpw3A",
      currentBotDevices: [
        {
          deviceId: "du314Zpw3A",
          displayName: "Bot Gateway",
          current: true,
        },
      ],
      staleBotDevices: [
        {
          deviceId: "BritdXC6iL",
          displayName: "Bot Gateway",
          current: false,
        },
        {
          deviceId: "G6NJU9cTgs",
          displayName: "Bot Debug",
          current: false,
        },
      ],
    });
  });
});
