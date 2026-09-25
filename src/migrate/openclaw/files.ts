import fs from "node:fs";
import path from "node:path";

/**
 * Filesystem steps the importer takes. Planning only reads; `applyActions`
 * performs the writes the plan decided on. Nothing here writes outside the
 * target dir, and a file that already exists with different bytes is never
 * replaced by a copy.
 */

export type Action =
  | { kind: "write"; to: string; content: string; mode: number }
  | { kind: "copy"; from: string; to: string; mode: number }
  | { kind: "link"; to: string; target: string }
  | { kind: "backup"; file: string };

export type CopyTally = { created: number; unchanged: number; conflicts: string[] };

function sameBytes(a: string, b: string): boolean {
  const statA = fs.statSync(a);
  const statB = fs.statSync(b);
  if (statA.size !== statB.size) {
    return false;
  }
  return fs.readFileSync(a).equals(fs.readFileSync(b));
}

/**
 * Plan copying `fromDir` into `toDir` file by file. Symlinks are recreated
 * pointing where they pointed; they are never followed. `skip` names entries
 * (relative to fromDir) that are not copied.
 */
export function planCopyTree(params: {
  fromDir: string;
  toDir: string;
  actions: Action[];
  skip?: (rel: string) => boolean;
}): CopyTally {
  const tally: CopyTally = { created: 0, unchanged: 0, conflicts: [] };
  const walk = (rel: string) => {
    const from = path.join(params.fromDir, rel);
    const to = path.join(params.toDir, rel);
    const stat = fs.lstatSync(from);
    if (stat.isSymbolicLink()) {
      const target = fs.readlinkSync(from);
      if (!fs.existsSync(to) && !isLink(to)) {
        params.actions.push({ kind: "link", to, target });
        tally.created += 1;
      } else if (isLink(to) && fs.readlinkSync(to) === target) {
        tally.unchanged += 1;
      } else {
        tally.conflicts.push(rel);
      }
      return;
    }
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(from).toSorted()) {
        const sub = rel ? path.join(rel, name) : name;
        if (!params.skip?.(sub)) {
          walk(sub);
        }
      }
      return;
    }
    if (!stat.isFile()) {
      return;
    }
    if (!fs.existsSync(to)) {
      params.actions.push({ kind: "copy", from, to, mode: stat.mode & 0o777 });
      tally.created += 1;
    } else if (fs.statSync(to).isFile() && sameBytes(from, to)) {
      tally.unchanged += 1;
    } else {
      tally.conflicts.push(rel);
    }
  };
  walk("");
  return tally;
}

function isLink(file: string): boolean {
  try {
    return fs.lstatSync(file).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Directory mode: 0700 for the state dir itself and under credentials/ and agents/, else 0755. */
function dirMode(targetRoot: string, dir: string): number {
  const rel = path.relative(targetRoot, dir);
  const top = rel.split(path.sep)[0];
  return rel === "" || top === "credentials" || top === "agents" ? 0o700 : 0o755;
}

function ensureDir(targetRoot: string, dir: string): void {
  if (fs.existsSync(dir)) {
    return;
  }
  ensureDir(targetRoot, path.dirname(dir));
  fs.mkdirSync(dir, { mode: dirMode(targetRoot, dir) });
}

export async function applyActions(targetRoot: string, actions: Action[]): Promise<void> {
  const { rotateConfigBackups } = await import("../../config/backup-rotation.js");
  for (const action of actions) {
    if (action.kind === "backup") {
      await rotateConfigBackups(action.file, {
        unlink: (file) => fs.promises.unlink(file),
        rename: (from, to) => fs.promises.rename(from, to),
      });
      fs.copyFileSync(action.file, `${action.file}.bak`);
      fs.chmodSync(`${action.file}.bak`, 0o600);
      continue;
    }
    ensureDir(targetRoot, path.dirname(action.to));
    if (action.kind === "link") {
      fs.symlinkSync(action.target, action.to);
    } else if (action.kind === "copy") {
      fs.copyFileSync(action.from, action.to);
      fs.chmodSync(action.to, action.mode);
    } else {
      const tmp = `${action.to}.migrate-${process.pid}.tmp`;
      fs.writeFileSync(tmp, action.content, { mode: action.mode });
      fs.chmodSync(tmp, action.mode);
      fs.renameSync(tmp, action.to);
    }
  }
}
