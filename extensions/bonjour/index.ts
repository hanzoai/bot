/**
 * Bonjour gateway-discovery plugin entry. It advertises the local gateway over
 * mDNS and lazily loads the ciao-based advertiser.
 */
import { definePluginEntry } from "bot/plugin-sdk/plugin-entry";

function formatBonjourInstanceName(displayName: string) {
  const trimmed = displayName.trim();
  if (!trimmed) {
    return "Bot";
  }
  if (/bot/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed} (Bot)`;
}

/** Plugin entry for Bonjour/mDNS gateway discovery. */
export default definePluginEntry({
  id: "bonjour",
  name: "Bonjour Gateway Discovery",
  description: "Advertise the local Bot gateway over Bonjour/mDNS.",
  register(api) {
    api.registerGatewayDiscoveryService({
      id: "bonjour",
      advertise: async (ctx) => {
        const [
          { startGatewayBonjourAdvertiser },
          { registerUncaughtExceptionHandler, registerUnhandledRejectionHandler },
        ] = await Promise.all([
          import("./src/advertiser.js"),
          import("bot/plugin-sdk/runtime"),
        ]);
        const advertiser = await startGatewayBonjourAdvertiser(
          {
            instanceName: formatBonjourInstanceName(ctx.machineDisplayName),
            gatewayPort: ctx.gatewayPort,
            gatewayTlsEnabled: ctx.gatewayTlsEnabled,
            gatewayTlsFingerprintSha256: ctx.gatewayTlsFingerprintSha256,
            gatewayDirectReachable: ctx.gatewayDirectReachable,
            canvasPort: ctx.canvasPort,
            sshPort: ctx.sshPort,
            tailnetDns: ctx.tailnetDns,
            cliPath: ctx.cliPath,
            minimal: ctx.minimal,
          },
          {
            logger: api.logger,
            registerUncaughtExceptionHandler,
            registerUnhandledRejectionHandler,
          },
        );
        return { stop: advertiser.stop };
      },
    });
  },
});
