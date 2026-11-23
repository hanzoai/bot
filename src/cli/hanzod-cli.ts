import type { Command } from "commander";
import {
  botCheckGateway,
  ensureHanzodRunning,
  hanzodClusterDown,
  hanzodClusterUp,
  hanzodStatus,
  hanzodWorkerStatus,
  localWorkspaceRunDev,
} from "../infra/hanzod.js";
import { defaultRuntime } from "../runtime.js";

export function registerHanzodCli(program: Command) {
  const hanzod = program
    .command("hanzod")
    .description(
      "Unified local hanzod (127.0.0.1:3690) status, worker, bot, and k3s orchestration",
    );

  hanzod
    .command("status")
    .description("Fetch unified hanzod manifest (GET /v1/hanzod)")
    .action(async () => {
      try {
        const res = await hanzodStatus();
        defaultRuntime.log(JSON.stringify(res, null, 2));
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  hanzod
    .command("gateway")
    .description("Check unified hanzod bot gateway health (/v1/bot/health)")
    .option("--url <url>", "Override hanzod base URL (default: http://127.0.0.1:3690)")
    .action(async (opts: { url?: string }) => {
      const res = await botCheckGateway(opts.url);
      defaultRuntime.log(JSON.stringify(res, null, 2));
      if (!res.connected) {
        defaultRuntime.exit(1);
      }
    });

  hanzod
    .command("worker")
    .description("Inspect hanzoai/tasks linked-machine worker status (GET /v1/hanzod/worker)")
    .action(async () => {
      try {
        const res = await hanzodWorkerStatus();
        defaultRuntime.log(JSON.stringify(res, null, 2));
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  hanzod
    .command("cluster-up")
    .description("Bring up automated k3s / unified local Cloud cluster via hanzod")
    .option("--mode <mode>", "Cluster mode (e.g. k3s)")
    .action(async (opts: { mode?: string }) => {
      try {
        const res = await hanzodClusterUp(opts.mode);
        defaultRuntime.log(JSON.stringify(res, null, 2));
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  hanzod
    .command("cluster-down")
    .description("Stop local k3s / unified Cloud cluster via hanzod")
    .action(async () => {
      try {
        const res = await hanzodClusterDown();
        defaultRuntime.log(JSON.stringify(res, null, 2));
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  hanzod
    .command("ensure")
    .description("Ensure local hanzod is running on 127.0.0.1:3690")
    .action(async () => {
      const ok = await ensureHanzodRunning();
      defaultRuntime.log(JSON.stringify({ ok, origin: "http://127.0.0.1:3690" }, null, 2));
      if (!ok) {
        defaultRuntime.exit(1);
      }
    });

  hanzod
    .command("run-dev")
    .description("Run a workspace Dev prompt via hanzod (/v1/bot/bots/dev/run)")
    .requiredOption("-w, --workspace <path>", "Workspace directory path")
    .requiredOption("-p, --prompt <prompt>", "Task prompt")
    .option("--fallback-exec", "Allow fallback to legacy dev exec if hanzod is unavailable", false)
    .action(async (opts: { workspace: string; prompt: string; fallbackExec?: boolean }) => {
      try {
        const res = await localWorkspaceRunDev({
          workspacePath: opts.workspace,
          prompt: opts.prompt,
          allowLegacyExec: Boolean(opts.fallbackExec),
        });
        defaultRuntime.log(JSON.stringify(res, null, 2));
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });
}
