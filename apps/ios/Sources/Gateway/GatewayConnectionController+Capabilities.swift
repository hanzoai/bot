import AVFoundation
import Contacts
import CoreLocation
import CoreMotion
import EventKit
import Foundation
import BotKit
import ReplayKit
import Speech
import UIKit

struct GatewayManualTransportPresentation: Equatable {
    let requiresTLS: Bool
    let effectiveTLS: Bool
    let helperText: String?
}

extension GatewayConnectionController {
    func buildGatewayURL(host: String, port: Int, useTLS: Bool) -> URL? {
        let scheme = useTLS ? "wss" : "ws"
        var components = URLComponents()
        components.scheme = scheme
        components.host = host
        components.port = port
        return components.url
    }

    func resolveManualUseTLS(host: String, useTLS: Bool) -> Bool {
        Self.manualTransportPresentation(
            host: host,
            requestedTLS: useTLS).effectiveTLS
    }

    static func manualTransportPresentation(
        host: String,
        requestedTLS: Bool) -> GatewayManualTransportPresentation
    {
        let trimmedHost = host.trimmingCharacters(in: .whitespacesAndNewlines)
        let requiresTLS = !trimmedHost.isEmpty && !LoopbackHost.isLocalNetworkHost(trimmedHost)
        let effectiveTLS = requestedTLS || requiresTLS
        let helperText: String? = if requiresTLS {
            String(localized: "Secure connection is required for this host.")
        } else if effectiveTLS {
            nil
        } else {
            String(localized: "Use only on a trusted private network.")
        }
        return GatewayManualTransportPresentation(
            requiresTLS: requiresTLS,
            effectiveTLS: effectiveTLS,
            helperText: helperText)
    }

    func manualStableID(host: String, port: Int) -> String {
        ManualAuthOverride.manualStableID(host: host, port: port)
    }

    func makeConnectOptions(
        stableID: String?,
        deviceAuthGatewayID: String?,
        allowStoredDeviceAuth: Bool = true) async -> GatewayConnectOptions
    {
        let defaults = UserDefaults.standard
        let displayName = self.resolvedDisplayName(defaults: defaults)
        let resolvedClientId = self.resolvedClientId(defaults: defaults, stableID: stableID)
        let permissions = await self.currentPermissions()

        return GatewayConnectOptions(
            role: "node",
            scopes: [],
            caps: self.currentCaps(),
            commands: self.currentCommands(),
            permissions: permissions,
            clientId: resolvedClientId,
            clientMode: "node",
            clientDisplayName: displayName,
            allowStoredDeviceAuth: allowStoredDeviceAuth,
            deviceAuthGatewayID: GatewayStableIdentifier.exact(deviceAuthGatewayID))
    }

    private func resolvedClientId(defaults: UserDefaults, stableID: String?) -> String {
        if let stableID,
           let override = GatewaySettingsStore.loadGatewayClientIdOverride(stableID: stableID)
        {
            return override
        }
        let manualClientId = defaults.string(forKey: "gateway.manual.clientId")?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if manualClientId?.isEmpty == false {
            return manualClientId!
        }
        return "bot-ios"
    }

    private func resolvedDisplayName(defaults: UserDefaults) -> String {
        let key = "node.displayName"
        let existingRaw = defaults.string(forKey: key)
        let resolved = NodeDisplayName.resolve(
            existing: existingRaw,
            deviceName: UIDevice.current.name,
            interfaceIdiom: UIDevice.current.userInterfaceIdiom)
        let existing = existingRaw?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if existing.isEmpty || NodeDisplayName.isGeneric(existing) {
            defaults.set(resolved, forKey: key)
        }
        return resolved
    }

    private func currentCaps() -> [String] {
        var caps = [
            BotCapability.canvas.rawValue,
            BotCapability.screen.rawValue,
        ]

        // Default-on: if the key doesn't exist yet, treat it as enabled.
        let cameraEnabled =
            UserDefaults.standard.object(forKey: "camera.enabled") == nil
                ? true
                : UserDefaults.standard.bool(forKey: "camera.enabled")
        if cameraEnabled { caps.append(BotCapability.camera.rawValue) }

        let voiceWakeEnabled = UserDefaults.standard.bool(forKey: VoiceWakePreferences.enabledKey)
        if voiceWakeEnabled { caps.append(BotCapability.voiceWake.rawValue) }

        let locationModeRaw = UserDefaults.standard.string(forKey: "location.enabledMode") ?? "off"
        let locationMode = BotLocationMode(rawValue: locationModeRaw) ?? .off
        if locationMode != .off { caps.append(BotCapability.location.rawValue) }

        caps.append(BotCapability.device.rawValue)
        caps.append(BotCapability.talk.rawValue)
        if WatchMessagingService.isSupportedOnDevice() {
            caps.append(BotCapability.watch.rawValue)
        }
        caps.append(BotCapability.photos.rawValue)
        caps.append(BotCapability.contacts.rawValue)
        caps.append(BotCapability.calendar.rawValue)
        caps.append(BotCapability.reminders.rawValue)
        if Self.motionAvailable() {
            caps.append(BotCapability.motion.rawValue)
        }
        if HealthAuthorization.isEnabled {
            caps.append(BotCapability.health.rawValue)
        }

        return caps
    }

