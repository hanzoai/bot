#!/usr/bin/env node

import ts from "typescript";
import { runCallsiteGuard } from "./lib/callsite-guard.ts";
import { runAsScript, toLine, unwrapExpression } from "./lib/ts-guard-utils.ts";

const sourceRoots = ["src", "extensions"];

function isDeprecatedRegisterHttpHandlerCall(expression: ts.Expression): boolean {
  const callee = unwrapExpression(expression);
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.name) &&
    callee.name.text === "registerHttpHandler"
  );
}

export function findDeprecatedRegisterHttpHandlerLines(
  content: string,
  fileName = "source.ts",
): number[] {
  const sourceFile = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true);
  const lines: number[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isDeprecatedRegisterHttpHandlerCall(node.expression)) {
      lines.push(toLine(sourceFile, node.expression));
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
    findCallLines: findDeprecatedRegisterHttpHandlerLines,
    header: "Found deprecated plugin API call registerHttpHandler(...):",
    footer:
      "Use registerHttpRoute({ path, auth, match, handler }) and registerPluginHttpRoute for dynamic webhook paths.",
  });
}

runAsScript(import.meta.url, main);
