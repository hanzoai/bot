import path from "node:path";

export type PathRewriter = (text: string) => string;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `~/…` when the path is under home, else the absolute path. */
export function homeForm(abs: string, home: string): string {
  const rel = path.relative(home, abs);
  if (rel === "") {
    return "~";
  }
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
    return `~/${rel.split(path.sep).join("/")}`;
  }
  return abs;
}

/**
 * Rewrite every reference to the OpenClaw state dir to the Hanzo Bot state
 * dir, keeping the rest of the path and its form: an absolute reference stays
 * absolute, a `~/…` reference stays `~/…` when the target is under home. A
 * reference must end at a path boundary, so `~/.openclaw-work` is not
 * mistaken for `~/.openclaw`.
 */
export function createPathRewriter(params: {
  sourceDir: string;
  targetDir: string;
  home: string;
}): PathRewriter {
  const pairs: Array<[string, string]> = [[params.sourceDir, params.targetDir]];
  const tilde = homeForm(params.sourceDir, params.home);
  if (tilde !== params.sourceDir) {
    pairs.push([tilde, homeForm(params.targetDir, params.home)]);
  }
  const rules = pairs.map(
    ([from, to]) => [new RegExp(`${escapeRegExp(from)}(?=$|[/\\\\"'\\s])`, "g"), to] as const,
  );
  return (text) => {
    let out = text;
    for (const [pattern, to] of rules) {
      out = out.replace(pattern, () => to);
    }
    return out;
  };
}