    private func currentCommands() -> [String] {
        var commands: [String] = [
            BotCanvasCommand.present.rawValue,
            BotCanvasCommand.hide.rawValue,
            BotCanvasCommand.navigate.rawValue,
            BotCanvasCommand.evalJS.rawValue,
            BotCanvasCommand.snapshot.rawValue,
            BotCanvasA2UICommand.push.rawValue,
            BotCanvasA2UICommand.pushJSONL.rawValue,
            BotCanvasA2UICommand.reset.rawValue,
            BotScreenCommand.record.rawValue,
            BotSystemCommand.notify.rawValue,
            BotChatCommand.push.rawValue,
            BotTalkCommand.pttStart.rawValue,
            BotTalkCommand.pttStop.rawValue,
            BotTalkCommand.pttCancel.rawValue,
            BotTalkCommand.pttOnce.rawValue,
        ]

        let caps = Set(self.currentCaps())
        if caps.contains(BotCapability.camera.rawValue) {
            commands.append(BotCameraCommand.list.rawValue)
            commands.append(BotCameraCommand.snap.rawValue)
            commands.append(BotCameraCommand.clip.rawValue)
        }
        if caps.contains(BotCapability.location.rawValue) {
            commands.append(BotLocationCommand.get.rawValue)
        }
        if caps.contains(BotCapability.device.rawValue) {
            commands.append(BotDeviceCommand.status.rawValue)
            commands.append(BotDeviceCommand.info.rawValue)
        }
        if caps.contains(BotCapability.watch.rawValue) {
            commands.append(BotWatchCommand.status.rawValue)
            commands.append(BotWatchCommand.notify.rawValue)
        }
        if caps.contains(BotCapability.photos.rawValue) {
            commands.append(BotPhotosCommand.latest.rawValue)
        }
        if caps.contains(BotCapability.contacts.rawValue) {
            commands.append(BotContactsCommand.search.rawValue)
            commands.append(BotContactsCommand.add.rawValue)
        }
        if caps.contains(BotCapability.calendar.rawValue) {
            commands.append(BotCalendarCommand.events.rawValue)
            commands.append(BotCalendarCommand.add.rawValue)
        }
        if caps.contains(BotCapability.reminders.rawValue) {
            commands.append(BotRemindersCommand.list.rawValue)
            commands.append(BotRemindersCommand.add.rawValue)
        }
        if caps.contains(BotCapability.motion.rawValue) {
            commands.append(BotMotionCommand.activity.rawValue)
            commands.append(BotMotionCommand.pedometer.rawValue)
        }
        if caps.contains(BotCapability.health.rawValue) {
            commands.append(BotHealthCommand.summary.rawValue)
        }

        return commands
    }

    private func currentPermissions() async -> [String: Bool] {
        var permissions: [String: Bool] = [:]
        permissions["camera"] = AVCaptureDevice.authorizationStatus(for: .video) == .authorized
        permissions["microphone"] = AVCaptureDevice.authorizationStatus(for: .audio) == .authorized
        permissions["speechRecognition"] = SFSpeechRecognizer.authorizationStatus() == .authorized
        let locationStatus = self.locationAuthorizationSnapshot.authorizationStatus
        let locationServicesEnabled = await Self.locationServicesEnabled()
        permissions["location"] = Self.isLocationAvailable(
            servicesEnabled: locationServicesEnabled,
            status: locationStatus)
        permissions["screenRecording"] = RPScreenRecorder.shared().isAvailable

        permissions["photos"] = PhotoLibraryAccess.canRead(PhotoLibraryAccess.authorizationStatus())
        let contactsStatus = CNContactStore.authorizationStatus(for: .contacts)
        permissions["contacts"] = contactsStatus == .authorized || contactsStatus == .limited

        let calendarStatus = EKEventStore.authorizationStatus(for: .event)
        permissions["calendar"] = Self.hasEventKitReadAccess(calendarStatus)
        let remindersStatus = EKEventStore.authorizationStatus(for: .reminder)
        permissions["reminders"] = Self.hasEventKitReadAccess(remindersStatus)

        let motionStatus = CMMotionActivityManager.authorizationStatus()
        let pedometerStatus = CMPedometer.authorizationStatus()
        permissions["motion"] =
            motionStatus == .authorized || pedometerStatus == .authorized

        return permissions
    }

    private static func locationServicesEnabled() async -> Bool {
        await Task.detached(priority: .utility) {
            CLLocationManager.locationServicesEnabled()
        }.value
    }

    private static func isLocationAvailable(servicesEnabled: Bool, status: CLAuthorizationStatus) -> Bool {
        guard servicesEnabled else { return false }
        switch status {
        case .authorizedAlways, .authorizedWhenInUse:
            return true
        default:
            return false
        }
    }

    private static func hasEventKitReadAccess(_ status: EKAuthorizationStatus) -> Bool {
        status == .fullAccess
    }

    private static func motionAvailable() -> Bool {
        CMMotionActivityManager.isActivityAvailable() || CMPedometer.isStepCountingAvailable()
    }
}

#if DEBUG
extension GatewayConnectionController {
    func _test_resolvedDisplayName(defaults: UserDefaults) -> String {
        self.resolvedDisplayName(defaults: defaults)
    }

    func _test_currentCaps() -> [String] {
        self.currentCaps()
    }

    func _test_currentCommands() -> [String] {
        self.currentCommands()
    }

    func _test_currentPermissions() async -> [String: Bool] {
        await self.currentPermissions()
    }

    static func _test_hasEventKitReadAccess(_ status: EKAuthorizationStatus) -> Bool {
        self.hasEventKitReadAccess(status)
    }

    static func _test_isLocationAvailable(servicesEnabled: Bool, status: CLAuthorizationStatus) -> Bool {
        self.isLocationAvailable(servicesEnabled: servicesEnabled, status: status)
    }

    func _test_resolveManualUseTLS(host: String, useTLS: Bool) -> Bool {
        self.resolveManualUseTLS(host: host, useTLS: useTLS)
    }
}
#endif
