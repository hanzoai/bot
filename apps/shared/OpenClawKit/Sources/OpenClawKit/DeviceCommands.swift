import Foundation

public enum Hanzo BotDeviceCommand: String, Codable, Sendable {
    case status = "device.status"
    case info = "device.info"
}

public enum Hanzo BotBatteryState: String, Codable, Sendable {
    case unknown
    case unplugged
    case charging
    case full
}

public enum Hanzo BotThermalState: String, Codable, Sendable {
    case nominal
    case fair
    case serious
    case critical
}

public enum Hanzo BotNetworkPathStatus: String, Codable, Sendable {
    case satisfied
    case unsatisfied
    case requiresConnection
}

public enum Hanzo BotNetworkInterfaceType: String, Codable, Sendable {
    case wifi
    case cellular
    case wired
    case other
}

public struct Hanzo BotBatteryStatusPayload: Codable, Sendable, Equatable {
    public var level: Double?
    public var state: Hanzo BotBatteryState
    public var lowPowerModeEnabled: Bool

    public init(level: Double?, state: Hanzo BotBatteryState, lowPowerModeEnabled: Bool) {
        self.level = level
        self.state = state
        self.lowPowerModeEnabled = lowPowerModeEnabled
    }
}

public struct Hanzo BotThermalStatusPayload: Codable, Sendable, Equatable {
    public var state: Hanzo BotThermalState

    public init(state: Hanzo BotThermalState) {
        self.state = state
    }
}

public struct Hanzo BotStorageStatusPayload: Codable, Sendable, Equatable {
    public var totalBytes: Int64
    public var freeBytes: Int64
    public var usedBytes: Int64

    public init(totalBytes: Int64, freeBytes: Int64, usedBytes: Int64) {
        self.totalBytes = totalBytes
        self.freeBytes = freeBytes
        self.usedBytes = usedBytes
    }
}

public struct Hanzo BotNetworkStatusPayload: Codable, Sendable, Equatable {
    public var status: Hanzo BotNetworkPathStatus
    public var isExpensive: Bool
    public var isConstrained: Bool
    public var interfaces: [Hanzo BotNetworkInterfaceType]

    public init(
        status: Hanzo BotNetworkPathStatus,
        isExpensive: Bool,
        isConstrained: Bool,
        interfaces: [Hanzo BotNetworkInterfaceType])
    {
        self.status = status
        self.isExpensive = isExpensive
        self.isConstrained = isConstrained
        self.interfaces = interfaces
    }
}

public struct Hanzo BotDeviceStatusPayload: Codable, Sendable, Equatable {
    public var battery: Hanzo BotBatteryStatusPayload
    public var thermal: Hanzo BotThermalStatusPayload
    public var storage: Hanzo BotStorageStatusPayload
    public var network: Hanzo BotNetworkStatusPayload
    public var uptimeSeconds: Double

    public init(
        battery: Hanzo BotBatteryStatusPayload,
        thermal: Hanzo BotThermalStatusPayload,
        storage: Hanzo BotStorageStatusPayload,
        network: Hanzo BotNetworkStatusPayload,
        uptimeSeconds: Double)
    {
        self.battery = battery
        self.thermal = thermal
        self.storage = storage
        self.network = network
        self.uptimeSeconds = uptimeSeconds
    }
}

public struct Hanzo BotDeviceInfoPayload: Codable, Sendable, Equatable {
    public var deviceName: String
    public var modelIdentifier: String
    public var systemName: String
    public var systemVersion: String
    public var appVersion: String
    public var appBuild: String
    public var locale: String

    public init(
        deviceName: String,
        modelIdentifier: String,
        systemName: String,
        systemVersion: String,
        appVersion: String,
        appBuild: String,
        locale: String)
    {
        self.deviceName = deviceName
        self.modelIdentifier = modelIdentifier
        self.systemName = systemName
        self.systemVersion = systemVersion
        self.appVersion = appVersion
        self.appBuild = appBuild
        self.locale = locale
    }
}
