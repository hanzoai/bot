import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { loadConfigMock } = vi.hoisted(() => ({ loadConfigMock: vi.fn() }));

vi.mock("./config.js", () => ({ readLoggingConfig: () => undefined }));
vi.mock("./node-require.js", () => ({
  resolveNodeRequireFromMeta: () => () => ({ loadConfig: loadConfigMock }),
}));

let logging: typeof import("../logging.js");
let originalTestFileLog: string | undefined;

beforeAll(async () => {
  // The test setup already loaded the logger; load it again with the mocks above.
  vi.resetModules();
  logging = await import("../logging.js");
});

beforeEach(() => {
  originalTestFileLog = process.env.BOT_TEST_FILE_LOG;
  process.env.BOT_TEST_FILE_LOG = "1";
  loadConfigMock.mockReset();
  logging.resetLogger();
  logging.setLoggerOverride(null);
});

afterEach(() => {
  if (originalTestFileLog === undefined) {
    delete process.env.BOT_TEST_FILE_LOG;
  } else {
    process.env.BOT_TEST_FILE_LOG = originalTestFileLog;
  }
  logging.resetLogger();
  logging.setLoggerOverride(null);
});

describe("logger settings from the full config", () => {
  it("reads the config once when reading it logs a warning", () => {
    // loadConfig reports config warnings through the console, which asks for
    // the logger's settings again while the first read is still running.
    loadConfigMock.mockImplementation(() => {
      logging.getResolvedLoggerSettings();
      return { logging: { level: "debug" } };
    });
    const settings = logging.getResolvedLoggerSettings();
    expect(loadConfigMock).toHaveBeenCalledTimes(1);
    expect(settings.level).toBe("debug");
  });
});
