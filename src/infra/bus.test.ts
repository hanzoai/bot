import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { connectBus, isSubject, parseBusUrl, type Bus } from "./bus.js";

// A server that speaks the server's half of the NATS core protocol: it greets with
// INFO, records every CONNECT and PUB frame it is sent, and can PING the client.
// The publisher is held to the wire itself, so a frame with a wrong byte count or
// a missed PONG fails here the way it would fail against the real node.

type Pub = { subject: string; payload: unknown };

function fakeServer() {
  const pubs: Pub[] = [];
  const connects: Record<string, unknown>[] = [];
  const pongs: number[] = [];
  const sockets = new Set<net.Socket>();
  const server = net.createServer((s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
    s.write(`INFO ${JSON.stringify({ server_id: "fake", max_payload: 1048576 })}\r\n`);
    let buf = Buffer.alloc(0);
    s.on("data", (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        const i = buf.indexOf("\r\n");
        if (i < 0) {
          return;
        }
        const line = buf.subarray(0, i).toString();
        if (line.startsWith("PUB ")) {
          const [, subject, size] = line.split(" ");
          const n = Number(size);
          if (buf.length < i + 2 + n + 2) {
            return; // wait for the whole payload
          }
          const payload = buf.subarray(i + 2, i + 2 + n).toString();
          if (buf.subarray(i + 2 + n, i + 4 + n).toString() !== "\r\n") {
            throw new Error("PUB payload not terminated by CRLF: byte count is wrong");
          }
          pubs.push({ subject, payload: JSON.parse(payload) });
          buf = buf.subarray(i + 4 + n);
          continue;
        }
        if (line.startsWith("CONNECT ")) {
          connects.push(JSON.parse(line.slice(8)));
        } else if (line === "PONG") {
          pongs.push(Date.now());
        }
        buf = buf.subarray(i + 2);
      }
    });
  });
  return {
    pubs,
    connects,
    pongs,
    async listen() {
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      return (server.address() as net.AddressInfo).port;
    },
    ping() {
      for (const s of sockets) {
        s.write("PING\r\n");
      }
    },
    drop() {
      for (const s of sockets) {
        s.destroy();
      }
    },
    async close() {
      for (const s of sockets) {
        s.destroy();
      }
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}

async function until(cond: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) {
      throw new Error("condition not met in time");
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

let bus: Bus | null = null;
afterEach(async () => {
  await bus?.close();
  bus = null;
});

describe("bus publisher", () => {
  it("connects on first publish, names itself, and frames each message exactly", async () => {
    const srv = fakeServer();
    const port = await srv.listen();
    bus = connectBus(`nats://127.0.0.1:${port}`, { name: "bot-gateway" });
    // Multi-byte text: the PUB size is BYTES, and a character count would
    // desynchronise the stream on the first non-ASCII task.
    bus.publish("bot.run.booting", { org: "acme", task: "résumé ✓" });
    bus.publish("bot.run.running", { org: "acme", runId: "r1" });
    await until(() => srv.pubs.length === 2);
    expect(srv.connects[0]).toMatchObject({ name: "bot-gateway", verbose: false });
    expect(srv.pubs).toEqual([
      { subject: "bot.run.booting", payload: { org: "acme", task: "résumé ✓" } },
      { subject: "bot.run.running", payload: { org: "acme", runId: "r1" } },
    ]);
    await srv.close();
  });

  it("answers the server's PING, or the server would cut it off", async () => {
    const srv = fakeServer();
    const port = await srv.listen();
    bus = connectBus(`nats://127.0.0.1:${port}`, { name: "t" });
    bus.publish("bot.run.booting", {});
    await until(() => srv.pubs.length === 1);
    srv.ping();
    await until(() => srv.pongs.length === 1);
    await srv.close();
  });

  it("holds what it could not send and delivers it on reconnect", async () => {
    const srv = fakeServer();
    const port = await srv.listen();
    bus = connectBus(`nats://127.0.0.1:${port}`, { name: "t" });
    bus.publish("bot.run.booting", { n: 1 });
    await until(() => srv.pubs.length === 1);
    srv.drop();
    // Published while the connection is down: queued, then sent on reconnect.
    await new Promise((r) => setTimeout(r, 20));
    bus.publish("bot.run.running", { n: 2 });
    await until(() => srv.pubs.length === 2);
    expect(srv.pubs[1]).toEqual({ subject: "bot.run.running", payload: { n: 2 } });
    expect(srv.connects.length).toBe(2);
    await srv.close();
  });

  it("never throws at its caller, whatever the bus is doing", async () => {
    // Nothing listens on this port.
    const probe = net.createServer();
    await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
    const port = (probe.address() as net.AddressInfo).port;
    await new Promise<void>((r) => probe.close(() => r()));
    const logged: string[] = [];
    bus = connectBus(`nats://127.0.0.1:${port}`, { name: "t", log: (m) => logged.push(m) });
    expect(() => bus!.publish("bot.run.booting", { ok: true })).not.toThrow();
    expect(() => bus!.publish("not a subject", {})).not.toThrow();
    await until(() => logged.some((m) => m.includes("ECONNREFUSED")));
    expect(logged.some((m) => m.includes("not a subject"))).toBe(true);
  });
});

describe("bus addressing", () => {
  it("accepts nats:// only", () => {
    expect(parseBusUrl("nats://cloud.hanzo.svc:4222")).toEqual({
      host: "cloud.hanzo.svc",
      port: 4222,
    });
    expect(parseBusUrl("nats://127.0.0.1")).toEqual({ host: "127.0.0.1", port: 4222 });
    expect(() => parseBusUrl("http://cloud:4222")).toThrow(/nats:\/\//);
    expect(() => parseBusUrl("cloud:4222")).toThrow();
  });

  it("refuses a wildcard or whitespace as a subject", () => {
    expect(isSubject("bot.run.failed")).toBe(true);
    for (const bad of ["", "bot..run", "bot.*", "bot.>", "bot run", ".bot", "bot."]) {
      expect(isSubject(bad)).toBe(false);
    }
  });
});
