import Foundation

public enum BotDeviceCommand: String, Codable, Sendable {
    case status = "device.status"
    case info = "device.info"
}

public enum BotBatteryState: String, Codable, Sendable {
    case unknown
    case unplugged
    case charging
    case full
}

public enum BotThermalState: String, Codable, Sendable {
    case nominal
    case fair
    case serious
    case critical
}

public enum BotNetworkPathStatus: String, Codable, Sendable {
    case satisfied
    case unsatisfied
    case requiresConnection
}

public enum BotNetworkInterfaceType: String, Codable, Sendable {
    case wifi
    case cellular
    case wired
    case other
}

public struct BotBatteryStatusPayload: Codable, Sendable, Equatable {
    public var level: Double?
    public var state: BotBatteryState
    public var lowPowerModeEnabled: Bool

    public init(level: Double?, state: BotBatteryState, lowPowerModeEnabled: Bool) {
        self.level = level
        self.state = state
        self.lowPowerModeEnabled = lowPowerModeEnabled
    }
}

public struct BotThermalStatusPayload: Codable, Sendable, Equatable {
    public var state: BotThermalState

    public init(state: BotThermalState) {
        self.state = state
    }
}

public struct BotStorageStatusPayload: Codable, Sendable, Equatable {
    public var totalBytes: Int64
    public var freeBytes: Int64
    public var usedBytes: Int64

    public init(totalBytes: Int64, freeBytes: Int64, usedBytes: Int64) {
        self.totalBytes = totalBytes
        self.freeBytes = freeBytes
        self.usedBytes = usedBytes
    }
}

public struct BotNetworkStatusPayload: Codable, Sendable, Equatable {
    public var status: BotNetworkPathStatus
    public var isExpensive: Bool
    public var isConstrained: Bool
    public var interfaces: [BotNetworkInterfaceType]

    public init(
        status: BotNetworkPathStatus,
        isExpensive: Bool,
        isConstrained: Bool,
        interfaces: [BotNetworkInterfaceType])
    {
        self.status = status
        self.isExpensive = isExpensive
        self.isConstrained = isConstrained
        self.interfaces = interfaces
    }
}

public struct BotDeviceStatusPayload: Codable, Sendable, Equatable {
    public var battery: BotBatteryStatusPayload
    public var thermal: BotThermalStatusPayload
    public var storage: BotStorageStatusPayload
    public var network: BotNetworkStatusPayload
    public var uptimeSeconds: Double

    public init(
        battery: BotBatteryStatusPayload,
        thermal: BotThermalStatusPayload,
        storage: BotStorageStatusPayload,
        network: BotNetworkStatusPayload,
        uptimeSeconds: Double)
    {
        self.battery = battery
        self.thermal = thermal
        self.storage = storage
        self.network = network
        self.uptimeSeconds = uptimeSeconds
    }
}

public struct BotDeviceInfoPayload: Codable, Sendable, Equatable {
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
