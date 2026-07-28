// Matrix plugin module implements device health behavior.
export type MatrixManagedDeviceInfo = {
  deviceId: string;
  displayName: string | null;
  current: boolean;
};

type MatrixDeviceHealthSummary = {
  currentDeviceId: string | null;
  staleBotDevices: MatrixManagedDeviceInfo[];
  currentBotDevices: MatrixManagedDeviceInfo[];
};

const BOT_DEVICE_NAME_PREFIX = "Bot ";

export function isBotManagedMatrixDevice(displayName: string | null | undefined): boolean {
  return displayName?.startsWith(BOT_DEVICE_NAME_PREFIX) === true;
}

export function summarizeMatrixDeviceHealth(
  devices: MatrixManagedDeviceInfo[],
): MatrixDeviceHealthSummary {
  const currentDeviceId = devices.find((device) => device.current)?.deviceId ?? null;
  const botDevices = devices.filter((device) =>
    isBotManagedMatrixDevice(device.displayName),
  );
  return {
    currentDeviceId,
    staleBotDevices: botDevices.filter((device) => !device.current),
    currentBotDevices: botDevices.filter((device) => device.current),
  };
}
