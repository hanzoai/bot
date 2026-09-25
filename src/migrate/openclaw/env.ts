/**
 * The state-dir `.env`, converted line by line. Values are carried as their
 * raw text and never parsed, printed or logged; only key names are reported.
 */

const ENTRY_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

/** Keys that locate an OpenClaw install. The importer chose the target, so they are not carried. */
const LOCATOR_KEYS = new Set([
  "OPENCLAW_STATE_DIR",
  "OPENCLAW_CONFIG_PATH",
  "OPENCLAW_HOME",
  "OPENCLAW_PROFILE",
]);

export type EnvEntry = { key: string; raw: string };

/** Parse KEY=VALUE entries, keeping each value's raw text (quotes included, multi-line quotes joined). */
export function parseEnvEntries(text: string): EnvEntry[] {
  const lines = text.split(/\r?\n/);
  const entries: EnvEntry[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = ENTRY_RE.exec(lines[i] ?? "");
    if (!match) {
      continue;
    }
    const key = match[1] ?? "";
    let raw = (match[2] ?? "").trim();
    const quote = raw[0];
    if ((quote === '"' || quote === "'" || quote === "`") && !closesQuote(raw, quote)) {
      while (i + 1 < lines.length) {
        i += 1;
        raw += `\n${lines[i]}`;
        if (closesQuote(raw, quote)) {
          break;
        }
      }
    }
    entries.push({ key, raw });
  }
  return entries;
}

function closesQuote(raw: string, quote: string): boolean {
  return raw.length > 1 && raw.slice(1).includes(quote);
}

export type EnvConversion = {
  entries: EnvEntry[];
  renamed: Array<{ from: string; to: string }>;
  dropped: string[];
};

/** OPENCLAW_<NAME> becomes BOT_<NAME>; locator keys are dropped; values have paths rewritten. */
export function convertEnvEntries(
  entries: EnvEntry[],
  rewritePaths: (text: string) => string,
): EnvConversion {
  const out = new Map<string, EnvEntry>();
  const renamed: Array<{ from: string; to: string }> = [];
  const dropped: string[] = [];
  for (const entry of entries) {
    if (LOCATOR_KEYS.has(entry.key)) {
      dropped.push(entry.key);
      continue;
    }
    let key = entry.key;
    if (key.startsWith("OPENCLAW_")) {
      key = `BOT_${key.slice("OPENCLAW_".length)}`;
      renamed.push({ from: entry.key, to: key });
    }
    out.set(key, { key, raw: rewritePaths(entry.raw) });
  }
  return { entries: [...out.values()], renamed, dropped };
}

/** Append the entries whose keys the existing file does not define. Existing lines are kept verbatim. */
export function mergeEnvText(
  existing: string | null,
  incoming: EnvEntry[],
): {
  text: string;
  added: string[];
} {
  const present = new Set(parseEnvEntries(existing ?? "").map((entry) => entry.key));
  const added = incoming.filter((entry) => !present.has(entry.key));
  if (added.length === 0) {
    return { text: existing ?? "", added: [] };
  }
  const head = existing && !existing.endsWith("\n") ? `${existing}\n` : (existing ?? "");
  const body = added.map((entry) => `${entry.key}=${entry.raw}`).join("\n");
  return { text: `${head}${body}\n`, added: added.map((entry) => entry.key) };
}
