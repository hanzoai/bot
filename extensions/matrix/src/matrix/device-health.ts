export type MatrixManagedDeviceInfo = {
  deviceId: string;
  displayName: string | null;
  current: boolean;
};

export type MatrixDeviceHealthSummary = {
  currentDeviceId: string | null;
  staleHanzoBotDevices: MatrixManagedDeviceInfo[];
  currentHanzoBotDevices: MatrixManagedDeviceInfo[];
};

const BOT_DEVICE_NAME_PREFIX = "Hanzo Bot ";

export function isHanzoBotManagedMatrixDevice(displayName: string | null | undefined): boolean {
  return displayName?.startsWith(BOT_DEVICE_NAME_PREFIX) === true;
}

export function summarizeMatrixDeviceHealth(
  devices: MatrixManagedDeviceInfo[],
): MatrixDeviceHealthSummary {
  const currentDeviceId = devices.find((device) => device.current)?.deviceId ?? null;
  const openClawDevices = devices.filter((device) =>
    isHanzoBotManagedMatrixDevice(device.displayName),
  );
  return {
    currentDeviceId,
    staleHanzoBotDevices: openClawDevices.filter((device) => !device.current),
    currentHanzoBotDevices: openClawDevices.filter((device) => device.current),
  };
}
