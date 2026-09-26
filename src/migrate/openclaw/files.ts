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

export type CopyTally = {
  created: number;
  unchanged: number;
  conflicts: string[];
  /** Where fromDir really is, when fromDir itself is a link. */
  linkedTo?: string;
};

function sameBytes(a: string, b: string): boolean {
  const statA = fs.statSync(a);
  const statB = fs.statSync(b);
  if (statA.size !== statB.size) {
    return false;
  }
  return fs.readFileSync(a).equals(fs.readFileSync(b));
}

/**
 * Plan copying `fromDir` into `toDir` file by file. A fromDir that is itself
 * a link is copied as the files it points at, so the target gets a dir of its
 * own. Symlinks below it are recreated, never followed; `relink` may point one
 * elsewhere, given the link's target, the path it is created at and the link
 * it is copied from (a link into the OpenClaw dir is pointed at the same place
 * in the Hanzo Bot dir, so writing through it cannot change the OpenClaw
 * install). `reached` collects
 * the real place of every link the walk meets, `claimed` the targets already
 * planned (a second copy to one is a conflict). `skip` names entries
 * (relative to fromDir) that are not copied.
 */
export function planCopyTree(params: {
  fromDir: string;
  toDir: string;
  actions: Action[];
  claimed: Set<string>;
  reached: Set<string>;
  skip?: (rel: string) => boolean;
  relink?: (target: string, at: string, from: string) => string;
}): CopyTally {
  const tally: CopyTally = { created: 0, unchanged: 0, conflicts: [] };
  if (isLink(params.fromDir)) {
    tally.linkedTo = realPathOf(params.fromDir);
    params.reached.add(tally.linkedTo);
  }
  const walk = (rel: string) => {
    const from = path.join(params.fromDir, rel);
    const to = path.join(params.toDir, rel);
    const stat = rel ? fs.lstatSync(from) : fs.statSync(from);
    if (stat.isSymbolicLink()) {
      if (fs.existsSync(from)) {
        params.reached.add(realPathOf(from));
      }
      const target = params.relink?.(fs.readlinkSync(from), to, from) ?? fs.readlinkSync(from);
      if (params.claimed.has(to)) {
        tally.conflicts.push(rel);
      } else if (!fs.existsSync(to) && !isLink(to)) {
        params.actions.push({ kind: "link", to, target });
        params.claimed.add(to);
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
    if (params.claimed.has(to)) {
      tally.conflicts.push(rel);
    } else if (!fs.existsSync(to) && !isLink(to)) {
      params.actions.push({ kind: "copy", from, to, mode: stat.mode & 0o777 });
      params.claimed.add(to);
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

/**
 * A copied link keeps pointing where it pointed in OpenClaw's tree, except
 * that a place inside a copied dir (as written or through links) becomes the
 * same place inside its copy. `roots` pairs each copied dir with its copy.
 * A relative link that names that place from its new dir is kept as written;
 * any other is written as the absolute path.
 */
export function relinkInto(
  roots: Array<[string, string]>,
): (target: string, at: string, from: string) => string {
  const pairs = roots
    .flatMap(([from, to]): Array<[string, string]> => {
      const real = realPathOf(from);
      return real === from
        ? [[from, to]]
        : [
            [from, to],
            [real, to],
          ];
    })
    .toSorted((a, b) => b[0].length - a[0].length);
  const inTarget = (place: string): string | undefined => {
    for (const candidate of [place, realPathOf(place)]) {
      const pair = pairs.find(([from]) => isWithin(from, candidate));
      if (pair) {
        return path.join(pair[1], path.relative(pair[0], candidate));
      }
    }
    return undefined;
  };
  return (target, at, from) => {
    // The OS reads a relative target from the link's real dir.
    const place = path.resolve(realPathOf(path.dirname(from)), target);
    const mapped = inTarget(place);
    if (path.isAbsolute(target)) {
      return mapped ?? target;
    }
    const meant = mapped ?? place;
    return path.resolve(path.dirname(at), target) === meant ? target : meant;
  };
}

/** Whether `file` is `root` or lies under it. */
export function isWithin(root: string, file: string): boolean {
  const rel = path.relative(root, file);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * A path with its links resolved, for a path that may not exist yet: the
 * nearest dir that does is resolved. realpath.native spells each name as the
 * disk does, so paths on a case-insensitive volume compare as strings.
 */
export function realPathOf(file: string): string {
  let existing = path.resolve(file);
  while (!fs.existsSync(existing) && path.dirname(existing) !== existing) {
    existing = path.dirname(existing);
  }
  return path.join(fs.realpathSync.native(existing), path.relative(existing, path.resolve(file)));
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

/** The first link below `root` on the way to `file`: one the plan creates or one on disk. */
function firstLink(
  root: string,
  file: string,
  planned: Map<string, string>,
): { at: string; planned: boolean } | undefined {
  const rel = path.relative(root, path.dirname(file));
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return undefined;
  }
  let at = root;
  for (const part of rel ? rel.split(path.sep) : []) {
    at = path.join(at, part);
    if (planned.has(at)) {
      return { at, planned: true };
    }
    if (isLink(at)) {
      return { at, planned: false };
    }
  }
  return undefined;
}

type Guard = { targetRoot: string; sources: Iterable<string>; actions: Action[] };

type GuardHit = { dir: string; lands: string; link?: { at: string; planned: boolean } };

/**
 * A check of where writing a file would land, for the plan so far: in a dir
 * OpenClaw uses, or not (undefined). The dirs OpenClaw uses are the OpenClaw
 * install, a dir outside it that the plan reads through a link, and a
 * workspace OpenClaw keeps outside it; a dir that holds the target (a link to
 * home, say) guards nothing the target does not already. The write is
 * followed through links on disk and links the plan creates.
 */
export function guardedLanding(guard: Guard): (file: string) => GuardHit | undefined {
  const target = realPathOf(guard.targetRoot);
  const guarded = [...new Set([...guard.sources].map(realPathOf))].filter(
    (dir) => !isWithin(dir, target),
  );
  const planned = new Map<string, string>();
  for (const action of guard.actions) {
    if (action.kind === "link") {
      planned.set(action.to, action.target);
    }
  }
  return (file) => {
    const lands = landing(file, planned);
    const dir = guarded.find((root) => isWithin(root, lands));
    return dir ? { dir, lands, link: firstLink(guard.targetRoot, file, planned) } : undefined;
  };
}

/** Refuse a plan that would write into a dir OpenClaw uses (see guardedLanding). */
export function assertOutsideSources(guard: Guard): void {
  const check = guardedLanding(guard);
  for (const action of guard.actions) {
    const file = action.kind === "backup" ? action.file : action.to;
    const hit = check(file);
    if (!hit) {
      continue;
    }
    const { dir, lands, link } = hit;
    const fix = !link
      ? "Replace the link on its way with a plain dir, then run again."
      : link.planned
        ? `Create ${link.at} as a plain dir first, then run again: the import writes into it instead of linking it.`
        : `Replace the link ${link.at} with a plain dir (a copy of what it points at), then run again.`;
    throw new Error(
      `${file} leads into ${dir}, which OpenClaw uses, through ${link ? `the link ${link.at}` : "a link"} (it lands at ${lands}); nothing was written. ${fix}`,
    );
  }
}

/** Two planned writes to one file would lose one of them; the plan never makes them. */
export function assertUniqueTargets(actions: Action[]): void {
  const seen = new Set<string>();
  for (const action of actions) {
    if (action.kind === "backup") {
      continue;
    }
    if (seen.has(action.to)) {
      throw new Error(`two planned writes to ${action.to}; nothing was written`);
    }
    seen.add(action.to);
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
