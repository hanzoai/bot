// Device Pair API module exposes the plugin public contract.
export {
  approveDevicePairing,
  clearDeviceBootstrapTokens,
  issueDeviceBootstrapToken,
  PAIRING_SETUP_BOOTSTRAP_PROFILE,
  listDevicePairing,
  revokeDeviceBootstrapToken,
  type DeviceBootstrapProfile,
} from "bot/plugin-sdk/device-bootstrap";
export { definePluginEntry, type BotPluginApi } from "bot/plugin-sdk/plugin-entry";
export {
  resolveGatewayBindUrl,
  resolveGatewayPort,
  resolveTailnetHostWithRunner,
  resolveTailscaleServeGatewayUrlsWithRunner,
} from "bot/plugin-sdk/core";
export { resolveAdvertisedLanHost } from "bot/plugin-sdk/gateway-runtime";
export {
  resolvePreferredBotTmpDir,
  runPluginCommandWithTimeout,
} from "bot/plugin-sdk/sandbox";
export { renderQrPngBase64, renderQrPngDataUrl, writeQrPngTempFile } from "./qr-image.js";
