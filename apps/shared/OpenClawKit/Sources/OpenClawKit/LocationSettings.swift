import Foundation

public enum Hanzo BotLocationMode: String, Codable, Sendable, CaseIterable {
    case off
    case whileUsing
    case always
}
