import { replaceCliName, resolveCliName } from "./cli-name.js";
import { normalizeProfileName } from "./profile-utils.js";

const PROFILE_FLAG_RE = /(?:^|\s)--profile(?:\s|=|$)/;
const DEV_FLAG_RE = /(?:^|\s)--dev(?:\s|$)/;

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildCliPrefixRegex(cliName: string): RegExp {
  const escaped = escapeRegExp(cliName);
  return new RegExp(`^(?:((?:pnpm|npm|bunx|npx)\\s+))?${escaped}\\b`);
}

export function formatCliCommand(
  command: string,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string {
  const cliName = resolveCliName();
  const cliPrefixRe = buildCliPrefixRegex(cliName);
  const normalizedCommand = replaceCliName(command, cliName);
  const profile = normalizeProfileName(env.BOT_PROFILE);
  if (!profile) {
    return normalizedCommand;
  }
  if (!cliPrefixRe.test(normalizedCommand)) {
    return normalizedCommand;
  }
  if (PROFILE_FLAG_RE.test(normalizedCommand) || DEV_FLAG_RE.test(normalizedCommand)) {
    return normalizedCommand;
  }
  return normalizedCommand.replace(cliPrefixRe, (_match, runner: string | undefined) => {
    const prefix = runner ?? "";
    return `${prefix}${cliName} --profile ${profile}`;
  });
}
