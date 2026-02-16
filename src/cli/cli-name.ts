import path from "node:path";

export const DEFAULT_CLI_NAME = "hanzo-bot";

const LEGACY_CLI_NAMES = ["bot"] as const;
const KNOWN_CLI_NAMES = new Set([DEFAULT_CLI_NAME, ...LEGACY_CLI_NAMES]);
const CLI_PREFIX_RE = /^(?:((?:pnpm|npm|bunx|npx)\s+))?(?:hanzo-bot|bot)\b/;

function stripCliScriptExtension(input: string): string {
  const ext = path.extname(input);
  if (!ext) {
    return input;
  }
  if (ext === ".mjs" || ext === ".cjs" || ext === ".js" || ext === ".ts") {
    return input.slice(0, -ext.length);
  }
  return input;
}

export function resolveCliName(argv: string[] = process.argv): string {
  const argv1 = argv[1];
  if (!argv1) {
    return DEFAULT_CLI_NAME;
  }
  const base = stripCliScriptExtension(path.basename(argv1).trim());
  if (KNOWN_CLI_NAMES.has(base)) {
    return base === "bot" ? DEFAULT_CLI_NAME : base;
  }
  return DEFAULT_CLI_NAME;
}

export function replaceCliName(command: string, cliName = resolveCliName()): string {
  if (!command.trim()) {
    return command;
  }
  if (!CLI_PREFIX_RE.test(command)) {
    return command;
  }
  return command.replace(CLI_PREFIX_RE, (_match, runner: string | undefined) => {
    return `${runner ?? ""}${cliName}`;
  });
}
