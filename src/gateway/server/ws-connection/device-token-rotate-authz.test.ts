import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  approveDevicePairing,
  getPairedDevice,
  removePairedDevice,
  requestDevicePairing,
  revokeDeviceToken,
  rotateDeviceToken,
} from "../../../infra/device-pairing.js";

async function setupPairedOperatorDevice(baseDir: string, scopes: string[]) {
  const request = await requestDevicePairing(
    {
      deviceId: "device-1",
      publicKey: "public-key-1",
      role: "operator",
      scopes,
    },
    baseDir,
  );
  await approveDevicePairing(request.request.requestId, baseDir);
}

describe("device token rotate/revoke authorization", () => {
  test("caller can rotate token to scopes they hold", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "bot-device-rotate-"));
    await setupPairedOperatorDevice(baseDir, ["operator.admin"]);

    const paired = await getPairedDevice("device-1", baseDir);
    const originalToken = paired?.tokens?.operator?.token;

    const rotated = await rotateDeviceToken({
      deviceId: "device-1",
      role: "operator",
      scopes: ["operator.read"],
      callerScopes: ["operator.admin"],
      callerIsPlatformAdmin: false,
      baseDir,
    });

    expect(rotated).not.toBeNull();
    expect(rotated?.scopes).toEqual(["operator.read"]);
    expect(rotated?.token).not.toBe(originalToken);

    const after = await getPairedDevice("device-1", baseDir);
    expect(after?.tokens?.operator?.token).toBe(rotated?.token);
  });

  test("caller cannot rotate token to scopes they do not hold", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "bot-device-rotate-"));
    await setupPairedOperatorDevice(baseDir, ["operator.admin"]);

    const rotated = await rotateDeviceToken({
      deviceId: "device-1",
      role: "operator",
      scopes: ["operator.write"],
      callerScopes: ["operator.read"],
      callerIsPlatformAdmin: false,
      baseDir,
    });

    expect(rotated).toBeNull();

    const after = await getPairedDevice("device-1", baseDir);
    expect(after?.tokens?.operator?.scopes).toEqual(["operator.admin"]);
  });

  test("caller with empty scopes cannot rotate a scoped device token", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "bot-device-rotate-empty-"));
    await setupPairedOperatorDevice(baseDir, ["operator.read"]);

    const rotated = await rotateDeviceToken({
      deviceId: "device-1",
      role: "operator",
      scopes: ["operator.read"],
      callerScopes: [],
      callerIsPlatformAdmin: false,
      baseDir,
    });

    expect(rotated).toBeNull();
  });

  test("platform admin can rotate to any approved scope", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "bot-device-rotate-admin-"));
    await setupPairedOperatorDevice(baseDir, ["operator.admin"]);

    const rotated = await rotateDeviceToken({
      deviceId: "device-1",
      role: "operator",
      scopes: ["operator.admin"],
      callerScopes: ["operator.admin"],
      callerIsPlatformAdmin: true,
      baseDir,
    });

    expect(rotated).not.toBeNull();
    expect(rotated?.scopes).toEqual(["operator.admin"]);
  });

  test("caller can revoke token for scopes they hold", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "bot-device-revoke-"));
    await setupPairedOperatorDevice(baseDir, ["operator.admin"]);

    const revoked = await revokeDeviceToken({
      deviceId: "device-1",
      role: "operator",
      callerScopes: ["operator.admin"],
      callerIsPlatformAdmin: false,
      baseDir,
    });

    expect(revoked).not.toBeNull();
    expect(revoked?.revokedAtMs).toBeDefined();

    const after = await getPairedDevice("device-1", baseDir);
    expect(after?.tokens?.operator?.revokedAtMs).toBeDefined();
  });

  test("caller cannot revoke token for scopes they do not hold (including empty scopes)", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "bot-device-revoke-deny-"));
    await setupPairedOperatorDevice(baseDir, ["operator.admin"]);

    expect(
      await revokeDeviceToken({
        deviceId: "device-1",
        role: "operator",
        callerScopes: ["operator.read"],
        callerIsPlatformAdmin: false,
        baseDir,
      }),
    ).toBeNull();

    expect(
      await revokeDeviceToken({
        deviceId: "device-1",
        role: "operator",
        callerScopes: [],
        callerIsPlatformAdmin: false,
        baseDir,
      }),
    ).toBeNull();

    const after = await getPairedDevice("device-1", baseDir);
    expect(after?.tokens?.operator?.revokedAtMs).toBeUndefined();
  });

  test("approver subject is stored on device token and preserved across rotations", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "bot-device-approver-"));
    const request = await requestDevicePairing(
      {
        deviceId: "device-1",
        publicKey: "public-key-1",
        role: "operator",
        scopes: ["operator.read"],
      },
      baseDir,
    );

    const approverSub = "user-123";
    const approved = await approveDevicePairing(request.request.requestId, baseDir, approverSub);
    expect(approved).not.toBeNull();

    const paired = await getPairedDevice("device-1", baseDir);
    expect(paired?.tokens?.operator?.approverSub).toBe(approverSub);

    const rotated = await rotateDeviceToken({
      deviceId: "device-1",
      role: "operator",
      scopes: ["operator.read"],
      callerScopes: ["operator.read"],
      callerIsPlatformAdmin: false,
      baseDir,
    });
    expect(rotated?.approverSub).toBe(approverSub);
  });

  test("removePairedDevice removes paired record", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "bot-device-remove-"));
    await setupPairedOperatorDevice(baseDir, ["operator.read", "operator.write"]);

    const removed = await removePairedDevice("device-1", baseDir);
    expect(removed).not.toBeNull();
    expect(await getPairedDevice("device-1", baseDir)).toBeNull();
  });
});
