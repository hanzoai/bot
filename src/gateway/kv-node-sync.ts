import KV from "@hanzo/kv-client";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NodeMeta = {
  displayName?: string;
  platform?: string;
  version?: string;
  caps: string[];
  commands: string[];
  connectedAtMs: number;
  remoteIp?: string;
  appKind?: string;
  cwd?: string;
};

export type RemoteNodeInfo = NodeMeta & {
  nodeId: string;
  podId: string;
};

export type InvokeRequest = {
  requestId: string;
  originPodId: string;
  nodeId: string;
  command: string;
  params?: unknown;
  timeoutMs?: number;
  idempotencyKey?: string;
};

export type InvokeResult = {
  requestId: string;
  originPodId: string;
  ok: boolean;
  payload?: unknown;
  payloadJSON?: string | null;
  error?: { code?: string; message?: string } | null;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PREFIX = "bot:nodes:";
const NODE_TTL_SECONDS = 120;
const INVOKE_CHANNEL = "bot:invoke:";
const RESULT_CHANNEL = "bot:invoke-result:";
const LOG = "[kv-node-sync]";

// ---------------------------------------------------------------------------
// KVNodeSync — cross-pod node state sharing via Hanzo KV
// ---------------------------------------------------------------------------

export class KVNodeSync {
  readonly podId: string;

  /** Main client for reads/writes. */
  private kv: KV;
  /** Dedicated client for subscriptions (KV client requires separate connection). */
  private sub: KV;

  /** Set of nodeIds owned by this pod (for cleanup on shutdown). */
  private ownedNodes = new Set<string>();

  private invokeHandler: ((request: InvokeRequest) => void) | null = null;
  private resultHandler: ((result: InvokeResult) => void) | null = null;
  private closed = false;

  constructor(kvUrl: string) {
    this.podId = process.env.HOSTNAME || randomUUID();

    this.kv = new KV(kvUrl, { lazyConnect: true });
    this.sub = new KV(kvUrl, { lazyConnect: true });

    // Attach error handlers so uncaught KV errors don't crash the process.
    this.kv.on("error", (err: Error) => {
      console.log(LOG, "kv client error:", err.message);
    });
    this.sub.on("error", (err: Error) => {
      console.log(LOG, "kv sub error:", err.message);
    });

    // Connect both clients.
    this.kv.connect().catch((err: Error) => {
      console.log(LOG, "kv connect failed:", err.message);
    });
    this.sub.connect().catch((err: Error) => {
      console.log(LOG, "kv sub connect failed:", err.message);
    });

    // Subscribe to this pod's channels once the sub client is ready.
    this.sub.on("ready", () => {
      const invokeCh = `${INVOKE_CHANNEL}${this.podId}`;
      const resultCh = `${RESULT_CHANNEL}${this.podId}`;
      this.sub.subscribe(invokeCh, resultCh).catch((err: Error) => {
        console.log(LOG, "subscribe failed:", err.message);
      });
    });

    this.sub.on("message", (channel: string, message: string) => {
      try {
        if (channel === `${INVOKE_CHANNEL}${this.podId}` && this.invokeHandler) {
          this.invokeHandler(JSON.parse(message) as InvokeRequest);
        } else if (channel === `${RESULT_CHANNEL}${this.podId}` && this.resultHandler) {
          this.resultHandler(JSON.parse(message) as InvokeResult);
        }
      } catch (err) {
        console.log(LOG, "message handler error:", (err as Error).message);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Node lifecycle
  // -------------------------------------------------------------------------

  /** Store node metadata in a KV hash and set its TTL. */
  async publishNode(nodeId: string, meta: NodeMeta): Promise<void> {
    const key = `${PREFIX}${nodeId}`;
    const fields: Record<string, string> = {
      podId: this.podId,
      caps: JSON.stringify(meta.caps),
      commands: JSON.stringify(meta.commands),
      connectedAtMs: String(meta.connectedAtMs),
    };
    if (meta.displayName !== undefined) {
      fields.displayName = meta.displayName;
    }
    if (meta.platform !== undefined) {
      fields.platform = meta.platform;
    }
    if (meta.version !== undefined) {
      fields.version = meta.version;
    }
    if (meta.remoteIp !== undefined) {
      fields.remoteIp = meta.remoteIp;
    }
    if (meta.appKind !== undefined) {
      fields.appKind = meta.appKind;
    }
    if (meta.cwd !== undefined) {
      fields.cwd = meta.cwd;
    }

    try {
      const pipeline = this.kv.pipeline();
      const pairs: string[] = [];
      for (const [k, v] of Object.entries(fields)) {
        pairs.push(k, v);
      }
      pipeline.hset(key, ...pairs);
      pipeline.expire(key, NODE_TTL_SECONDS);
      await pipeline.exec();
      this.ownedNodes.add(nodeId);
    } catch (err) {
      console.log(LOG, "publishNode failed:", (err as Error).message);
    }
  }

  /** Remove a node hash from KV. */
  async removeNode(nodeId: string): Promise<void> {
    try {
      await this.kv.del(`${PREFIX}${nodeId}`);
      this.ownedNodes.delete(nodeId);
    } catch (err) {
      console.log(LOG, "removeNode failed:", (err as Error).message);
    }
  }

  /** Refresh TTL for a node (called on heartbeat). */
  async refreshNode(nodeId: string): Promise<void> {
    try {
      await this.kv.expire(`${PREFIX}${nodeId}`, NODE_TTL_SECONDS);
    } catch (err) {
      console.log(LOG, "refreshNode failed:", (err as Error).message);
    }
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  /** List ALL nodes across all pods using SCAN (non-blocking). */
  async listAllNodes(): Promise<RemoteNodeInfo[]> {
    const nodes: RemoteNodeInfo[] = [];
    try {
      let cursor = "0";
      do {
        const [nextCursor, keys] = await this.kv.scan(cursor, "MATCH", `${PREFIX}*`, "COUNT", 100);
        cursor = nextCursor;
        for (const key of keys) {
          const info = await this.getNodeByKey(key);
          if (info) {
            nodes.push(info);
          }
        }
      } while (cursor !== "0");
    } catch (err) {
      console.log(LOG, "listAllNodes failed:", (err as Error).message);
    }
    return nodes;
  }

  /** Get a specific node's info. */
  async getNode(nodeId: string): Promise<RemoteNodeInfo | null> {
    try {
      return await this.getNodeByKey(`${PREFIX}${nodeId}`);
    } catch (err) {
      console.log(LOG, "getNode failed:", (err as Error).message);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Invoke routing via pub/sub
  // -------------------------------------------------------------------------

  /** Publish an invoke request to the pod that owns the target node. */
  async routeInvoke(targetPodId: string, request: InvokeRequest): Promise<void> {
    try {
      await this.kv.publish(`${INVOKE_CHANNEL}${targetPodId}`, JSON.stringify(request));
    } catch (err) {
      console.log(LOG, "routeInvoke failed:", (err as Error).message);
    }
  }

  /** Register a handler for invoke requests targeted at this pod. */
  onInvokeRequest(handler: (request: InvokeRequest) => void): void {
    this.invokeHandler = handler;
  }

  /** Send an invoke result back to the requesting pod. */
  async routeInvokeResult(targetPodId: string, result: InvokeResult): Promise<void> {
    try {
      await this.kv.publish(`${RESULT_CHANNEL}${targetPodId}`, JSON.stringify(result));
    } catch (err) {
      console.log(LOG, "routeInvokeResult failed:", (err as Error).message);
    }
  }

  /** Register a handler for invoke results targeted at this pod. */
  onInvokeResult(handler: (result: InvokeResult) => void): void {
    this.resultHandler = handler;
  }

  // -------------------------------------------------------------------------
  // Shutdown
  // -------------------------------------------------------------------------

  /** Remove all nodes owned by this pod and close KV connections. */
  async shutdown(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    console.log(LOG, "shutting down, removing", this.ownedNodes.size, "owned nodes");

    const removals: Promise<number>[] = [];
    for (const nodeId of this.ownedNodes) {
      removals.push(this.kv.del(`${PREFIX}${nodeId}`));
    }
    try {
      await Promise.allSettled(removals);
    } catch {
      // Best-effort cleanup.
    }
    this.ownedNodes.clear();

    try {
      await this.sub.unsubscribe();
    } catch {
      // Ignore.
    }
    this.sub.disconnect();
    this.kv.disconnect();
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async getNodeByKey(key: string): Promise<RemoteNodeInfo | null> {
    const data = await this.kv.hgetall(key);
    if (!data || !data.podId) {
      return null;
    }

    const nodeId = key.slice(PREFIX.length);
    return {
      nodeId,
      podId: data.podId,
      displayName: data.displayName,
      platform: data.platform,
      version: data.version,
      caps: safeParse<string[]>(data.caps, []),
      commands: safeParse<string[]>(data.commands, []),
      connectedAtMs: Number(data.connectedAtMs) || 0,
      remoteIp: data.remoteIp,
      appKind: data.appKind,
      cwd: data.cwd,
    };
  }
}

// Re-export with old name for backward compatibility.
export { KVNodeSync as RedisNodeSync };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeParse<T>(json: string | undefined, fallback: T): T {
  if (!json) {
    return fallback;
  }
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
