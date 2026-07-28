// Logger browser import tests cover safe import behavior in browser-like runtimes.
import { importFreshModule } from "bot/plugin-sdk/test-fixtures";
import { afterEach, describe, expect, it, vi } from "vitest";

type LoggerModule = typeof import("./logger.js");

const originalGetBuiltinModule = (
  process as NodeJS.Process & { getBuiltinModule?: (id: string) => unknown }
).getBuiltinModule;

async function importBrowserSafeLogger(params?: {
  resolvePreferredBotTmpDir?: ReturnType<typeof vi.fn>;
}): Promise<{
  module: LoggerModule;
  resolvePreferredBotTmpDir: ReturnType<typeof vi.fn>;
}> {
  const resolvePreferredBotTmpDir =
    params?.resolvePreferredBotTmpDir ??
    vi.fn(() => {
      throw new Error("resolvePreferredBotTmpDir should not run during browser-safe import");
    });

  vi.doMock("../infra/tmp-bot-dir.js", async () => {
    const actual = await vi.importActual<typeof import("../infra/tmp-bot-dir.js")>(
      "../infra/tmp-bot-dir.js",
    );
    return {
      ...actual,
      resolvePreferredBotTmpDir,
    };
  });

  Object.defineProperty(process, "getBuiltinModule", {
    configurable: true,
    value: undefined,
  });

  const module = await importFreshModule<LoggerModule>(
    import.meta.url,
    "./logger.js?scope=browser-safe",
  );
  return { module, resolvePreferredBotTmpDir };
}

describe("logging/logger browser-safe import", () => {
  afterEach(() => {
    vi.doUnmock("../infra/tmp-bot-dir.js");
    Object.defineProperty(process, "getBuiltinModule", {
      configurable: true,
      value: originalGetBuiltinModule,
    });
  });

  it("does not resolve the preferred temp dir at import time when node fs is unavailable", async () => {
    const { module, resolvePreferredBotTmpDir } = await importBrowserSafeLogger();

    expect(resolvePreferredBotTmpDir).not.toHaveBeenCalled();
    expect(module.DEFAULT_LOG_DIR).toBe("/tmp/bot");
    expect(module.DEFAULT_LOG_FILE).toBe("/tmp/hanzoai/bot.log");
  });

  it("disables file logging when imported in a browser-like environment", async () => {
    const { module, resolvePreferredBotTmpDir } = await importBrowserSafeLogger();

    expect(module.getResolvedLoggerSettings()).toStrictEqual({
      level: "silent",
      file: "/tmp/hanzoai/bot.log",
      maxFileBytes: 100 * 1024 * 1024,
    });
    expect(module.isFileLogLevelEnabled("info")).toBe(false);
    expect(module.getLogger().info("browser-safe")).toBeUndefined();
    expect(resolvePreferredBotTmpDir).not.toHaveBeenCalled();
  });
});
