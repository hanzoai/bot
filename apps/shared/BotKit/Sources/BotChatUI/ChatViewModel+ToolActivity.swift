import Foundation

public typealias BotChatToolActivityHandler = @MainActor @Sendable (
    _ id: String,
    _ name: String,
    _ isActive: Bool,
    _ sessionKey: String) -> Void

extension BotChatViewModel {
    public func endPendingToolActivities() {
        self.pendingToolCallsById = [:]
    }

    func reportToolActivityChanges(
        from previous: [String: BotChatPendingToolCall],
        to current: [String: BotChatPendingToolCall])
    {
        for (id, call) in previous where current[id] == nil {
            self.onToolActivity?(id, call.name, false, self.sessionKey)
        }
        for (id, call) in current where previous[id] == nil {
            self.onToolActivity?(id, call.name, true, self.sessionKey)
        }
    }
}
