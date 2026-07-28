import Foundation

/// Plain-text projection of a transcript message: exactly what the reader sees
/// in the bubble, with tool traces and non-text blocks removed. Shared by the
/// transcript exporter and the Listen action so exported and spoken text
/// always match the visible transcript.
public enum ChatMessageVisibleText {
    static func copyText(in message: BotChatMessage) -> String {
        let role = message.role.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return role == "assistant" ? self.visibleText(in: message) : self.primaryText(in: message)
    }

    public static func visibleText(in message: BotChatMessage) -> String {
        let text = self.primaryText(in: message)
        let role = message.role.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard role != "user" else { return text }
        return AssistantTextParser.visibleSegments(from: text)
            .map(\.text)
            .joined(separator: "\n\n")
    }

    static func hasVisibleText(in message: BotChatMessage) -> Bool {
        !self.visibleText(in: message)
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty
    }

    private static func primaryText(in message: BotChatMessage) -> String {
        let parts = message.content.compactMap { content -> String? in
            let kind = (content.type ?? "text").lowercased()
            guard kind == "text" || kind.isEmpty else { return nil }
            return content.text
        }
        return BotChatMessage.displayText(
            contentText: parts.joined(separator: "\n"),
            role: message.role,
            stopReason: message.stopReason,
            errorMessage: message.errorMessage)
    }
}
