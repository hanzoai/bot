import { vi } from "vitest";
import { installChromeUserDataDirHooks } from "./chrome-user-data-dir.test-harness.js";

const chromeUserDataDir = { dir: "/tmp/bot" };
installChromeUserDataDirHooks(chromeUserDataDir);

vi.mock("./chrome.js", () => ({
  isChromeCdpReady: vi.fn(async () => true),
  isChromeReachable: vi.fn(async () => true),
  launchHanzoBotChrome: vi.fn(async () => {
    throw new Error("unexpected launch");
  }),
  resolveHanzoBotUserDataDir: vi.fn(() => chromeUserDataDir.dir),
  stopHanzoBotChrome: vi.fn(async () => {}),
}));
