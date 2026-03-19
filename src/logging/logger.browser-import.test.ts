import { afterEach, describe, expect, it, vi } from "vitest";

type LoggerModule = typeof import("./logger.js");

const originalGetBuiltinModule = (
  process as NodeJS.Process & { getBuiltinModule?: (id: string) => unknown }
).getBuiltinModule;

async function importBrowserSafeLogger(params?: {
  resolvePreferredHanzoBotTmpDir?: ReturnType<typeof vi.fn>;
}): Promise<{
  module: LoggerModule;
  resolvePreferredHanzoBotTmpDir: ReturnType<typeof vi.fn>;
}> {
  vi.resetModules();
  const resolvePreferredHanzoBotTmpDir =
    params?.resolvePreferredHanzoBotTmpDir ??
    vi.fn(() => {
      throw new Error("resolvePreferredHanzoBotTmpDir should not run during browser-safe import");
    });

  vi.doMock("../infra/tmp-openclaw-dir.js", async () => {
    const actual = await vi.importActual<typeof import("../infra/tmp-openclaw-dir.js")>(
      "../infra/tmp-openclaw-dir.js",
    );
    return {
      ...actual,
      resolvePreferredHanzoBotTmpDir,
    };
  });

  Object.defineProperty(process, "getBuiltinModule", {
    configurable: true,
    value: undefined,
  });

  const module = await import("./logger.js");
  return { module, resolvePreferredHanzoBotTmpDir };
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
    const { module, resolvePreferredHanzoBotTmpDir } = await importBrowserSafeLogger();

    expect(resolvePreferredHanzoBotTmpDir).not.toHaveBeenCalled();
    expect(module.DEFAULT_LOG_DIR).toBe("/tmp/openclaw");
    expect(module.DEFAULT_LOG_FILE).toBe("/tmp/hanzoai/bot.log");
  });

  it("disables file logging when imported in a browser-like environment", async () => {
    const { module, resolvePreferredHanzoBotTmpDir } = await importBrowserSafeLogger();

    expect(module.getResolvedLoggerSettings()).toMatchObject({
      level: "silent",
      file: "/tmp/hanzoai/bot.log",
    });
    expect(module.isFileLogLevelEnabled("info")).toBe(false);
    expect(() => module.getLogger().info("browser-safe")).not.toThrow();
    expect(resolvePreferredHanzoBotTmpDir).not.toHaveBeenCalled();
  });
});
