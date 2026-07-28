export type BotSchemaVersions = {
  state: number;
  agent: number;
};

export function parseBotSchemaVersions(value: unknown): BotSchemaVersions | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (
    !Number.isInteger(record.state) ||
    (record.state as number) < 0 ||
    !Number.isInteger(record.agent) ||
    (record.agent as number) < 0
  ) {
    return undefined;
  }
  return { state: record.state as number, agent: record.agent as number };
}

export function parsePackageBotSchemaVersions(
  packageJson: unknown,
): BotSchemaVersions | undefined {
  if (!packageJson || typeof packageJson !== "object" || Array.isArray(packageJson)) {
    return undefined;
  }
  const bot = (packageJson as Record<string, unknown>).bot;
  if (!bot || typeof bot !== "object" || Array.isArray(bot)) {
    return undefined;
  }
  return parseBotSchemaVersions((bot as Record<string, unknown>).schemaVersions);
}
