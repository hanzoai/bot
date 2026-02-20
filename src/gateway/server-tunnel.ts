/**
 * Gateway Tunnel Module
 *
 * Multi-provider tunnel support for exposing the local gateway to the internet.
 * Supports cloudflared, ngrok, localxpose, and zrok.
 *
 * Based on the pattern from bot/extensions/voice-call/src/tunnel.ts.
 */

import { spawn, type ChildProcess } from "node:child_process";
import type { GatewayTunnelConfig, GatewayTunnelProvider } from "../config/types.gateway.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TunnelResult {
  /** The public WebSocket URL (wss://...) */
  publicUrl: string;
  /** The public HTTP origin (https://...) for CORS */
  publicOrigin: string;
  /** Stop the tunnel process */
  stop: () => Promise<void>;
  /** Tunnel provider name */
  provider: GatewayTunnelProvider;
}

interface TunnelLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
}

// ---------------------------------------------------------------------------
// Provider availability checks
// ---------------------------------------------------------------------------

function isCommandAvailable(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(command, ["--version"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
}

export async function isProviderAvailable(provider: GatewayTunnelProvider): Promise<boolean> {
  switch (provider) {
    case "cloudflared":
      return isCommandAvailable("cloudflared");
    case "ngrok":
      return isCommandAvailable("ngrok");
    case "localxpose":
      return isCommandAvailable("loclx");
    case "zrok":
      return isCommandAvailable("zrok");
    case "none":
      return true;
    default:
      return false;
  }
}

/** Auto-detect the first available tunnel provider. */
export async function detectProvider(): Promise<GatewayTunnelProvider> {
  for (const provider of ["cloudflared", "ngrok", "localxpose", "zrok"] as const) {
    if (await isProviderAvailable(provider)) {
      return provider;
    }
  }
  return "none";
}

// ---------------------------------------------------------------------------
// Helper: create stop function from child process
// ---------------------------------------------------------------------------

function createStopFn(proc: ChildProcess): () => Promise<void> {
  return async () => {
    proc.kill("SIGTERM");
    await new Promise<void>((res) => {
      proc.on("close", () => res());
      setTimeout(res, 3000);
    });
  };
}

/** Convert an HTTP(S) URL to a WSS URL for the gateway. */
function toWssUrl(httpUrl: string): string {
  return httpUrl
    .replace(/^https:\/\//, "wss://")
    .replace(/^http:\/\//, "ws://")
    .replace(/\/$/, "");
}

/** Extract the origin (https://host) from a URL. */
function toOrigin(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Cloudflared
// ---------------------------------------------------------------------------

async function startCloudflaredTunnel(
  port: number,
  config: GatewayTunnelConfig,
): Promise<TunnelResult> {
  const args = ["tunnel", "--url", `http://localhost:${port}`];
  if (config.domain) {
    // Named tunnel with custom domain requires different invocation
    args.push("--hostname", config.domain);
  }

  return new Promise((resolve, reject) => {
    const proc = spawn("cloudflared", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let resolved = false;
    let stderrBuffer = "";

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill("SIGTERM");
        reject(new Error("cloudflared startup timed out (30s)"));
      }
    }, 30000);

    // cloudflared prints the tunnel URL to stderr
    const processOutput = (data: Buffer) => {
      stderrBuffer += data.toString();
      // Match the URL pattern cloudflared outputs
      const match = stderrBuffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        const publicHttpUrl = match[0];
        resolve({
          publicUrl: toWssUrl(publicHttpUrl),
          publicOrigin: toOrigin(publicHttpUrl),
          provider: "cloudflared",
          stop: createStopFn(proc),
        });
      }
    };

    proc.stderr.on("data", processOutput);
    proc.stdout.on("data", processOutput);

    proc.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`Failed to start cloudflared: ${err.message}`));
      }
    });

    proc.on("close", (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`cloudflared exited unexpectedly with code ${code}`));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// ngrok
// ---------------------------------------------------------------------------

