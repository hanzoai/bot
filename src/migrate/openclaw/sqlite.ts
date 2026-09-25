import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import zlib from "node:zlib";
import { requireNodeSqlite } from "../../memory/sqlite.js";

/**
 * Read-only access to an OpenClaw SQLite database. The file and its -wal/-shm
 * companions are copied into a private temp dir and opened there, so the
 * OpenClaw install is never opened for writing and committed WAL pages are seen.
 */
export type OpenClawDb = {
  hasTable: (name: string) => boolean;
  all: <T>(sql: string, ...params: Array<string | number>) => T[];
  close: () => void;
};

export function openOpenClawDb(file: string): OpenClawDb {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-migrate-openclaw-"));
  const copy = path.join(dir, path.basename(file));
  fs.copyFileSync(file, copy);
  for (const suffix of ["-wal", "-shm"]) {
    if (fs.existsSync(`${file}${suffix}`)) {
      fs.copyFileSync(`${file}${suffix}`, `${copy}${suffix}`);
    }
  }
  const { DatabaseSync: Database } = requireNodeSqlite();
  let db: DatabaseSync;
  try {
    db = new Database(copy);
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw err;
  }
  const tables = new Set(
    (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
        name: string;
      }>
    ).map((row) => row.name),
  );
  return {
    hasTable: (name) => tables.has(name),
    all: <T>(sql: string, ...params: Array<string | number>) =>
      db.prepare(sql).all(...params) as T[],
    close: () => {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function withOpenClawDb<T>(file: string, read: (db: OpenClawDb) => T): T {
  const db = openOpenClawDb(file);
  try {
    return read(db);
  } finally {
    db.close();
  }
}

/** A transcript event body: stored as TEXT, or as a zstd frame with its UTF-8 length. */
export function decodeTranscriptEvent(row: {
  event_json: string | null;
  event_zstd: Uint8Array | null;
  event_utf8_bytes: number | null;
}): string {
  if (typeof row.event_json === "string") {
    return row.event_json;
  }
  if (!row.event_zstd) {
    throw new Error("transcript event has neither event_json nor event_zstd");
  }
  if (typeof zlib.zstdDecompressSync !== "function") {
    throw new Error("compressed transcript events need Node 22.15 or newer (zstd)");
  }
  const bytes = zlib.zstdDecompressSync(row.event_zstd, {
    maxOutputLength: row.event_utf8_bytes ?? undefined,
  });
  return bytes.toString("utf8");
}
