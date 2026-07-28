// Workspace bundled allowlist tests cover which bundled skills may sync into workspaces.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { captureEnv, deleteTestEnvValue, setTestEnvValue } from "../../test-utils/env.js";
import { writeSkill } from "../test-support/e2e-test-helpers.js";
import { buildWorkspaceSkillsPrompt } from "./workspace.js";

describe("buildWorkspaceSkillsPrompt", () => {
  it("applies bundled allowlist without affecting workspace skills", async () => {
    const env = captureEnv(["HOME", "USERPROFILE", "BOT_HOME", "BOT_STATE_DIR"]);
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "bot-"));
    try {
      setTestEnvValue("HOME", workspaceDir);
      setTestEnvValue("USERPROFILE", workspaceDir);
      deleteTestEnvValue("BOT_HOME");
      deleteTestEnvValue("BOT_STATE_DIR");
      const bundledDir = path.join(workspaceDir, ".bundled");
      const bundledSkillDir = path.join(bundledDir, "peekaboo");
      const workspaceSkillDir = path.join(workspaceDir, "skills", "demo-skill");

      await writeSkill({
        dir: bundledSkillDir,
        name: "peekaboo",
        description: "Capture UI",
        body: "# Peekaboo\n",
      });
      await writeSkill({
        dir: workspaceSkillDir,
        name: "demo-skill",
        description: "Workspace version",
        body: "# Workspace\n",
      });

      const prompt = buildWorkspaceSkillsPrompt(workspaceDir, {
        bundledSkillsDir: bundledDir,
        managedSkillsDir: path.join(workspaceDir, ".managed"),
        config: { skills: { allowBundled: ["missing-skill"] } },
      });

      expect(prompt).toContain("Workspace version");
      expect(prompt).not.toContain("peekaboo");
    } finally {
      env.restore();
      await fs.rm(workspaceDir, { recursive: true, force: true });
    }
  });
});
