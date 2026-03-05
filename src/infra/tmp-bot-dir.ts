import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const POSIX_BOT_TMP_DIR = "/tmp/bot";

type ResolvePreferredBotTmpDirOptions = {
  accessSync?: (path: string, mode?: number) => void;
  lstatSync?: (path: string) => {
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
    mode?: number;
    uid?: number;
  };
  mkdirSync?: (path: string, opts: { recursive: boolean; mode?: number }) => void;
  chmodSync?: (path: string, mode: number) => void;
  getuid?: () => number | undefined;
  tmpdir?: () => string;
  warn?: (message: string) => void;
};

type MaybeNodeError = { code?: string };

function isNodeErrorWithCode(err: unknown, code: string): err is MaybeNodeError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as MaybeNodeError).code === code
  );
}

export function resolvePreferredBotTmpDir(options: ResolvePreferredBotTmpDirOptions = {}): string {
  const accessSync = options.accessSync ?? fs.accessSync;
  const lstatSync = options.lstatSync ?? fs.lstatSync;
  const mkdirSync = options.mkdirSync ?? fs.mkdirSync;
  const chmodSync = options.chmodSync ?? fs.chmodSync;
  const warn = options.warn ?? (() => {});
  const getuid =
    options.getuid ??
    (() => {
      try {
        return typeof process.getuid === "function" ? process.getuid() : undefined;
      } catch {
        return undefined;
      }
    });
  const tmpdir = options.tmpdir ?? os.tmpdir;
  const uid = getuid();

  const isSecureDirForUser = (st: { mode?: number; uid?: number }): boolean => {
    if (uid === undefined) {
      return true;
    }
    if (typeof st.uid === "number" && st.uid !== uid) {
      return false;
    }
    // Avoid group/other writable dirs when running on multi-user hosts.
    if (typeof st.mode === "number" && (st.mode & 0o022) !== 0) {
      return false;
    }
    return true;
  };

  const isGroupOrOtherWritable = (mode: number): boolean => {
    return (mode & 0o022) !== 0;
  };

  const repairPermissions = (dirPath: string, st: { mode?: number }): void => {
    if (typeof st.mode === "number" && isGroupOrOtherWritable(st.mode)) {
      chmodSync(dirPath, 0o700);
      warn(`tightened permissions on temp dir ${dirPath}`);
    }
  };

  const fallbackPath = (): string => {
    const base = tmpdir();
    const suffix = uid === undefined ? "bot" : `bot-${uid}`;
    return path.join(base, suffix);
  };

  const ensureFallbackDir = (dirPath: string): string => {
    try {
      const st = lstatSync(dirPath);
      if (st.isSymbolicLink()) {
        throw new Error(`Unsafe fallback OpenClaw temp dir: ${dirPath} is a symlink`);
      }
      if (!st.isDirectory()) {
        throw new Error(`Unsafe fallback OpenClaw temp dir: ${dirPath} is not a directory`);
      }
      if (typeof st.uid === "number" && uid !== undefined && st.uid !== uid) {
        throw new Error(`Unsafe fallback OpenClaw temp dir: ${dirPath} not owned by current user`);
      }
      repairPermissions(dirPath, st);
      return dirPath;
    } catch (err) {
      if (!isNodeErrorWithCode(err, "ENOENT")) {
        throw err;
      }
    }
    mkdirSync(dirPath, { recursive: true, mode: 0o700 });
    const st = lstatSync(dirPath);
    if (st.isSymbolicLink()) {
      throw new Error(`Unsafe fallback OpenClaw temp dir: ${dirPath} is a symlink`);
    }
    repairPermissions(dirPath, st);
    return dirPath;
  };

  try {
    const preferred = lstatSync(POSIX_BOT_TMP_DIR);
    if (!preferred.isDirectory() || preferred.isSymbolicLink()) {
      return ensureFallbackDir(fallbackPath());
    }
    accessSync(POSIX_BOT_TMP_DIR, fs.constants.W_OK | fs.constants.X_OK);
    if (!isSecureDirForUser(preferred)) {
      return ensureFallbackDir(fallbackPath());
    }
    return POSIX_BOT_TMP_DIR;
  } catch (err) {
    if (!isNodeErrorWithCode(err, "ENOENT")) {
      return ensureFallbackDir(fallbackPath());
    }
  }

  try {
    accessSync("/tmp", fs.constants.W_OK | fs.constants.X_OK);
    mkdirSync(POSIX_BOT_TMP_DIR, { recursive: true, mode: 0o700 });
    try {
      const preferred = lstatSync(POSIX_BOT_TMP_DIR);
      if (!preferred.isDirectory() || preferred.isSymbolicLink()) {
        return ensureFallbackDir(fallbackPath());
      }
      if (!isSecureDirForUser(preferred)) {
        return ensureFallbackDir(fallbackPath());
      }
    } catch {
      return ensureFallbackDir(fallbackPath());
    }
    return POSIX_BOT_TMP_DIR;
  } catch {
    return ensureFallbackDir(fallbackPath());
  }
}
