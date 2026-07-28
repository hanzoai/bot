// Workspace default tests cover environment-variable precedence for the
// built-in agent workspace location.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withEnv } from "../test-utils/env.js";
import { resolveDefaultAgentWorkspaceDir } from "./workspace.js";

describe("DEFAULT_AGENT_WORKSPACE_DIR", () => {
  it("uses BOT_HOME when resolving the default workspace dir", () => {
    const home = path.join(path.sep, "srv", "bot-home");

    const resolved = withEnv(
      {
        BOT_WORKSPACE_DIR: undefined,
        BOT_PROFILE: undefined,
        BOT_HOME: home,
        HOME: path.join(path.sep, "home", "other"),
      },
      () => resolveDefaultAgentWorkspaceDir(),
    );

    expect(resolved).toBe(path.join(path.resolve(home), ".bot", "workspace"));
  });

  it("uses BOT_WORKSPACE_DIR before BOT_HOME", () => {
    const workspaceDir = path.join(path.sep, "srv", "bot-workspace");

    const resolved = withEnv(
      {
        BOT_WORKSPACE_DIR: workspaceDir,
        BOT_HOME: path.join(path.sep, "srv", "bot-home"),
      },
      () => resolveDefaultAgentWorkspaceDir(),
    );

    expect(resolved).toBe(path.resolve(workspaceDir));
  });
});