async function startNgrokTunnel(port: number, config: GatewayTunnelConfig): Promise<TunnelResult> {
  if (config.authToken) {
    await runCommand("ngrok", ["config", "add-authtoken", config.authToken]);
  }

  const args = ["http", String(port), "--log", "stdout", "--log-format", "json"];
  if (config.domain) {
    args.push("--domain", config.domain);
  }

  return new Promise((resolve, reject) => {
    const proc = spawn("ngrok", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let resolved = false;
    let outputBuffer = "";

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill("SIGTERM");
        reject(new Error("ngrok startup timed out (30s)"));
      }
    }, 30000);

    const processLine = (line: string) => {
      try {
        const log = JSON.parse(line);
        const url: string | undefined = log.url;
        if (url && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({
            publicUrl: toWssUrl(url),
            publicOrigin: toOrigin(url),
            provider: "ngrok",
            stop: createStopFn(proc),
          });
        }
      } catch {
        // Not JSON — startup noise
      }
    };

    proc.stdout.on("data", (data: Buffer) => {
      outputBuffer += data.toString();
      const lines = outputBuffer.split("\n");
      outputBuffer = lines.pop() || "";
      for (const line of lines) {
        if (line.trim()) {
          processLine(line);
        }
      }
    });

    proc.stderr.on("data", (data: Buffer) => {
      const msg = data.toString();
      if (msg.includes("ERR_NGROK") && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`ngrok error: ${msg}`));
      }
    });

    proc.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`Failed to start ngrok: ${err.message}`));
      }
    });

    proc.on("close", (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`ngrok exited unexpectedly with code ${code}`));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// localxpose (loclx)
// ---------------------------------------------------------------------------

async function startLocalxposeTunnel(
  port: number,
  config: GatewayTunnelConfig,
): Promise<TunnelResult> {
  if (config.authToken) {
    await runCommand("loclx", ["account", "login", "--token", config.authToken]);
  }

  const args = ["tunnel", "http", "--to", `localhost:${port}`];
  if (config.domain) {
    args.push("--subdomain", config.domain);
  }

  return new Promise((resolve, reject) => {
    const proc = spawn("loclx", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let resolved = false;
    let outputBuffer = "";

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill("SIGTERM");
        reject(new Error("localxpose startup timed out (30s)"));
      }
    }, 30000);

    const processOutput = (data: Buffer) => {
      outputBuffer += data.toString();
      // Match loclx tunnel URL pattern
      const match = outputBuffer.match(/https?:\/\/[^\s]+\.loclx\.io/);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        const publicHttpUrl = match[0];
        resolve({
          publicUrl: toWssUrl(publicHttpUrl),
          publicOrigin: toOrigin(publicHttpUrl),
          provider: "localxpose",
          stop: createStopFn(proc),
        });
      }
    };

    proc.stdout.on("data", processOutput);
    proc.stderr.on("data", processOutput);

    proc.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`Failed to start localxpose: ${err.message}`));
      }
    });

    proc.on("close", (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`localxpose exited unexpectedly with code ${code}`));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// zrok
// ---------------------------------------------------------------------------

async function startZrokTunnel(port: number, _config: GatewayTunnelConfig): Promise<TunnelResult> {
  const args = ["share", "public", `http://localhost:${port}`];

  return new Promise((resolve, reject) => {
    const proc = spawn("zrok", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let resolved = false;
    let outputBuffer = "";

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill("SIGTERM");
        reject(new Error("zrok startup timed out (30s)"));
      }
    }, 30000);

    const processOutput = (data: Buffer) => {
      outputBuffer += data.toString();
      // Match zrok share URL pattern
      const match = outputBuffer.match(/https?:\/\/[^\s]+\.zrok\.[^\s]+/);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        const publicHttpUrl = match[0];
        resolve({
          publicUrl: toWssUrl(publicHttpUrl),
          publicOrigin: toOrigin(publicHttpUrl),
          provider: "zrok",
          stop: createStopFn(proc),
        });
      }
    };

    proc.stdout.on("data", processOutput);
    proc.stderr.on("data", processOutput);

    proc.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`Failed to start zrok: ${err.message}`));
      }
    });

    proc.on("close", (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`zrok exited unexpectedly with code ${code}`));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runCommand(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`${cmd} command failed: ${stderr || stdout}`));
      }
    });
    proc.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function startGatewayTunnel(params: {
  config: GatewayTunnelConfig;
  port: number;
  log: TunnelLogger;
}): Promise<TunnelResult | null> {
  const { config, port, log } = params;
  const provider = config.provider ?? "none";

  if (provider === "none") {
    return null;
  }

  if (!(await isProviderAvailable(provider))) {
    log.warn(`tunnel provider "${provider}" binary not found on PATH — skipping tunnel`);
    return null;
  }

  log.info(`starting ${provider} tunnel for port ${port}...`);

  try {
    let result: TunnelResult;

    switch (provider) {
      case "cloudflared":
        result = await startCloudflaredTunnel(port, config);
        break;
      case "ngrok":
        result = await startNgrokTunnel(port, config);
        break;
      case "localxpose":
        result = await startLocalxposeTunnel(port, config);
        break;
      case "zrok":
        result = await startZrokTunnel(port, config);
        break;
      default:
        return null;
    }

    log.info(`tunnel active: ${result.publicUrl}`);
    log.info(`  origin for CORS: ${result.publicOrigin}`);

    return result;
  } catch (err) {
    log.warn(`tunnel start failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
