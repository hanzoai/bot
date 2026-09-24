/**
 * bus.ts — how this process PUBLISHES onto the platform bus. It does not run one
 * and it does not subscribe.
 *
 * The bus is Hanzo PubSub, the NATS node cloud embeds (hanzoai/cloud apps/pubsub):
 * one in-cluster listener, reached at PUBSUB_URL. What crosses it is the NATS core
 * protocol, and a publisher needs five words of it — the server's INFO, our
 * CONNECT, PUB, and the PING/PONG keepalive — so this is those five words over
 * node:net rather than a client library for the other two hundred.
 *
 * SUBJECTS CARRY TAXONOMY, NOT IDENTITY (cloud apps/event bus.go). A publisher
 * names what happened (`bot.run.running`); the org rides in the payload. A tenant
 * in the subject would leak the tenant list to anyone who can list subjects.
 *
 * DELIVERY IS BEST EFFORT, AND THAT IS STATED RATHER THAN HIDDEN. A publish never
 * throws and never blocks its caller: a message sent while the connection is down
 * waits in a bounded queue and goes out on reconnect, and past the bound the
 * oldest is dropped and counted. A publisher whose truth lives elsewhere (a
 * record, a store) can afford that; one that needs a durable log wants JetStream,
 * which this is not.
 */

import net from "node:net";

export type Bus = {
  /** Publish one message. Never throws; see the file header for delivery. */
  publish(subject: string, payload: unknown): void;
  /** Close the connection and stop reconnecting. */
  close(): Promise<void>;
};

export type BusOptions = {
  /** What an operator reads in the server's connz. */
  name: string;
  log?: (message: string) => void;
};

/** Messages held while (re)connecting before the oldest is dropped. */
const MAX_PENDING = 1024;
const RETRY_MIN_MS = 250;
const RETRY_MAX_MS = 5_000;
const CRLF = "\r\n";

/**
 * parseBusUrl accepts `nats://host[:port]` and nothing else — a TLS or websocket
 * bus would be a second transport to keep correct, and there is one.
 */
export function parseBusUrl(url: string): { host: string; port: number } {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`bus: ${JSON.stringify(url)} is not a URL`);
  }
  if (u.protocol !== "nats:") {
    throw new Error(`bus: ${JSON.stringify(url)} is not a nats:// address`);
  }
  if (!u.hostname) {
    throw new Error(`bus: ${JSON.stringify(url)} names no host`);
  }
  const port = u.port ? Number(u.port) : 4222;
  return { host: u.hostname.replace(/^\[|\]$/g, ""), port };
}

/** A subject is dot-separated tokens with no whitespace and no wildcard. */
export function isSubject(subject: string): boolean {
  return /^[^\s.*>]+(\.[^\s.*>]+)*$/.test(subject);
}

/**
 * connectBus returns a publisher onto the bus at url. It dials lazily, on the
 * first publish, so a process that never publishes never opens a socket.
 */
export function connectBus(url: string, opts: BusOptions): Bus {
  const { host, port } = parseBusUrl(url);
  const log = opts.log ?? (() => {});
  const pending: string[] = [];
  let socket: net.Socket | null = null;
  let ready = false;
  let closed = false;
  let retryMs = RETRY_MIN_MS;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let dropped = 0;

  const flush = () => {
    if (!socket || !ready) {
      return;
    }
    if (pending.length > 0) {
      socket.write(pending.join(""));
      pending.length = 0;
    }
  };

  const connect = () => {
    if (closed || socket) {
      return;
    }
    let buf = "";
    const s = net.createConnection({ host, port });
    socket = s;
    s.setNoDelay(true);
    s.setEncoding("utf8");
    s.on("data", (chunk: string) => {
      buf += chunk;
      for (let i = buf.indexOf(CRLF); i >= 0; i = buf.indexOf(CRLF)) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (line.startsWith("INFO ")) {
          if (!ready) {
            // verbose:false — no +OK per message; an error still arrives as -ERR.
            s.write(
              `CONNECT ${JSON.stringify({
                verbose: false,
                pedantic: false,
                lang: "node",
                version: "1",
                protocol: 1,
                name: opts.name,
              })}${CRLF}`,
            );
            ready = true;
            retryMs = RETRY_MIN_MS;
            if (dropped > 0) {
              log(`bus: ${dropped} message(s) dropped while disconnected`);
              dropped = 0;
            }
            flush();
          }
        } else if (line === "PING") {
          s.write(`PONG${CRLF}`);
        } else if (line.startsWith("-ERR")) {
          log(`bus: server refused: ${line.slice(4).trim()}`);
        }
      }
    });
    s.on("error", (err) => {
      log(`bus: ${host}:${port}: ${err.message}`);
    });
    s.on("close", () => {
      socket = null;
      ready = false;
      if (closed) {
        return;
      }
      // Reconnect with backoff so a restarting bus is not hammered, and so the
      // queue drains the moment it is back.
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connect();
      }, retryMs);
      retryTimer.unref?.();
      retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
    });
  };

  return {
    publish(subject, payload) {
      if (closed) {
        return;
      }
      if (!isSubject(subject)) {
        log(`bus: refusing to publish on ${JSON.stringify(subject)}: not a subject`);
        return;
      }
      let data: string;
      try {
        data = JSON.stringify(payload);
      } catch (err) {
        log(`bus: ${subject}: payload does not encode: ${String(err)}`);
        return;
      }
      pending.push(`PUB ${subject} ${Buffer.byteLength(data)}${CRLF}${data}${CRLF}`);
      if (pending.length > MAX_PENDING) {
        pending.shift();
        dropped++;
      }
      if (!socket) {
        connect();
      }
      flush();
    },
    async close() {
      closed = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      const s = socket;
      if (!s) {
        return;
      }
      await new Promise<void>((resolve) => {
        // end() flushes what is written; a peer that never answers the FIN is cut.
        const cut = setTimeout(() => s.destroy(), 1_000);
        cut.unref?.();
        s.once("close", () => {
          clearTimeout(cut);
          resolve();
        });
        s.end();
      });
    },
  };
}
