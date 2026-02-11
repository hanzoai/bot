import Foundation

public enum HanzoBotCameraCommand: String, Codable, Sendable {
    case list = "camera.list"
    case snap = "camera.snap"
    case clip = "camera.clip"
}

public enum HanzoBotCameraFacing: String, Codable, Sendable {
    case back
    case front
}

public enum HanzoBotCameraImageFormat: String, Codable, Sendable {
    case jpg
    case jpeg
}

public enum HanzoBotCameraVideoFormat: String, Codable, Sendable {
    case mp4
}

public struct HanzoBotCameraSnapParams: Codable, Sendable, Equatable {
    public var facing: HanzoBotCameraFacing?
    public var maxWidth: Int?
    public var quality: Double?
    public var format: HanzoBotCameraImageFormat?
    public var deviceId: String?
    public var delayMs: Int?

    public init(
        facing: HanzoBotCameraFacing? = nil,
        maxWidth: Int? = nil,
        quality: Double? = nil,
        format: HanzoBotCameraImageFormat? = nil,
        deviceId: String? = nil,
        delayMs: Int? = nil)
    {
        self.facing = facing
        self.maxWidth = maxWidth
        self.quality = quality
        self.format = format
        self.deviceId = deviceId
        self.delayMs = delayMs
    }
}

public struct HanzoBotCameraClipParams: Codable, Sendable, Equatable {
    public var facing: HanzoBotCameraFacing?
    public var durationMs: Int?
    public var includeAudio: Bool?
    public var format: HanzoBotCameraVideoFormat?
    public var deviceId: String?

    public init(
        facing: HanzoBotCameraFacing? = nil,
        durationMs: Int? = nil,
        includeAudio: Bool? = nil,
        format: HanzoBotCameraVideoFormat? = nil,
        deviceId: String? = nil)
    {
        self.facing = facing
        self.durationMs = durationMs
        self.includeAudio = includeAudio
        self.format = format
        self.deviceId = deviceId
    }
}
