import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const baseTestSuffixes = [".test.ts", ".test-utils.ts", ".test-harness.ts", ".e2e-harness.ts"];

export type CollectTypeScriptFilesOptions = {
  includeTests?: boolean;
  extraTestSuffixes?: string[];
  skipNodeModules?: boolean;
  ignoreMissing?: boolean;
};

export type FileViolation = {
  line: number;
  reason: string;
};

export type PathFileViolation = FileViolation & {
  path: string;
};

export function resolveRepoRoot(importMetaUrl: string): string {
  return path.resolve(path.dirname(fileURLToPath(importMetaUrl)), "..", "..");
}

export function resolveSourceRoots(repoRoot: string, relativeRoots: string[]): string[] {
  return relativeRoots.map((root) => path.join(repoRoot, ...root.split("/").filter(Boolean)));
}

export function isTestLikeTypeScriptFile(
  filePath: string,
  options: { extraTestSuffixes?: string[] } = {},
): boolean {
  const extraTestSuffixes = options.extraTestSuffixes ?? [];
  return [...baseTestSuffixes, ...extraTestSuffixes].some((suffix) => filePath.endsWith(suffix));
}

export async function collectTypeScriptFiles(
  targetPath: string,
  options: CollectTypeScriptFilesOptions = {},
): Promise<string[]> {
  const includeTests = options.includeTests ?? false;
  const extraTestSuffixes = options.extraTestSuffixes ?? [];
  const skipNodeModules = options.skipNodeModules ?? true;
  const ignoreMissing = options.ignoreMissing ?? false;

  let stat;
  try {
    stat = await fs.stat(targetPath);
  } catch (error) {
    if (
      ignoreMissing &&
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return [];
    }
    throw error;
  }

  if (stat.isFile()) {
    if (!targetPath.endsWith(".ts")) {
      return [];
    }
    if (!includeTests && isTestLikeTypeScriptFile(targetPath, { extraTestSuffixes })) {
      return [];
    }
    return [targetPath];
  }

  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      if (skipNodeModules && entry.name === "node_modules") {
        continue;
      }
      out.push(...(await collectTypeScriptFiles(entryPath, options)));
      continue;
    }
    if (!entry.isFile() || !entryPath.endsWith(".ts")) {
      continue;
    }
    if (!includeTests && isTestLikeTypeScriptFile(entryPath, { extraTestSuffixes })) {
      continue;
    }
    out.push(entryPath);
  }
  return out;
}

export async function collectTypeScriptFilesFromRoots(
  sourceRoots: string[],
  options: CollectTypeScriptFilesOptions = {},
): Promise<string[]> {
  return (
    await Promise.all(
      sourceRoots.map(
        async (root) =>
          await collectTypeScriptFiles(root, {
            ignoreMissing: true,
            ...options,
          }),
      ),
    )
  ).flat();
}

export async function collectFileViolations(params: {
  sourceRoots: string[];
  repoRoot: string;
  extraTestSuffixes?: string[];
  skipFile?: (filePath: string) => boolean;
  findViolations: (content: string, filePath: string) => FileViolation[];
}): Promise<PathFileViolation[]> {
  const files = await collectTypeScriptFilesFromRoots(params.sourceRoots, {
    extraTestSuffixes: params.extraTestSuffixes,
  });

  const violations: PathFileViolation[] = [];
  for (const filePath of files) {
    if (params.skipFile?.(filePath)) {
      continue;
    }
    const content = await fs.readFile(filePath, "utf8");
    const fileViolations = params.findViolations(content, filePath);
    for (const violation of fileViolations) {
      violations.push({
        path: path.relative(params.repoRoot, filePath),
        ...violation,
      });
    }
  }
  return violations;
}

export function toLine(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

export function getPropertyNameText(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

export function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (true) {
    if (ts.isParenthesizedExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isAsExpression(current) || ts.isTypeAssertionExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isNonNullExpression(current)) {
      current = current.expression;
      continue;
    }
    return current;
  }
}

export function isDirectExecution(importMetaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return path.resolve(entry) === fileURLToPath(importMetaUrl);
}

export function runAsScript(importMetaUrl: string, main: () => Promise<void>): void {
  if (!isDirectExecution(importMetaUrl)) {
    return;
  }
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
