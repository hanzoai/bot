import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ENTRY_WRAPPER_PAIRS } from "../src/infra/entry-wrappers.js";
import { isMainModule } from "../src/infra/is-main.js";

// The bins package.json declares are wrappers that import the built entry out of
// dist/. entry.ts only runs when isMainModule() recognises that pairing; miss it
// and the CLI exits 0 with no output — silently dead for `bot`, `hanzo-bot`, and
// every cloud-bot pod whose gateway then never starts.
//
// This asserts the pairing the shipped binary actually uses (ENTRY_WRAPPER_PAIRS),
// against the bins package.json actually declares. Restating the list here instead
// would pass even with entry.ts broken.
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
  bin: Record<string, string>;
};

const declaredWrappers = [
  ...new Set(Object.values(pkg.bin).map((target) => path.basename(target))),
];

describe("entry wrapper pairing", () => {
  it("declares at least one bin", () => {
    expect(declaredWrappers.length).toBeGreaterThan(0);
  });

  it.each(declaredWrappers)("%s is recognised as main for dist/entry.js", (wrapper) => {
    const isMain = isMainModule({
      currentFile: "/app/dist/entry.js",
      argv: ["/usr/bin/node", `/app/${wrapper}`],
      env: {},
      cwd: "/app",
      wrapperEntryPairs: [...ENTRY_WRAPPER_PAIRS],
    });
    expect(isMain).toBe(true);
  });

  it("pairs every declared bin wrapper", () => {
    const paired = new Set(ENTRY_WRAPPER_PAIRS.map((pair) => pair.wrapperBasename));
    for (const wrapper of declaredWrappers) {
      expect(paired).toContain(wrapper);
    }
  });

  it("has no duplicate pairs", () => {
    const keys = ENTRY_WRAPPER_PAIRS.map(
      (pair) => `${pair.wrapperBasename}->${pair.entryBasename}`,
    );
    expect(keys).toHaveLength(new Set(keys).size);
  });
});
