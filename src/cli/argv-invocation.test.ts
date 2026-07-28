// Argv invocation tests cover CLI argv normalization before command dispatch.
import { describe, expect, it } from "vitest";
import { resolveCliArgvInvocation } from "./argv-invocation.js";

describe("argv-invocation", () => {
  it("resolves root help and empty command path", () => {
    expect(resolveCliArgvInvocation(["node", "bot", "--help"])).toEqual({
      argv: ["node", "bot", "--help"],
      commandPath: [],
      primary: null,
      hasHelpOrVersion: true,
      isRootHelpInvocation: true,
    });
  });

  it("resolves command path and primary with root options", () => {
    expect(
      resolveCliArgvInvocation(["node", "bot", "--profile", "work", "gateway", "status"]),
    ).toEqual({
      argv: ["node", "bot", "--profile", "work", "gateway", "status"],
      commandPath: ["gateway", "status"],
      primary: "gateway",
      hasHelpOrVersion: false,
      isRootHelpInvocation: false,
    });
  });

  it("consumes agent parent option values before the exec subcommand", () => {
    expect(
      resolveCliArgvInvocation([
        "node",
        "bot",
        "agent",
        "--model",
        "openai/gpt-5.6-sol",
        "exec",
        "fix it",
      ]).commandPath,
    ).toEqual(["agent", "exec"]);
  });

  it("does not treat an exec-valued parent option as the subcommand", () => {
    expect(
      resolveCliArgvInvocation(["node", "bot", "agent", "--message", "exec"]).commandPath,
    ).toEqual(["agent"]);
  });

  it("consumes root options between the agent parent and exec", () => {
    expect(
      resolveCliArgvInvocation([
        "node",
        "bot",
        "agent",
        "--no-color",
        "--model",
        "openai/gpt-5.6-sol",
        "exec",
        "fix it",
      ]).commandPath,
    ).toEqual(["agent", "exec"]);
  });
});
