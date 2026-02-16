import Foundation

public enum HanzoBotChatTransportEvent: Sendable {
    case health(ok: Bool)
    case tick
    case chat(HanzoBotChatEventPayload)
    case agent(HanzoBotAgentEventPayload)
    case seqGap
}

public protocol HanzoBotChatTransport: Sendable {
    func requestHistory(sessionKey: String) async throws -> HanzoBotChatHistoryPayload
    func sendMessage(
        sessionKey: String,
        message: String,
        thinking: String,
        idempotencyKey: String,
        attachments: [HanzoBotChatAttachmentPayload]) async throws -> HanzoBotChatSendResponse

    func abortRun(sessionKey: String, runId: String) async throws
    func listSessions(limit: Int?) async throws -> HanzoBotChatSessionsListResponse

    func requestHealth(timeoutMs: Int) async throws -> Bool
    func events() -> AsyncStream<HanzoBotChatTransportEvent>

    func setActiveSessionKey(_ sessionKey: String) async throws
}

extension HanzoBotChatTransport {
    public func setActiveSessionKey(_: String) async throws {}

    public func abortRun(sessionKey _: String, runId _: String) async throws {
        throw NSError(
            domain: "HanzoBotChatTransport",
            code: 0,
            userInfo: [NSLocalizedDescriptionKey: "chat.abort not supported by this transport"])
    }

    public func listSessions(limit _: Int?) async throws -> HanzoBotChatSessionsListResponse {
        throw NSError(
            domain: "HanzoBotChatTransport",
            code: 0,
            userInfo: [NSLocalizedDescriptionKey: "sessions.list not supported by this transport"])
    }
}
