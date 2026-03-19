export type MatrixManagedDeviceInfo = {
  deviceId: string;
  displayName: string | null;
  current: boolean;
};

export type MatrixDeviceHealthSummary = {
  currentDeviceId: string | null;
  staleHanzo BotDevices: MatrixManagedDeviceInfo[];
  currentHanzo BotDevices: MatrixManagedDeviceInfo[];
};

const BOT_DEVICE_NAME_PREFIX = "Hanzo Bot ";

export function isHanzo BotManagedMatrixDevice(displayName: string | null | undefined): boolean {
  return displayName?.startsWith(BOT_DEVICE_NAME_PREFIX) === true;
}

export function summarizeMatrixDeviceHealth(
  devices: MatrixManagedDeviceInfo[],
): MatrixDeviceHealthSummary {
  const currentDeviceId = devices.find((device) => device.current)?.deviceId ?? null;
  const openClawDevices = devices.filter((device) =>
    isHanzo BotManagedMatrixDevice(device.displayName),
  );
  return {
    currentDeviceId,
    staleHanzo BotDevices: openClawDevices.filter((device) => !device.current),
    currentHanzo BotDevices: openClawDevices.filter((device) => device.current),
  };
}
