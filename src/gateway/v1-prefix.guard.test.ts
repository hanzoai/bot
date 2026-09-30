import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Every route the gateway serves and every first-party service it calls lives
// under /v1. A path literal under /api is allowed only where it names a
// third-party API, listed here with the file that talks to it.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROOTS = ["src", "extensions", "ui/src"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".turbo", "coverage"]);
// Three spellings of one path: a string or template ("/api/x", `${base}/api/x`),
// a relative string ("api/x"), and a regex literal (/^\/api\/x/).
const API_LITERAL =
  /(?:(?:["'`]|\})\/(api(?:\/[A-Za-z0-9_.%/:-]*)?)|["'`](api\/[A-Za-z0-9_.%/:-]*))(?=["'`$?\s)]|$)/g;
const API_REGEX = /\\\/(api(?![A-Za-z0-9_])(?:\\\/[A-Za-z0-9_]+)*)/g;
const SELF = "src/gateway/v1-prefix.guard.test.ts";

const THIRD_PARTY: ReadonlyArray<{ file: RegExp; path: RegExp; api: string }> = [
  { file: /^extensions\/bluebubbles\//, path: /^\/api\/v1\//, api: "BlueBubbles server" },
  { file: /^extensions\/mattermost\//, path: /^\/api\/v4(\/|$)/, api: "Mattermost" },
  {
    file: /^src\/(agents\/(models-config\.providers|ollama-stream)|memory\/embeddings-ollama)/,
    path: /^\/api\/(tags|show|chat|embeddings)$/,
    api: "Ollama",
  },
  { file: /^src\/signal\//, path: /^\/api\/v1\/(rpc|check|events)$/, api: "signal-cli" },
  {
    file: /^src\/infra\/provider-usage\.fetch\.claude/,
    path: /^\/api\/(oauth\/usage|organizations)/,
    api: "claude.ai",
  },
  { file: /qwen-portal/, path: /^\/api\/v1\/oauth2\//, api: "Qwen portal" },
  {
    file: /^extensions\/thread-ownership\//,
    path: /^\/api\/v1\/ownership\//,
    api: "Slack forwarder",
  },
  // kms.hanzo.ai serves its Infisical-compatible secrets API under /api.
  {
    file: /^src\/infra\/secrets\/kms/,
    path: /^\/api\/(v1\/auth\/universal-auth\/login|v3\/secrets\/raw\/)/,
    api: "KMS",
  },
];

function listSources(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(path.join(repoRoot, dir), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        listSources(rel, out);
      }
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      out.push(rel);
    }
  }
}

describe("/v1 route prefix", () => {
  it("serves and calls no first-party /api path", () => {
    const files: string[] = [];
    for (const root of ROOTS) {
      listSources(root, files);
    }
    expect(files.length).toBeGreaterThan(100);

    const offenders: string[] = [];
    for (const file of files) {
      if (file === SELF) {
        continue;
      }
      const source = readFileSync(path.join(repoRoot, file), "utf8");
      const found = [
        ...[...source.matchAll(API_LITERAL)].map((m) => `/${m[1] ?? m[2]}`),
        ...[...source.matchAll(API_REGEX)].map((m) => `/${m[1].replaceAll("\\/", "/")}`),
      ];
      for (const apiPath of found) {
        if (!THIRD_PARTY.some((entry) => entry.file.test(file) && entry.path.test(apiPath))) {
          offenders.push(`${file}: ${apiPath}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
