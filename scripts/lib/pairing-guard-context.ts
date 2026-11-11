import path from "node:path";
import { resolveRepoRoot, resolveSourceRoots } from "./ts-guard-utils.ts";

export function createPairingGuardContext(importMetaUrl: string) {
  const repoRoot = resolveRepoRoot(importMetaUrl);
  const sourceRoots = resolveSourceRoots(repoRoot, ["src", "extensions"]);
  return {
    repoRoot,
    sourceRoots,
    resolveFromRepo: (relativePath: string) =>
      path.join(repoRoot, ...relativePath.split("/").filter(Boolean)),
  };
}
