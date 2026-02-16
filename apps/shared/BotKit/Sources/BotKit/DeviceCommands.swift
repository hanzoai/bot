import Foundation

public enum HanzoBotDeviceCommand: String, Codable, Sendable {
    case status = "device.status"
    case info = "device.info"
}

public enum HanzoBotBatteryState: String, Codable, Sendable {
    case unknown
    case unplugged
    case charging
    case full
}

public enum HanzoBotThermalState: String, Codable, Sendable {
    case nominal
    case fair
    case serious
    case critical
}

public enum HanzoBotNetworkPathStatus: String, Codable, Sendable {
    case satisfied
    case unsatisfied
    case requiresConnection
}

public enum HanzoBotNetworkInterfaceType: String, Codable, Sendable {
    case wifi
    case cellular
    case wired
    case other
}

public struct HanzoBotBatteryStatusPayload: Codable, Sendable, Equatable {
    public var level: Double?
    public var state: HanzoBotBatteryState
    public var lowPowerModeEnabled: Bool

    public init(level: Double?, state: HanzoBotBatteryState, lowPowerModeEnabled: Bool) {
        self.level = level
        self.state = state
        self.lowPowerModeEnabled = lowPowerModeEnabled
    }
}

public struct HanzoBotThermalStatusPayload: Codable, Sendable, Equatable {
    public var state: HanzoBotThermalState

    public init(state: HanzoBotThermalState) {
        self.state = state
    }
}

public struct HanzoBotStorageStatusPayload: Codable, Sendable, Equatable {
    public var totalBytes: Int64
    public var freeBytes: Int64
    public var usedBytes: Int64

    public init(totalBytes: Int64, freeBytes: Int64, usedBytes: Int64) {
        self.totalBytes = totalBytes
        self.freeBytes = freeBytes
        self.usedBytes = usedBytes
    }
}

public struct HanzoBotNetworkStatusPayload: Codable, Sendable, Equatable {
    public var status: HanzoBotNetworkPathStatus
    public var isExpensive: Bool
    public var isConstrained: Bool
    public var interfaces: [HanzoBotNetworkInterfaceType]

    public init(
        status: HanzoBotNetworkPathStatus,
        isExpensive: Bool,
        isConstrained: Bool,
        interfaces: [HanzoBotNetworkInterfaceType])
    {
        self.status = status
        self.isExpensive = isExpensive
        self.isConstrained = isConstrained
        self.interfaces = interfaces
    }
}

public struct HanzoBotDeviceStatusPayload: Codable, Sendable, Equatable {
    public var battery: HanzoBotBatteryStatusPayload
    public var thermal: HanzoBotThermalStatusPayload
    public var storage: HanzoBotStorageStatusPayload
    public var network: HanzoBotNetworkStatusPayload
    public var uptimeSeconds: Double

    public init(
        battery: HanzoBotBatteryStatusPayload,
        thermal: HanzoBotThermalStatusPayload,
        storage: HanzoBotStorageStatusPayload,
        network: HanzoBotNetworkStatusPayload,
        uptimeSeconds: Double)
    {
        self.battery = battery
        self.thermal = thermal
        self.storage = storage
        self.network = network
        self.uptimeSeconds = uptimeSeconds
    }
}

public struct HanzoBotDeviceInfoPayload: Codable, Sendable, Equatable {
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
