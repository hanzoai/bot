import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseArgs, reportOrphanLocaleDocs } from "../../scripts/docs-sync-publish.mjs";

describe("docs-sync-publish", () => {
  it("parses docs sync provenance args", () => {
    expect(
      parseArgs([
        "--target",
        "generated-docs",
        "--source-repo",
        "hanzoai/bot",
        "--source-sha",
        "abc123",
        "--clawhub-repo",
        "../clawhub",
        "--clawhub-source-repo",
        "bot/clawhub",
        "--clawhub-source-sha",
        "def456",
      ]),
    ).toMatchObject({
      clawhubRepo: "../clawhub",
      clawhubSourceRepo: "bot/clawhub",
      clawhubSourceSha: "def456",
      sourceRepo: "hanzoai/bot",
      sourceSha: "abc123",
      target: "generated-docs",
    });
  });

  it("rejects missing docs sync option values", () => {
    for (const flag of [
      "--target",
      "--source-repo",
      "--source-sha",
      "--clawhub-repo",
      "--clawhub-source-repo",
      "--clawhub-source-sha",
    ]) {
      expect(() => parseArgs([flag])).toThrow(`${flag} requires a value`);
      expect(() => parseArgs([flag, "--target", "generated-docs"])).toThrow(
        `${flag} requires a value`,
      );
      expect(() => parseArgs([flag, "-h"])).toThrow(`${flag} requires a value`);
    }
  });

  it("defers orphan locale deletion to translation finalization", () => {
    const docsDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-docs-sync-"));
    const mirroredEnglish = path.join(docsDir, "clawhub", "api.md");
    const localizedMirror = path.join(docsDir, "de", "clawhub", "api.md");
    const orphan = path.join(docsDir, "de", "removed.md");

    fs.mkdirSync(path.dirname(mirroredEnglish), { recursive: true });
    fs.mkdirSync(path.dirname(localizedMirror), { recursive: true });
    fs.writeFileSync(mirroredEnglish, "# ClawHub API\n");
    fs.writeFileSync(localizedMirror, "# ClawHub-API\n");
    fs.writeFileSync(orphan, "# Removed\n");

    try {
      expect(reportOrphanLocaleDocs(docsDir)).toBe(1);
      expect(fs.existsSync(localizedMirror)).toBe(true);
      expect(fs.existsSync(orphan)).toBe(true);
    } finally {
      fs.rmSync(docsDir, { recursive: true, force: true });
    }
  });
});
