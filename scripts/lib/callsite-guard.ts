import { promises as fs } from "node:fs";
import path from "node:path";
import {
  collectTypeScriptFilesFromRoots,
  resolveRepoRoot,
  resolveSourceRoots,
} from "./ts-guard-utils.ts";

export type RunCallsiteGuardParams = {
  importMetaUrl: string;
  sourceRoots: string[];
  extraTestSuffixes?: string[];
  skipRelativePath?: (relPath: string) => boolean;
  findCallLines: (content: string, filePath: string) => number[];
  allowCallsite?: (callsite: string) => boolean;
  header: string;
  footer?: string;
  sortViolations?: boolean;
};

export async function runCallsiteGuard(params: RunCallsiteGuardParams): Promise<void> {
  const repoRoot = resolveRepoRoot(params.importMetaUrl);
  const sourceRoots = resolveSourceRoots(repoRoot, params.sourceRoots);
  const files = await collectTypeScriptFilesFromRoots(sourceRoots, {
    extraTestSuffixes: params.extraTestSuffixes,
  });
  const violations: string[] = [];

  for (const filePath of files) {
    const relPath = path.relative(repoRoot, filePath).replaceAll(path.sep, "/");
    if (params.skipRelativePath?.(relPath)) {
      continue;
    }
    const content = await fs.readFile(filePath, "utf8");
    for (const line of params.findCallLines(content, filePath)) {
      const callsite = `${relPath}:${line}`;
      if (params.allowCallsite?.(callsite)) {
        continue;
      }
      violations.push(callsite);
    }
  }

  if (violations.length === 0) {
    return;
  }

  console.error(params.header);
  const output = params.sortViolations === false ? violations : violations.toSorted();
  for (const violation of output) {
    console.error(`- ${violation}`);
  }
  if (params.footer) {
    console.error(params.footer);
  }
  process.exit(1);
}
