import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPwToolsCoreSessionMocks,
  installPwToolsCoreTestHooks,
  setPwToolsCoreCurrentPage,
  setPwToolsCoreCurrentRefLocator,
} from "./pw-tools-core.test-harness.js";

installPwToolsCoreTestHooks();
const sessionMocks = getPwToolsCoreSessionMocks();
const tmpDirMocks = vi.hoisted(() => ({
  resolvePreferredBotTmpDir: vi.fn(() => "/tmp/bot"),
}));
vi.mock("../infra/tmp-bot-dir.js", () => tmpDirMocks);
const mod = await import("./pw-tools-core.js");

describe("pw-tools-core", () => {
  beforeEach(() => {
    for (const fn of Object.values(tmpDirMocks)) {
      fn.mockClear();
    }
    tmpDirMocks.resolvePreferredBotTmpDir.mockReturnValue("/tmp/bot");
  });

  async function withTempDir<T>(run: (tempDir: string) => Promise<T>): Promise<T> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bot-browser-download-test-"));
    try {
      return await run(tempDir);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  async function waitForImplicitDownloadOutput(params: {
    downloadUrl: string;
    suggestedFilename: string;
  }) {
    let downloadHandler: ((download: unknown) => void) | undefined;
    const on = vi.fn((event: string, handler: (download: unknown) => void) => {
      if (event === "download") {
        downloadHandler = handler;
      }
    });
    const off = vi.fn();
    const saveAs = vi.fn(async () => {});
    setPwToolsCoreCurrentPage({ on, off });

    const p = mod.waitForDownloadViaPlaywright({
      cdpUrl: "http://127.0.0.1:18792",
      targetId: "T1",
      timeoutMs: 1000,
    });

    await Promise.resolve();
    downloadHandler?.({
      url: () => params.downloadUrl,
      suggestedFilename: () => params.suggestedFilename,
      saveAs,
    });

    const res = await p;
    const outPath = vi.mocked(saveAs).mock.calls[0]?.[0];
    return { res, outPath };
  }

  it("waits for the next download and saves it", async () => {
    let downloadHandler: ((download: unknown) => void) | undefined;
    const on = vi.fn((event: string, handler: (download: unknown) => void) => {
      if (event === "download") {
        downloadHandler = handler;
      }
    });
    const off = vi.fn();

  it("waits for the next download and atomically finalizes explicit output paths", async () => {
    await withTempDir(async (tempDir) => {
      const harness = createDownloadEventHarness();
      const targetPath = path.join(tempDir, "file.bin");

    setPwToolsCoreCurrentPage({ on, off });

    const targetPath = path.resolve("/tmp/file.bin");
    const p = mod.waitForDownloadViaPlaywright({
      cdpUrl: "http://127.0.0.1:18792",
      targetId: "T1",
      path: targetPath,
      timeoutMs: 1000,
    });

    await Promise.resolve();
    expect(downloadHandler).toBeDefined();
    downloadHandler?.(download);

    const res = await p;
    expect(saveAs).toHaveBeenCalledWith(targetPath);
    expect(res.path).toBe(targetPath);
  });
  it("clicks a ref and saves the resulting download", async () => {
    let downloadHandler: ((download: unknown) => void) | undefined;
    const on = vi.fn((event: string, handler: (download: unknown) => void) => {
      if (event === "download") {
        downloadHandler = handler;
      }
    });
    const off = vi.fn();

      const click = vi.fn(async () => {});
      setPwToolsCoreCurrentRefLocator({ click });

      const saveAs = vi.fn(async (outPath: string) => {
        await fs.writeFile(outPath, "report-content", "utf8");
      });
      const download = {
        url: () => "https://example.com/report.pdf",
        suggestedFilename: () => "report.pdf",
        saveAs,
      };

    setPwToolsCoreCurrentPage({ on, off });

    const targetPath = path.resolve("/tmp/report.pdf");
    const p = mod.downloadViaPlaywright({
      cdpUrl: "http://127.0.0.1:18792",
      targetId: "T1",
      ref: "e12",
      path: targetPath,
      timeoutMs: 1000,
    });

    await Promise.resolve();
    expect(downloadHandler).toBeDefined();
    expect(click).toHaveBeenCalledWith({ timeout: 1000 });

    downloadHandler?.(download);

    const res = await p;
    expect(saveAs).toHaveBeenCalledWith(targetPath);
    expect(res.path).toBe(targetPath);
  });

  it.runIf(process.platform !== "win32")(
    "does not overwrite outside files when explicit output path is a hardlink alias",
    async () => {
      await withTempDir(async (tempDir) => {
        const outsidePath = path.join(tempDir, "outside.txt");
        await fs.writeFile(outsidePath, "outside-before", "utf8");
        const linkedPath = path.join(tempDir, "linked.txt");
        await fs.link(outsidePath, linkedPath);

        const harness = createDownloadEventHarness();
        const saveAs = vi.fn(async (outPath: string) => {
          await fs.writeFile(outPath, "download-content", "utf8");
        });
        const p = mod.waitForDownloadViaPlaywright({
          cdpUrl: "http://127.0.0.1:18792",
          targetId: "T1",
          path: linkedPath,
          timeoutMs: 1000,
        });

        await Promise.resolve();
        harness.expectArmed();
        harness.trigger({
          url: () => "https://example.com/file.bin",
          suggestedFilename: () => "file.bin",
          saveAs,
        });

        const res = await p;
        expect(res.path).toBe(linkedPath);
        expect(await fs.readFile(linkedPath, "utf8")).toBe("download-content");
        expect(await fs.readFile(outsidePath, "utf8")).toBe("outside-before");
      });
    },
  );

  it("uses preferred tmp dir when waiting for download without explicit path", async () => {
    tmpDirMocks.resolvePreferredBotTmpDir.mockReturnValue("/tmp/bot-preferred");
    const { res, outPath } = await waitForImplicitDownloadOutput({
      downloadUrl: "https://example.com/file.bin",
      suggestedFilename: "file.bin",
    });
    expect(typeof outPath).toBe("string");
    const expectedRootedDownloadsDir = path.join(path.sep, "tmp", "bot-preferred", "downloads");
    const expectedDownloadsTail = `${path.join("tmp", "bot-preferred", "downloads")}${path.sep}`;
    expect(path.dirname(String(outPath))).toBe(expectedRootedDownloadsDir);
    expect(path.basename(String(outPath))).toMatch(/-file\.bin$/);
    expect(path.normalize(res.path)).toContain(path.normalize(expectedDownloadsTail));
    expect(tmpDirMocks.resolvePreferredBotTmpDir).toHaveBeenCalled();
  });

  it("sanitizes suggested download filenames to prevent traversal escapes", async () => {
    tmpDirMocks.resolvePreferredBotTmpDir.mockReturnValue("/tmp/bot-preferred");
    const { res, outPath } = await waitForImplicitDownloadOutput({
      downloadUrl: "https://example.com/evil",
      suggestedFilename: "../../../../etc/passwd",
    });
    expect(typeof outPath).toBe("string");
    expect(path.dirname(String(outPath))).toBe(
      path.join(path.sep, "tmp", "bot-preferred", "downloads"),
    );
    expect(path.basename(String(outPath))).toMatch(/-passwd$/);
    expect(path.normalize(res.path)).toContain(
      path.normalize(`${path.join("tmp", "bot-preferred", "downloads")}${path.sep}`),
    );
  });
  it("waits for a matching response and returns its body", async () => {
    let responseHandler: ((resp: unknown) => void) | undefined;
    const on = vi.fn((event: string, handler: (resp: unknown) => void) => {
      if (event === "response") {
        responseHandler = handler;
      }
    });
    const off = vi.fn();
    setPwToolsCoreCurrentPage({ on, off });

    const resp = {
      url: () => "https://example.com/api/data",
      status: () => 200,
      headers: () => ({ "content-type": "application/json" }),
      text: async () => '{"ok":true,"value":123}',
    };

    const p = mod.responseBodyViaPlaywright({
      cdpUrl: "http://127.0.0.1:18792",
      targetId: "T1",
      url: "**/api/data",
      timeoutMs: 1000,
      maxChars: 10,
    });

    await Promise.resolve();
    expect(responseHandler).toBeDefined();
    responseHandler?.(resp);

    const res = await p;
    expect(res.url).toBe("https://example.com/api/data");
    expect(res.status).toBe(200);
    expect(res.body).toBe('{"ok":true');
    expect(res.truncated).toBe(true);
  });
  it("scrolls a ref into view (default timeout)", async () => {
    const scrollIntoViewIfNeeded = vi.fn(async () => {});
    setPwToolsCoreCurrentRefLocator({ scrollIntoViewIfNeeded });
    const page = {};
    setPwToolsCoreCurrentPage(page);

    await mod.scrollIntoViewViaPlaywright({
      cdpUrl: "http://127.0.0.1:18792",
      targetId: "T1",
      ref: "1",
    });

    expect(sessionMocks.refLocator).toHaveBeenCalledWith(page, "1");
    expect(scrollIntoViewIfNeeded).toHaveBeenCalledWith({ timeout: 20_000 });
  });
  it("requires a ref for scrollIntoView", async () => {
    setPwToolsCoreCurrentRefLocator({ scrollIntoViewIfNeeded: vi.fn(async () => {}) });
    setPwToolsCoreCurrentPage({});

    await expect(
      mod.scrollIntoViewViaPlaywright({
        cdpUrl: "http://127.0.0.1:18792",
        targetId: "T1",
        ref: "   ",
      }),
    ).rejects.toThrow(/ref is required/i);
  });
});
