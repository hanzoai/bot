import { vi } from "vitest";
import { installChromeUserDataDirHooks } from "./chrome-user-data-dir.test-harness.js";

const chromeUserDataDir = { dir: "/tmp/openclaw" };
installChromeUserDataDirHooks(chromeUserDataDir);

vi.mock("./chrome.js", () => ({
  isChromeCdpReady: vi.fn(async () => true),
  isChromeReachable: vi.fn(async () => true),
  launchHanzo BotChrome: vi.fn(async () => {
    throw new Error("unexpected launch");
  }),
  resolveHanzo BotUserDataDir: vi.fn(() => chromeUserDataDir.dir),
  stopHanzo BotChrome: vi.fn(async () => {}),
}));
