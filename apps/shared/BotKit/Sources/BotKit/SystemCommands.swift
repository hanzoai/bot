import Foundation

public enum BotSystemCommand: String, Codable, Sendable {
    case run = "system.run"
    case which = "system.which"
    case notify = "system.notify"
    case execApprovalsGet = "system.execApprovals.get"
    case execApprovalsSet = "system.execApprovals.set"
}

public enum BotFileSystemCommand: String, Codable, Sendable {
    case listDir = "fs.listDir"
}

public enum BotNotificationPriority: String, Codable, Sendable {
    case passive
    case active
    case timeSensitive
}

public enum BotNotificationDelivery: String, Codable, Sendable {
    case system
    case overlay
    case auto
}

public struct BotSystemNotifyParams: Codable, Sendable, Equatable {
    public var title: String
    public var body: String
    public var sound: String?
    public var priority: BotNotificationPriority?
    public var delivery: BotNotificationDelivery?

    public init(
        title: String,
        body: String,
        sound: String? = nil,
        priority: BotNotificationPriority? = nil,
        delivery: BotNotificationDelivery? = nil)
    {
        self.title = title
        self.body = body
        self.sound = sound
        self.priority = priority
        self.delivery = delivery
    }
}
