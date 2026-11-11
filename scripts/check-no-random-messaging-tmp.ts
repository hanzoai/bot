#!/usr/bin/env node

import ts from "typescript";
import { runCallsiteGuard } from "./lib/callsite-guard.ts";
import { runAsScript, toLine, unwrapExpression } from "./lib/ts-guard-utils.ts";

const sourceRoots = [
  "src/channels",
  "src/infra/outbound",
  "src/line",
  "src/media-understanding",
  "extensions",
];
const allowedRelativePaths = new Set(["extensions/feishu/src/dedup.ts"]);

function collectOsTmpdirImports(sourceFile: ts.SourceFile) {
  const osModuleSpecifiers = new Set(["node:os", "os"]);
  const osNamespaceOrDefault = new Set<string>();
  const namedTmpdir = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) {
      continue;
    }
    if (!statement.importClause || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    if (!osModuleSpecifiers.has(statement.moduleSpecifier.text)) {
      continue;
    }
    const clause = statement.importClause;
    if (clause.name) {
      osNamespaceOrDefault.add(clause.name.text);
    }
    if (!clause.namedBindings) {
      continue;
    }
    if (ts.isNamespaceImport(clause.namedBindings)) {
      osNamespaceOrDefault.add(clause.namedBindings.name.text);
      continue;
    }
    for (const element of clause.namedBindings.elements) {
      if ((element.propertyName?.text ?? element.name.text) === "tmpdir") {
        namedTmpdir.add(element.name.text);
      }
    }
  }
  return { osNamespaceOrDefault, namedTmpdir };
}

export function findMessagingTmpdirCallLines(content: string, fileName = "source.ts"): number[] {
  const sourceFile = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true);
  const { osNamespaceOrDefault, namedTmpdir } = collectOsTmpdirImports(sourceFile);
  const lines: number[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = unwrapExpression(node.expression);
      if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.name) &&
        callee.name.text === "tmpdir" &&
        ts.isIdentifier(callee.expression) &&
        osNamespaceOrDefault.has(callee.expression.text)
      ) {
        lines.push(toLine(sourceFile, callee));
      } else if (ts.isIdentifier(callee) && namedTmpdir.has(callee.text)) {
        lines.push(toLine(sourceFile, callee));
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return lines;
}

export async function main(): Promise<void> {
  await runCallsiteGuard({
    importMetaUrl: import.meta.url,
    sourceRoots,
    findCallLines: findMessagingTmpdirCallLines,
    skipRelativePath: (relativePath) => allowedRelativePaths.has(relativePath),
    header: "Found os.tmpdir()/tmpdir() usage in messaging/channel runtime sources:",
    footer:
      "Use resolvePreferredBotTmpDir() or plugin-sdk temp helpers instead of host tmp defaults.",
    sortViolations: false,
  });
}

runAsScript(import.meta.url, main);
