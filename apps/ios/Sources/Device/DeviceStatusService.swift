import Foundation
<<<<<<< HEAD
import BotKit
=======
import OpenClawKit
>>>>>>> upstream/main
import UIKit

@MainActor
final class DeviceStatusService: DeviceStatusServicing {
    private let networkStatus: NetworkStatusService

    init(networkStatus: NetworkStatusService = NetworkStatusService()) {
        self.networkStatus = networkStatus
    }

<<<<<<< HEAD
    func status() async throws -> HanzoBotDeviceStatusPayload {
=======
    func status() async throws -> OpenClawDeviceStatusPayload {
>>>>>>> upstream/main
        let battery = self.batteryStatus()
        let thermal = self.thermalStatus()
        let storage = self.storageStatus()
        let network = await self.networkStatus.currentStatus()
        let uptime = ProcessInfo.processInfo.systemUptime

<<<<<<< HEAD
        return HanzoBotDeviceStatusPayload(
=======
        return OpenClawDeviceStatusPayload(
>>>>>>> upstream/main
            battery: battery,
            thermal: thermal,
            storage: storage,
            network: network,
            uptimeSeconds: uptime)
    }

<<<<<<< HEAD
    func info() -> HanzoBotDeviceInfoPayload {
        let device = UIDevice.current
        let appVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "dev"
        let appBuild = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0"
        let locale = Locale.preferredLanguages.first ?? Locale.current.identifier
        return HanzoBotDeviceInfoPayload(
            deviceName: device.name,
            modelIdentifier: Self.modelIdentifier(),
=======
    func info() -> OpenClawDeviceInfoPayload {
        let device = UIDevice.current
        let appVersion = DeviceInfoHelper.appVersion()
        let appBuild = DeviceStatusService.fallbackAppBuild(DeviceInfoHelper.appBuild())
        let locale = Locale.preferredLanguages.first ?? Locale.current.identifier
        return OpenClawDeviceInfoPayload(
            deviceName: device.name,
            modelIdentifier: DeviceInfoHelper.modelIdentifier(),
>>>>>>> upstream/main
            systemName: device.systemName,
            systemVersion: device.systemVersion,
            appVersion: appVersion,
            appBuild: appBuild,
            locale: locale)
    }

<<<<<<< HEAD
    private func batteryStatus() -> HanzoBotBatteryStatusPayload {
        let device = UIDevice.current
        device.isBatteryMonitoringEnabled = true
        let level = device.batteryLevel >= 0 ? Double(device.batteryLevel) : nil
        let state: HanzoBotBatteryState = switch device.batteryState {
=======
    private func batteryStatus() -> OpenClawBatteryStatusPayload {
        let device = UIDevice.current
        device.isBatteryMonitoringEnabled = true
        let level = device.batteryLevel >= 0 ? Double(device.batteryLevel) : nil
        let state: OpenClawBatteryState = switch device.batteryState {
>>>>>>> upstream/main
        case .charging: .charging
        case .full: .full
        case .unplugged: .unplugged
        case .unknown: .unknown
        @unknown default: .unknown
        }
<<<<<<< HEAD
        return HanzoBotBatteryStatusPayload(
=======
        return OpenClawBatteryStatusPayload(
>>>>>>> upstream/main
            level: level,
            state: state,
            lowPowerModeEnabled: ProcessInfo.processInfo.isLowPowerModeEnabled)
    }

<<<<<<< HEAD
    private func thermalStatus() -> HanzoBotThermalStatusPayload {
        let state: HanzoBotThermalState = switch ProcessInfo.processInfo.thermalState {
=======
    private func thermalStatus() -> OpenClawThermalStatusPayload {
        let state: OpenClawThermalState = switch ProcessInfo.processInfo.thermalState {
>>>>>>> upstream/main
        case .nominal: .nominal
        case .fair: .fair
        case .serious: .serious
        case .critical: .critical
        @unknown default: .nominal
        }
<<<<<<< HEAD
        return HanzoBotThermalStatusPayload(state: state)
    }

    private func storageStatus() -> HanzoBotStorageStatusPayload {
=======
        return OpenClawThermalStatusPayload(state: state)
    }

    private func storageStatus() -> OpenClawStorageStatusPayload {
>>>>>>> upstream/main
        let attrs = (try? FileManager.default.attributesOfFileSystem(forPath: NSHomeDirectory())) ?? [:]
        let total = (attrs[.systemSize] as? NSNumber)?.int64Value ?? 0
        let free = (attrs[.systemFreeSize] as? NSNumber)?.int64Value ?? 0
        let used = max(0, total - free)
<<<<<<< HEAD
        return HanzoBotStorageStatusPayload(totalBytes: total, freeBytes: free, usedBytes: used)
    }

    private static func modelIdentifier() -> String {
        var systemInfo = utsname()
        uname(&systemInfo)
        let machine = withUnsafeBytes(of: &systemInfo.machine) { ptr in
            String(bytes: ptr.prefix { $0 != 0 }, encoding: .utf8)
        }
        let trimmed = machine?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? "unknown" : trimmed
=======
        return OpenClawStorageStatusPayload(totalBytes: total, freeBytes: free, usedBytes: used)
    }

    /// Fallback for payloads that require a non-empty build (e.g. "0").
    private static func fallbackAppBuild(_ build: String) -> String {
        build.isEmpty ? "0" : build
>>>>>>> upstream/main
    }
}
