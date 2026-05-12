import { describe, expect, it } from "vitest";
import { __test__ } from "./logger.js";

describe("shouldSkipLoadConfigFallback", () => {
  it("matches config validate invocations", () => {
    expect(__test__.shouldSkipLoadConfigFallback(["node", "bot", "config", "validate"])).toBe(true);
  });

  it("handles root flags before config validate", () => {
    expect(
      __test__.shouldSkipLoadConfigFallback([
        "node",
        "bot",
        "--profile",
        "work",
        "--no-color",
        "config",
        "validate",
        "--json",
      ]),
    ).toBe(true);
  });

  it("does not match other commands", () => {
    expect(__test__.shouldSkipLoadConfigFallback(["node", "bot", "config", "get", "foo"])).toBe(
      false,
    );
    expect(__test__.shouldSkipLoadConfigFallback(["node", "bot", "status"])).toBe(false);
  });
});
