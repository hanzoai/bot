/**
 * cloud-sandbox.ts — a sandbox leased from cloud (hanzoai/cloud apps/sandbox,
 * /v1/sandbox) AS THE CALLER, which is the sandbox production runs.
 *
 * WHY CLOUD'S AND NOT OURS. This process has two ways to get a computer and only
 * one of them exists in production: the docker runtime (coding-task.ts) needs a
 * docker endpoint bot-gateway does not have, while cloud's sandbox is a gVisor pod
 * in hanzo-sandboxes behind a NetworkPolicy, digest-pinned, with no
 * service-account token — confined and verified (LLM.md, "The sandbox").
 *
 * WHY AS THE CALLER. Every request carries the caller's own IAM bearer and the org
 * they act in, and nothing of ours. So the sandbox lands in the caller's org, is
 * billed to the caller's wallet (cloud's prepaid gate refuses a lease the caller
 * cannot afford), and is signed in as the caller (cloud apps/sandbox cred.go) —
 * which is how the bot inside reaches models as its owner. This file mints no
 * credential and stores none.
 *
 * Plain node:http, not fetch: one exec can hold its request for the whole run,
 * and fetch's dispatcher cuts a response whose headers take longer than five
 * minutes. Every call here carries its own bound instead.
 */

import http from "node:http";
import https from "node:https";
import { cloudApiUrl } from "./cloud-agents.js";

export type SandboxCaller = {
  /** The org the caller acts in — sent as X-Org-Id, re-validated by cloud. */
  org: string;
  /** The caller's own IAM bearer, relayed unchanged. */
  bearer: string;
};

/** What a bot run needs from a sandbox: a computer, a command in it, and its end. */
export type Sandboxes = {
  /** Lease a scratch sandbox of class `desktop` (a screen) or `dev`. Answers its id. */
  lease(caller: SandboxCaller, spec: { cls: "desktop" | "dev"; ttlSec: number }): Promise<string>;
  /** Run argv to completion in the sandbox. A non-zero exit is an answer, not an error. */
  exec(
    caller: SandboxCaller,
    id: string,
    argv: string[],
    timeoutSec: number,
    signal: AbortSignal,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  /** End the sandbox and release it. */
  end(caller: SandboxCaller, id: string): Promise<void>;
};

/** Cloud answered, and the answer was no — with cloud's own reason. */
export class SandboxRefused extends Error {
  constructor(
    readonly op: string,
    readonly status: number,
    reason: string,
  ) {
    super(`sandbox ${op} refused (${status}): ${reason}`);
    this.name = "SandboxRefused";
  }
}

/** A lease waits for its pod (cloud's start timeout is 120s); a little over that. */
const LEASE_TIMEOUT_MS = 180_000;
const END_TIMEOUT_MS = 30_000;
/** Beyond the command's own bound: the round trip and cloud's teardown of the stream. */
const EXEC_SLACK_MS = 60_000;
/** Cloud caps a command's output; this caps what we will read of the answer. */
const MAX_ANSWER_BYTES = 8 << 20;
const REASON_CAP = 500;

/** cloudSandboxes is the Sandboxes client over cloud's /v1/sandbox at base. */
export function cloudSandboxes(base: string = cloudApiUrl()): Sandboxes {
  return {
    async lease(caller, spec) {
      const answer = await call(base, caller, "lease", "POST", "/v1/sandbox", {
        body: { class: spec.cls, ttlSec: spec.ttlSec },
        timeoutMs: LEASE_TIMEOUT_MS,
      });
      const id = typeof answer?.id === "string" ? answer.id.trim() : "";
      if (!id) {
        throw new Error("sandbox lease answered without an id");
      }
      return id;
    },
    async exec(caller, id, argv, timeoutSec, signal) {
      const answer = await call(base, caller, "exec", "POST", `/v1/sandbox/${seg(id)}/exec`, {
        body: { argv, timeoutSec },
        timeoutMs: timeoutSec * 1000 + EXEC_SLACK_MS,
        signal,
      });
      if (typeof answer?.exitCode !== "number") {
        throw new Error("sandbox exec answered without an exit code");
      }
      return {
        exitCode: answer.exitCode,
        stdout: typeof answer.stdout === "string" ? answer.stdout : "",
        stderr: typeof answer.stderr === "string" ? answer.stderr : "",
      };
    },
    async end(caller, id) {
      await call(base, caller, "end", "DELETE", `/v1/sandbox/${seg(id)}`, {
        timeoutMs: END_TIMEOUT_MS,
      });
    },
  };
}

function seg(id: string): string {
  return encodeURIComponent(id);
}

type Answer = Record<string, unknown> | null;

function call(
  base: string,
  caller: SandboxCaller,
  op: string,
  method: string,
  path: string,
  opts: { body?: unknown; timeoutMs: number; signal?: AbortSignal },
): Promise<Answer> {
  const url = new URL(base + path);
  const payload = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${caller.bearer}`,
    "X-Org-Id": caller.org,
  };
  if (payload !== undefined) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = String(Buffer.byteLength(payload));
  }
  const transport = url.protocol === "https:" ? https : http;
  return new Promise<Answer>((resolve, reject) => {
    const req = transport.request(url, { method, headers, signal: opts.signal }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (b: Buffer) => {
        size += b.length;
        if (size > MAX_ANSWER_BYTES) {
          req.destroy(new Error(`sandbox ${op} answer exceeds ${MAX_ANSWER_BYTES} bytes`));
          return;
        }
        chunks.push(b);
      });
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        const status = res.statusCode ?? 0;
        let parsed: Answer = null;
        try {
          parsed = text ? (JSON.parse(text) as Answer) : null;
        } catch {
          parsed = null;
        }
        if (status < 200 || status >= 300) {
          reject(new SandboxRefused(op, status, reasonOf(parsed, text)));
          return;
        }
        resolve(parsed);
      });
      res.on("error", reject);
    });
    req.setTimeout(opts.timeoutMs, () => {
      req.destroy(new Error(`sandbox ${op} timed out after ${opts.timeoutMs}ms`));
    });
    req.on("error", reject);
    if (payload !== undefined) {
      req.write(payload);
    }
    req.end();
  });
}

/** Cloud's problem-details answer names the reason in `detail`; fall back to the body. */
function reasonOf(parsed: Answer, text: string): string {
  const pick = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");
  const reason =
    pick(parsed?.detail) || pick(parsed?.message) || pick(parsed?.error) || text.trim();
  return reason.slice(0, REASON_CAP) || "no reason given";
}
