#!/usr/bin/env node

import ts from "typescript";
import { createPairingGuardContext } from "./lib/pairing-guard-context.ts";
import {
  collectFileViolations,
  type FileViolation,
  getPropertyNameText,
  runAsScript,
  toLine,
} from "./lib/ts-guard-utils.ts";

const { repoRoot, sourceRoots, resolveFromRepo } = createPairingGuardContext(import.meta.url);

const allowedFiles = new Set([
  resolveFromRepo("src/security/dm-policy-shared.ts"),
  resolveFromRepo("src/channels/allow-from.ts"),
  // Config migration/audit logic may intentionally reference store + group fields.
  resolveFromRepo("src/security/fix.ts"),
  resolveFromRepo("src/security/audit-channel.ts"),
]);

const storeIdentifierRe = /^(?:storeAllowFrom|storedAllowFrom|storeAllowList)$/i;
const groupNameRe =
  /(?:groupAllowFrom|effectiveGroupAllowFrom|groupAllowed|groupAllow|groupAuth|groupSender)/i;
const storeSourceCallNames = new Set([
  "readChannelAllowFromStore",
  "readChannelAllowFromStoreSync",
  "readStoreAllowFromForDmPolicy",
]);
const allowedResolverCallNames = new Set([
  "resolveEffectiveAllowFromLists",
  "resolveDmGroupAccessWithLists",
  "resolveMattermostEffectiveAllowFromLists",
  "resolveIrcEffectiveAllowlists",
]);

function getDeclarationNameText(name: ts.BindingName): string | null {
  if (ts.isIdentifier(name)) {
    return name.text;
  }
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    return name.getText();
  }
  return null;
}

function getCallName(node: ts.Node): string | null {
  if (!ts.isCallExpression(node)) {
    return null;
  }
  if (ts.isIdentifier(node.expression)) {
    return node.expression.text;
  }
  if (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.name)) {
    return node.expression.name.text;
  }
  return null;
}

function containsPairingStoreSource(node: ts.Node): boolean {
  let found = false;
  const visit = (current: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isIdentifier(current) && storeIdentifierRe.test(current.text)) {
      found = true;
      return;
    }
    if (ts.isCallExpression(current)) {
      const callName = getCallName(current);
      if (callName && storeSourceCallNames.has(callName)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

function isSuspiciousNormalizeWithStoreCall(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) {
    return false;
  }
  if (!ts.isIdentifier(node.expression) || node.expression.text !== "normalizeAllowFromWithStore") {
    return false;
  }
  const firstArg = node.arguments[0];
  if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) {
    return false;
  }
  let hasStoreProp = false;
  let hasGroupAllowProp = false;
  for (const property of firstArg.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    const name = getPropertyNameText(property.name);
    if (!name) {
      continue;
    }
    if (name === "storeAllowFrom" && containsPairingStoreSource(property.initializer)) {
      hasStoreProp = true;
    }
    if (name === "allowFrom" && groupNameRe.test(property.initializer.getText())) {
      hasGroupAllowProp = true;
    }
  }
  return hasStoreProp && hasGroupAllowProp;
}

function findViolations(content: string, filePath: string): FileViolation[] {
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  const violations: FileViolation[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const name = getDeclarationNameText(node.name);
      if (name && groupNameRe.test(name) && containsPairingStoreSource(node.initializer)) {
        const callName = getCallName(node.initializer);
        if (callName && allowedResolverCallNames.has(callName)) {
          ts.forEachChild(node, visit);
          return;
        }
        violations.push({
          line: toLine(sourceFile, node),
          reason: `group-scoped variable "${name}" references pairing-store identifiers`,
        });
      }
    }

    if (ts.isPropertyAssignment(node)) {
      const propName = getPropertyNameText(node.name);
      if (propName && groupNameRe.test(propName) && containsPairingStoreSource(node.initializer)) {
        violations.push({
          line: toLine(sourceFile, node),
          reason: `group-scoped property "${propName}" references pairing-store identifiers`,
        });
      }
    }

    if (isSuspiciousNormalizeWithStoreCall(node)) {
      violations.push({
        line: toLine(sourceFile, node),
        reason: "group allowlist uses normalizeAllowFromWithStore(...) with pairing-store entries",
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

async function main(): Promise<void> {
  const violations = await collectFileViolations({
    sourceRoots,
    repoRoot,
    findViolations,
    skipFile: (filePath) => allowedFiles.has(filePath),
  });

  if (violations.length === 0) {
    return;
  }

  console.error("Found pairing-store identifiers referenced in group auth composition:");
  for (const violation of violations) {
    console.error(`- ${violation.path}:${violation.line} (${violation.reason})`);
  }
  console.error(
    "Group auth must be composed via shared resolvers (resolveDmGroupAccessWithLists / resolveEffectiveAllowFromLists).",
  );
  process.exit(1);
}

runAsScript(import.meta.url, main);
