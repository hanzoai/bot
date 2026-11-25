import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  approveDevicePairing,
  getPairedDevice,
  requestDevicePairing,
} from "../../infra/device-pairing.js";
import { deviceHandlers } from "./devices.js";
import type { GatewayClient, GatewayRequestContext, RespondFn } from "./types.js";

function createMockContext(): GatewayRequestContext {
  return {
    logGateway: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    broadcast: vi.fn(),
  } as unknown as GatewayRequestContext;
}

function createClient(params: {
  scopes?: string[];
  deviceId?: string;
  identity?: GatewayClient["identity"];
}): GatewayClient {
  return {
    connect: {
      minProtocol: 3,
      maxProtocol: 3,
      client: { id: "cli", version: "1.0.0", platform: "linux", mode: "cli" },
      role: "operator",
      scopes: params.scopes ?? [],
      ...(params.deviceId
        ? {
            device: {
              id: params.deviceId,
              publicKey: "pk",
              signature: "sig",
              signedAt: Date.now(),
              nonce: "n",
            },
          }
        : {}),
    },
    ...(params.identity ? { identity: params.identity } : {}),
  };
}

async function callHandler(
  method: keyof typeof deviceHandlers,
  params: Record<string, unknown>,
  client: GatewayClient | null,
) {
  const calls: Array<{
    ok: boolean;
    payload?: unknown;
    error?: { code: string; message: string };
  }> = [];
  const respond: RespondFn = (ok, payload, error) => {
    calls.push({ ok, payload, error });
  };
  await deviceHandlers[method]({
    req: { type: "req", id: "req-1", method, params },
    params,
    client,
    isWebchatConnect: () => false,
    respond,
    context: createMockContext(),
  });
  expect(calls).toHaveLength(1);
  return calls[0];
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("deviceHandlers caller-scope enforcement & approverSub binding", () => {
  test("device.pair.approve: rejects caller lacking requested scopes (including empty scopes)", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "bot-devices-approve-"));
    vi.stubEnv("BOT_STATE_DIR", stateDir);
    const pending = await requestDevicePairing({
      deviceId: "dev-admin-req",
      publicKey: "pk-1",
      role: "operator",
      scopes: ["operator.admin"],
    });

    // Non-admin with operator.read + operator.pairing cannot approve operator.admin
    const resRead = await callHandler(
      "device.pair.approve",
      { requestId: pending.request.requestId },
      createClient({
        scopes: ["operator.read", "operator.pairing"],
        identity: {
          orgId: "acme",
          bearer: "jwt",
          method: "iam",
          userId: "u-acme",
          isSuperAdmin: false,
        },
      }),
    );
    expect(resRead.ok).toBe(false);
    expect(resRead.error?.message).toContain("cannot approve scopes you do not hold");

    // Zero-scope caller must also be rejected (no empty-scopes bypass!)
    const resEmpty = await callHandler(
      "device.pair.approve",
      { requestId: pending.request.requestId },
      createClient({ scopes: [] }),
    );
    expect(resEmpty.ok).toBe(false);
    expect(resEmpty.error?.message).toContain("cannot approve scopes you do not hold");

    expect(await getPairedDevice("dev-admin-req")).toBeNull();
  });

  test("device.pair.approve: rejects self-approval by same device for non-admin", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "bot-devices-self-approve-"));
    vi.stubEnv("BOT_STATE_DIR", stateDir);
    const pending = await requestDevicePairing({
      deviceId: "dev-self",
      publicKey: "pk-self",
      role: "operator",
      scopes: ["operator.read"],
    });

    const res = await callHandler(
      "device.pair.approve",
      { requestId: pending.request.requestId },
      createClient({
        scopes: ["operator.read", "operator.pairing"],
        deviceId: "dev-self",
      }),
    );
    expect(res.ok).toBe(false);
    expect(res.error?.message).toContain("cannot self-approve");
  });

  test("device.pair.approve: binds approverSub from IAM identity on approval", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "bot-devices-approver-sub-"));
    vi.stubEnv("BOT_STATE_DIR", stateDir);
    const pending = await requestDevicePairing({
      deviceId: "dev-scoped",
      publicKey: "pk-scoped",
      role: "operator",
      scopes: ["operator.read"],
    });

    const res = await callHandler(
      "device.pair.approve",
      { requestId: pending.request.requestId },
      createClient({
        scopes: ["operator.read", "operator.pairing"],
        identity: {
          orgId: "acme",
          bearer: "jwt",
          method: "iam",
          userId: "user-sub-42",
          isSuperAdmin: false,
        },
      }),
    );
    expect(res.ok).toBe(true);
    const paired = await getPairedDevice("dev-scoped");
    expect(paired?.tokens?.operator?.approverSub).toBe("user-sub-42");
  });

  test("device.pair.approve: IAM non-SuperAdmin with forged operator.admin scope cannot act as platform admin", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "bot-devices-iam-nonadmin-"));
    vi.stubEnv("BOT_STATE_DIR", stateDir);
    const pending = await requestDevicePairing({
      deviceId: "dev-super",
      publicKey: "pk-super",
      role: "operator",
      scopes: ["operator.admin"],
    });

    const res = await callHandler(
      "device.pair.approve",
      { requestId: pending.request.requestId },
      createClient({
        scopes: ["operator.read", "operator.pairing"],
        identity: {
          orgId: "acme",
          bearer: "jwt",
          method: "iam",
          userId: "u-org-admin",
          isSuperAdmin: false,
        },
      }),
    );
    expect(res.ok).toBe(false);

    // Canonical SuperAdmin (owner === "admin" => isSuperAdmin: true) CAN approve
    const superRes = await callHandler(
      "device.pair.approve",
      { requestId: pending.request.requestId },
      createClient({
        scopes: ["operator.admin"],
        identity: {
          orgId: "admin",
          bearer: "jwt",
          method: "iam",
          userId: "u-super",
          isSuperAdmin: true,
        },
      }),
    );
    expect(superRes.ok).toBe(true);
    expect((await getPairedDevice("dev-super"))?.tokens?.operator?.approverSub).toBe("u-super");
  });

  test("device.pair.remove: rejects caller lacking device scopes (including empty scopes)", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "bot-devices-remove-"));
    vi.stubEnv("BOT_STATE_DIR", stateDir);
    const req = await requestDevicePairing({
      deviceId: "dev-rm",
      publicKey: "pk-rm",
      role: "operator",
      scopes: ["operator.admin"],
    });
    await approveDevicePairing(req.request.requestId);

    const resEmpty = await callHandler(
      "device.pair.remove",
      { deviceId: "dev-rm" },
      createClient({ scopes: [] }),
    );
    expect(resEmpty.ok).toBe(false);
    expect(resEmpty.error?.message).toContain("cannot remove device with scopes you do not hold");

    const resRead = await callHandler(
      "device.pair.remove",
      { deviceId: "dev-rm" },
      createClient({ scopes: ["operator.read"] }),
    );
    expect(resRead.ok).toBe(false);
    expect(await getPairedDevice("dev-rm")).not.toBeNull();

    const resAdmin = await callHandler(
      "device.pair.remove",
      { deviceId: "dev-rm" },
      createClient({ scopes: ["operator.admin"] }),
    );
    expect(resAdmin.ok).toBe(true);
    expect(await getPairedDevice("dev-rm")).toBeNull();
  });

  test("device.token.rotate & device.token.revoke enforce caller scopes through handler", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "bot-devices-token-ops-"));
    vi.stubEnv("BOT_STATE_DIR", stateDir);
    const req = await requestDevicePairing({
      deviceId: "dev-tok",
      publicKey: "pk-tok",
      role: "operator",
      scopes: ["operator.admin"],
    });
    await approveDevicePairing(req.request.requestId);

    // Caller with operator.read cannot rotate to operator.write or revoke operator.admin token
    const badRotate = await callHandler(
      "device.token.rotate",
      { deviceId: "dev-tok", role: "operator", scopes: ["operator.write"] },
      createClient({ scopes: ["operator.read"] }),
    );
    expect(badRotate.ok).toBe(false);

    const badRevoke = await callHandler(
      "device.token.revoke",
      { deviceId: "dev-tok", role: "operator" },
      createClient({ scopes: ["operator.read"] }),
    );
    expect(badRevoke.ok).toBe(false);

    // Empty scopes caller also rejected
    const emptyRotate = await callHandler(
      "device.token.rotate",
      { deviceId: "dev-tok", role: "operator", scopes: ["operator.read"] },
      createClient({ scopes: [] }),
    );
    expect(emptyRotate.ok).toBe(false);

    // Caller with operator.read CAN rotate down to operator.read
    const okRotate = await callHandler(
      "device.token.rotate",
      { deviceId: "dev-tok", role: "operator", scopes: ["operator.read"] },
      createClient({ scopes: ["operator.read"] }),
    );
    expect(okRotate.ok).toBe(true);

    // Now that the token is scoped to operator.read, caller with operator.read CAN revoke it
    const okRevoke = await callHandler(
      "device.token.revoke",
      { deviceId: "dev-tok", role: "operator" },
      createClient({ scopes: ["operator.read"] }),
    );
    expect(okRevoke.ok).toBe(true);
  });
});
