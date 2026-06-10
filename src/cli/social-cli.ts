import type { Command } from "commander";
import { defaultRuntime } from "../runtime.js";
import { runCommandWithRuntime } from "./cli-utils.js";

// Hanzo Social CLI — thin client to social.hanzo.ai (postiz-app fork).
//
// Endpoints:
//   POST /public/agent     — create a post via AGENT_API_KEY (no JWT)
//   GET  /integrations/list — list connected social channels (JWT required)
//   POST /posts            — schedule a post (JWT required)
//
// The JWT-gated commands are stubbed until Task #28 lands Hanzo IAM SSO
// for hanzo-social — at which point bot can mint a bearer via the shared
// IAM client and call those endpoints directly.

const DEFAULT_URL = process.env.HANZO_SOCIAL_URL ?? "https://social.hanzo.ai";

async function postAgent(text: string): Promise<void> {
  const apiKey = process.env.HANZO_SOCIAL_AGENT_API_KEY;
  if (!apiKey) {
    defaultRuntime.error(
      "HANZO_SOCIAL_AGENT_API_KEY is not set. Provision via Hanzo KMS (project hanzo-social, key AGENT_API_KEY).",
    );
    defaultRuntime.exit(1);
    return;
  }
  const res = await fetch(`${DEFAULT_URL}/public/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, apiKey }),
  });
  if (!res.ok) {
    defaultRuntime.error(`POST /public/agent failed: ${res.status} ${res.statusText}`);
    defaultRuntime.exit(1);
    return;
  }
  defaultRuntime.log(await res.text());
}

export function registerSocialCli(program: Command) {
  const social = program
    .command("social")
    .description("Hanzo Social — schedule and publish posts via social.hanzo.ai");

  social
    .command("post")
    .description("Create a post via the agent endpoint (uses HANZO_SOCIAL_AGENT_API_KEY)")
    .requiredOption("--text <text>", "Post body")
    .action((opts: { text: string }) =>
      runCommandWithRuntime(defaultRuntime, () => postAgent(opts.text)),
    );

  social
    .command("integrations")
    .description("List connected channels (requires Hanzo IAM SSO — pending Task #28)")
    .action(() => {
      defaultRuntime.log(
        "TODO: requires JWT from hanzo.id (IAM_CLIENT_ID=hanzo-social). Tracked as Task #28.",
      );
    });

  social
    .command("schedule")
    .description("Schedule a post (requires Hanzo IAM SSO — pending Task #28)")
    .requiredOption("--text <text>", "Post body")
    .requiredOption("--at <iso>", "ISO-8601 timestamp")
    .action(() => {
      defaultRuntime.log(
        "TODO: requires JWT from hanzo.id (IAM_CLIENT_ID=hanzo-social). Tracked as Task #28.",
      );
    });
}
