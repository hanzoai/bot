export interface BotNpmResumeRunRecord {
  conclusion?: unknown;
  event?: unknown;
  head_branch?: unknown;
  head_sha?: unknown;
  html_url?: unknown;
  path?: unknown;
  workflow_id?: unknown;
}

export interface BotNpmResumeTagRecord {
  object?: {
    sha?: unknown;
    type?: unknown;
  };
  verification?: {
    verified?: unknown;
  };
}

export interface BotNpmResumeJobRecord {
  conclusion?: unknown;
  name?: unknown;
}

export interface BotNpmResumeValidationInput {
  canonicalWorkflowId: unknown;
  compareStatus: unknown;
  jobs: BotNpmResumeJobRecord[];
  run: BotNpmResumeRunRecord;
  tag: BotNpmResumeTagRecord;
  tagRef: BotNpmResumeTagRecord;
}

export interface BotNpmResumeIdentity {
  tagObjectSha: string;
  url: string;
  workflowRef: string;
  workflowSha: string;
}

export function validateBotNpmResumeRun(
  input: BotNpmResumeValidationInput,
): BotNpmResumeIdentity;

export function runBotNpmResumeGh(
  args: string[],
  params?: {
    execFileSyncImpl?: (
      command: string,
      args: string[],
      options: {
        encoding: "utf8";
        killSignal: "SIGKILL";
        maxBuffer: number;
        timeout: number;
      },
    ) => string;
  },
): string;

export function resolveBotNpmResumeRun(options: {
  repo: string;
  runId: string;
  runGh?: (args: string[]) => string;
}): BotNpmResumeIdentity;
