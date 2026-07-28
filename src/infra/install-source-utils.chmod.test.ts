import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";

const resolvePreferredBotTmpDirMock = vi.hoisted(() => vi.fn());

vi.mock("./tmp-bot-dir.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tmp-bot-dir.js")>();
  return {
    ...actual,
    resolvePreferredBotTmpDir: resolvePreferredBotTmpDirMock,
  };
});

import { withTempDir } from "./install-source-utils.js";

describe("withTempDir private root", () => {
  const tempDirs = useAutoCleanupTempDirTracker(afterEach);

  it.runIf(process.platform !== "win32")(
    "preserves parent temp root permissions when using private Bot temp root",
    async () => {
      const mockParentRoot = tempDirs.make("bot-chmod-test-");
      const mockBotDir = path.join(mockParentRoot, "bot");

      await fs.mkdir(mockBotDir, { recursive: true });
      await fs.chmod(mockParentRoot, 0o1777);
      const canonicalBotDir = await fs.realpath(mockBotDir);

      resolvePreferredBotTmpDirMock.mockReturnValue(mockBotDir);

      let observedDir = "";
      const value = await withTempDir("bot-test-", async (tmpDir) => {
        observedDir = tmpDir;
        expect(path.dirname(tmpDir)).toBe(canonicalBotDir);
        await fs.writeFile(path.join(tmpDir, "marker.txt"), "ok");
        return "done";
      });

      expect(value).toBe("done");

      await expect(
        fs.stat(observedDir).then(
          () => true,
          () => false,
        ),
      ).resolves.toBe(false);

      const privateRootStat = await fs.stat(mockBotDir);
      expect(privateRootStat.mode & 0o7777).toBe(0o700);

      const parentStat = await fs.stat(mockParentRoot);
      expect(parentStat.mode & 0o7777).toBe(0o1777);
    },
  );
});
