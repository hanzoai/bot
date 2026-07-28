import Foundation

public enum BotCameraCommand: String, Codable, Sendable {
    case list = "camera.list"
    case snap = "camera.snap"
    case clip = "camera.clip"
}

public enum BotCameraFacing: String, Codable, Sendable {
    case back
    case front
}

public enum BotCameraImageFormat: String, Codable, Sendable {
    case jpg
    case jpeg
}

public enum BotCameraVideoFormat: String, Codable, Sendable {
    case mp4
}

public struct BotCameraSnapParams: Codable, Sendable, Equatable {
    public var facing: BotCameraFacing?
    public var maxWidth: Int?
    public var quality: Double?
    public var format: BotCameraImageFormat?
    public var deviceId: String?
    public var delayMs: Int?

    public init(
        facing: BotCameraFacing? = nil,
        maxWidth: Int? = nil,
        quality: Double? = nil,
        format: BotCameraImageFormat? = nil,
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

public struct BotCameraClipParams: Codable, Sendable, Equatable {
    public var facing: BotCameraFacing?
    public var durationMs: Int?
    public var includeAudio: Bool?
    public var format: BotCameraVideoFormat?
    public var deviceId: String?

    public init(
        facing: BotCameraFacing? = nil,
        durationMs: Int? = nil,
        includeAudio: Bool? = nil,
        format: BotCameraVideoFormat? = nil,
        deviceId: String? = nil)
    {
        self.facing = facing
        self.durationMs = durationMs
        self.includeAudio = includeAudio
        self.format = format
        self.deviceId = deviceId
    }
}
