type SqliteUserVersionReader = {
  prepare: (sql: string) => { get: () => unknown };
};

export function readSqliteUserVersion(db: SqliteUserVersionReader): number {
  const row = db.prepare("PRAGMA user_version").get() as { user_version?: unknown } | undefined;
  return Number(row?.user_version ?? 0);
}

export function createNewerSqliteSchemaVersionError(
  databaseLabel: string,
  pathname: string,
  schemaVersion: number,
  supportedVersion: number,
): Error {
  const error = new Error(
    `${databaseLabel} ${pathname} uses newer schema version ${schemaVersion}; this Bot build supports ${supportedVersion}. Upgrade Bot before opening this database. Do not downgrade Bot or modify the database. To run this older build, use a separate state directory or restore a compatible backup. See https://docs.bot.ai/reference/database-schemas.`,
  );
  error.name = "SqliteSchemaVersionError";
  return error;
}
