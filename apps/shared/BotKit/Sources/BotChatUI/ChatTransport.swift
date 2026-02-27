import Foundation

public enum BotChatTransportEvent: Sendable {
    case health(ok: Bool)
    case tick
    case chat(BotChatEventPayload)
    case agent(BotAgentEventPayload)
    case seqGap
}

public protocol BotChatTransport: Sendable {
    func requestHistory(sessionKey: String) async throws -> BotChatHistoryPayload
    func sendMessage(
        sessionKey: String,
        message: String,
        thinking: String,
        idempotencyKey: String,
        attachments: [BotChatAttachmentPayload]) async throws -> BotChatSendResponse

    func abortRun(sessionKey: String, runId: String) async throws
    func listSessions(limit: Int?) async throws -> BotChatSessionsListResponse

    func requestHealth(timeoutMs: Int) async throws -> Bool
    func events() -> AsyncStream<BotChatTransportEvent>

    func setActiveSessionKey(_ sessionKey: String) async throws
}

extension BotChatTransport {
    public func setActiveSessionKey(_: String) async throws {}

    public func abortRun(sessionKey _: String, runId _: String) async throws {
        throw NSError(
            domain: "BotChatTransport",
            code: 0,
            userInfo: [NSLocalizedDescriptionKey: "chat.abort not supported by this transport"])
    }

    public func listSessions(limit _: Int?) async throws -> BotChatSessionsListResponse {
        throw NSError(
            domain: "BotChatTransport",
            code: 0,
            userInfo: [NSLocalizedDescriptionKey: "sessions.list not supported by this transport"])
    }
}
