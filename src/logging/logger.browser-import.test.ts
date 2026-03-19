import { afterEach, describe, expect, it, vi } from "vitest";

type LoggerModule = typeof import("./logger.js");

const originalGetBuiltinModule = (
  process as NodeJS.Process & { getBuiltinModule?: (id: string) => unknown }
).getBuiltinModule;

async function importBrowserSafeLogger(params?: {
  resolvePreferredHanzo BotTmpDir?: ReturnType<typeof vi.fn>;
}): Promise<{
  module: LoggerModule;
  resolvePreferredHanzo BotTmpDir: ReturnType<typeof vi.fn>;
}> {
  vi.resetModules();
  const resolvePreferredHanzo BotTmpDir =
    params?.resolvePreferredHanzo BotTmpDir ??
    vi.fn(() => {
      throw new Error("resolvePreferredHanzo BotTmpDir should not run during browser-safe import");
    });

  vi.doMock("../infra/tmp-openclaw-dir.js", async () => {
    const actual = await vi.importActual<typeof import("../infra/tmp-openclaw-dir.js")>(
      "../infra/tmp-openclaw-dir.js",
    );
    return {
      ...actual,
      resolvePreferredHanzo BotTmpDir,
    };
  });

  Object.defineProperty(process, "getBuiltinModule", {
    configurable: true,
    value: undefined,
  });

  const module = await import("./logger.js");
  return { module, resolvePreferredHanzo BotTmpDir };
}

describe("logging/logger browser-safe import", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../infra/tmp-openclaw-dir.js");
    Object.defineProperty(process, "getBuiltinModule", {
      configurable: true,
      value: originalGetBuiltinModule,
    });
  });

  it("does not resolve the preferred temp dir at import time when node fs is unavailable", async () => {
    const { module, resolvePreferredHanzo BotTmpDir } = await importBrowserSafeLogger();

    expect(resolvePreferredHanzo BotTmpDir).not.toHaveBeenCalled();
    expect(module.DEFAULT_LOG_DIR).toBe("/tmp/openclaw");
    expect(module.DEFAULT_LOG_FILE).toBe("/tmp/hanzoai/bot.log");
  });

  it("disables file logging when imported in a browser-like environment", async () => {
    const { module, resolvePreferredHanzo BotTmpDir } = await importBrowserSafeLogger();

    expect(module.getResolvedLoggerSettings()).toMatchObject({
      level: "silent",
      file: "/tmp/hanzoai/bot.log",
    });
    expect(module.isFileLogLevelEnabled("info")).toBe(false);
    expect(() => module.getLogger().info("browser-safe")).not.toThrow();
    expect(resolvePreferredHanzo BotTmpDir).not.toHaveBeenCalled();
  });
});
