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
 * Plan copying `fromDir` into `toDir` file by file. Symlinks are recreated,
 * never followed; `relink` may point one elsewhere (an absolute link into the
 * OpenClaw dir is pointed at the same place in the Hanzo Bot dir, so writing
 * through it cannot change the OpenClaw install). `skip` names entries
 * (relative to fromDir) that are not copied.
 */
export function planCopyTree(params: {
  fromDir: string;
  toDir: string;
  actions: Action[];
  skip?: (rel: string) => boolean;
  relink?: (target: string) => string;
}): CopyTally {
  const tally: CopyTally = { created: 0, unchanged: 0, conflicts: [] };
  const walk = (rel: string) => {
    const from = path.join(params.fromDir, rel);
    const to = path.join(params.toDir, rel);
    const stat = fs.lstatSync(from);
    if (stat.isSymbolicLink()) {
      const target = params.relink?.(fs.readlinkSync(from)) ?? fs.readlinkSync(from);
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
    // A dangling link at the target is there too: a copy would not replace it.
    if (!fs.existsSync(to) && !isLink(to)) {
      params.actions.push({ kind: "copy", from, to, mode: stat.mode & 0o777 });
      tally.created += 1;
    } else if (fs.existsSync(to) && fs.statSync(to).isFile() && sameBytes(from, to)) {
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

/** An absolute link target inside `sourceRoot` names the same place inside `targetRoot`. */
export function relinkInto(sourceRoot: string, targetRoot: string): (target: string) => string {
  return (target) => {
    if (!path.isAbsolute(target)) {
      return target;
    }
    return isWithin(sourceRoot, target)
      ? path.join(targetRoot, path.relative(sourceRoot, target))
      : target;
  };
}

/** Whether `file` is `root` or lies under it. */
export function isWithin(root: string, file: string): boolean {
  const rel = path.relative(root, file);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** A path with its links resolved, for a path that may not exist yet: the nearest dir that does is resolved. */
export function realPathOf(file: string): string {
  let existing = path.resolve(file);
  while (!fs.existsSync(existing) && path.dirname(existing) !== existing) {
    existing = path.dirname(existing);
  }
  return path.join(fs.realpathSync(existing), path.relative(existing, path.resolve(file)));
}

/**
 * Where writing `file` lands once the links on its way are followed: links on
 * disk and links the plan creates. Its last component is not followed: a
 * write replaces it and a copy or link refuses to.
 */
function landing(file: string, planned: Map<string, string>, depth = 0): string {
  if (depth > 40) {
    throw new Error(`too many links on the way to ${file}`);
  }
  for (let at = path.dirname(file); path.dirname(at) !== at; at = path.dirname(at)) {
    const target = planned.get(at);
    if (target !== undefined) {
      const via = path.join(path.resolve(path.dirname(at), target), path.relative(at, file));
      return landing(via, planned, depth + 1);
    }
  }
  return path.join(realPathOf(path.dirname(file)), path.basename(file));
}

/**
 * Refuse a plan that would write into the OpenClaw install through a link: a
 * dir in the Hanzo Bot state dir that links into it, or a copied link that
 * leads back into it.
 */
export function assertOutsideSource(sourceRoot: string, actions: Action[]): void {
  const source = realPathOf(sourceRoot);
  const planned = new Map<string, string>();
  for (const action of actions) {
    if (action.kind === "link") {
      planned.set(action.to, action.target);
    }
  }
  for (const action of actions) {
    const file = action.kind === "backup" ? action.file : action.to;
    const lands = landing(file, planned);
    if (isWithin(source, lands)) {
      throw new Error(
        `${file} leads into the OpenClaw install (${lands}) through a link; nothing was written. Replace the link in the Hanzo Bot dir with a copy of what it points at, then run again.`,
      );
    }
  }
}

function assertInside(targetRoot: string, file: string): void {
  const rel = path.relative(targetRoot, path.resolve(file));
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`refusing to write outside ${targetRoot}: ${file}`);
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
    assertInside(targetRoot, action.kind === "backup" ? action.file : action.to);
  }
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
      fs.copyFileSync(action.from, action.to, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(action.to, action.mode);
    } else {
      const tmp = `${action.to}.migrate-${process.pid}.tmp`;
      fs.writeFileSync(tmp, action.content, { mode: action.mode });
      fs.chmodSync(tmp, action.mode);
      fs.renameSync(tmp, action.to);
    }
  }
}
