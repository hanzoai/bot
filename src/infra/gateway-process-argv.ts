// Parses gateway process command lines for process discovery.
import { normalizeLowercaseStringOrEmpty } from "@hanzo/bot-normalization-core/string-coerce";
import { normalizeStringEntries } from "@hanzo/bot-normalization-core/string-normalization";

function normalizeProcArg(arg: string): string {
  return normalizeLowercaseStringOrEmpty(arg.replaceAll("\\", "/"));
}

const ENTRY_CANDIDATES = [
  "dist/index.js",
  "dist/entry.js",
  "bot.mjs",
  "scripts/run-node.mjs",
  "src/entry.ts",
  "src/index.ts",
] as const;

export function parseProcCmdline(raw: string): string[] {
  return normalizeStringEntries(raw.split("\0"));
}

export function isBotCommandArgv(args: string[], command: string): boolean {
  const normalized = args.map(normalizeProcArg);
  const exe = (normalized[0] ?? "").replace(/\.(bat|cmd|exe)$/i, "");
  if (!normalized.includes(normalizeProcArg(command))) {
    return false;
  }
  if (normalized.some((arg) => ENTRY_CANDIDATES.some((entry) => arg.endsWith(entry)))) {
    return true;
  }
  return exe.endsWith("/bot") || exe === "bot";
}

export function isGatewayArgv(args: string[], opts?: { allowGatewayBinary?: boolean }): boolean {
  const normalized = args.map(normalizeProcArg);
  const exe = (normalized[0] ?? "").replace(/\.(bat|cmd|exe)$/i, "");
  const isGatewayBinary = exe.endsWith("/bot-gateway") || exe === "bot-gateway";
  if (!isBotCommandArgv(args, "gateway")) {
    return opts?.allowGatewayBinary === true && isGatewayBinary;
  }
  return true;
}
