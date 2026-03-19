import Foundation

public enum Hanzo BotCameraCommand: String, Codable, Sendable {
    case list = "camera.list"
    case snap = "camera.snap"
    case clip = "camera.clip"
}

public enum Hanzo BotCameraFacing: String, Codable, Sendable {
    case back
    case front
}

public enum Hanzo BotCameraImageFormat: String, Codable, Sendable {
    case jpg
    case jpeg
}

public enum Hanzo BotCameraVideoFormat: String, Codable, Sendable {
    case mp4
}

public struct Hanzo BotCameraSnapParams: Codable, Sendable, Equatable {
    public var facing: Hanzo BotCameraFacing?
    public var maxWidth: Int?
    public var quality: Double?
    public var format: Hanzo BotCameraImageFormat?
    public var deviceId: String?
    public var delayMs: Int?

    public init(
        facing: Hanzo BotCameraFacing? = nil,
        maxWidth: Int? = nil,
        quality: Double? = nil,
        format: Hanzo BotCameraImageFormat? = nil,
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

public struct Hanzo BotCameraClipParams: Codable, Sendable, Equatable {
    public var facing: Hanzo BotCameraFacing?
    public var durationMs: Int?
    public var includeAudio: Bool?
    public var format: Hanzo BotCameraVideoFormat?
    public var deviceId: String?

    public init(
        facing: Hanzo BotCameraFacing? = nil,
        durationMs: Int? = nil,
        includeAudio: Bool? = nil,
        format: Hanzo BotCameraVideoFormat? = nil,
        deviceId: String? = nil)
    {
        self.facing = facing
        self.durationMs = durationMs
        self.includeAudio = includeAudio
        self.format = format
        self.deviceId = deviceId
    }
}
