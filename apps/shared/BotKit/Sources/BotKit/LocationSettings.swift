import Foundation

public enum BotLocationMode: String, Codable, Sendable, CaseIterable {
    case off
    case whileUsing
    case always
}
