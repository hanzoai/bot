import { describe, expect, it } from "vitest";
import {
  botNpmPrepublishVerifyUsage,
  parseBotNpmPrepublishVerifyArgs,
  usesPreparedLocalDependencyInstall,
} from "../scripts/bot-npm-prepublish-verify.ts";

describe("parseBotNpmPrepublishVerifyArgs", () => {
  it("supports help, optional versions, and package-manager separators", () => {
    expect(parseBotNpmPrepublishVerifyArgs(["--help"])).toEqual({
      dependencyTarballPaths: [],
      help: true,
      tarballPath: "",
    });
    expect(parseBotNpmPrepublishVerifyArgs(["bot.tgz"])).toEqual({
      dependencyTarballPaths: [],
      help: false,
      tarballPath: "bot.tgz",
    });
    expect(parseBotNpmPrepublishVerifyArgs(["--", "bot.tgz", "2026.3.23"])).toEqual({
      dependencyTarballPaths: [],
      expectedVersion: "2026.3.23",
      help: false,
      tarballPath: "bot.tgz",
    });
  });

  it("rejects missing, option-like, and extra arguments before installing", () => {
    expect(() => parseBotNpmPrepublishVerifyArgs([])).toThrow(
      botNpmPrepublishVerifyUsage(),
    );
    expect(() => parseBotNpmPrepublishVerifyArgs(["--tag"])).toThrow(
      "Unknown bot npm prepublish verifier option: --tag",
    );
    expect(() => parseBotNpmPrepublishVerifyArgs(["bot.tgz", "--tag"])).toThrow(
      "Unknown bot npm prepublish verifier option: --tag",
    );
    expect(
      parseBotNpmPrepublishVerifyArgs(["bot.tgz", "2026.3.23", "llm-core.tgz", "ai.tgz"]),
    ).toEqual({
      dependencyTarballPaths: ["llm-core.tgz", "ai.tgz"],
      expectedVersion: "2026.3.23",
      help: false,
      tarballPath: "bot.tgz",
    });
    expect(() =>
      parseBotNpmPrepublishVerifyArgs(["bot.tgz", "2026.3.23", "--bad"]),
    ).toThrow("Invalid dependency tarball path: --bad");
  });
});

describe("usesPreparedLocalDependencyInstall", () => {
  it("uses the prepared local project only for the single AI tarball release path", () => {
    expect(usesPreparedLocalDependencyInstall(0)).toBe(false);
    expect(usesPreparedLocalDependencyInstall(1)).toBe(true);
    expect(usesPreparedLocalDependencyInstall(2)).toBe(false);
  });
});
