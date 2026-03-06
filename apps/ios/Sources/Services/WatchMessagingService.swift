import Foundation
<<<<<<< HEAD
import BotKit
=======
import OpenClawKit
>>>>>>> upstream/main
import OSLog
@preconcurrency import WatchConnectivity

enum WatchMessagingError: LocalizedError {
    case unsupported
    case notPaired
    case watchAppNotInstalled

    var errorDescription: String? {
        switch self {
        case .unsupported:
            "WATCH_UNAVAILABLE: WatchConnectivity is not supported on this device"
        case .notPaired:
            "WATCH_UNAVAILABLE: no paired Apple Watch"
        case .watchAppNotInstalled:
<<<<<<< HEAD
            "WATCH_UNAVAILABLE: Bot watch companion app is not installed"
=======
            "WATCH_UNAVAILABLE: OpenClaw watch companion app is not installed"
>>>>>>> upstream/main
        }
    }
}

<<<<<<< HEAD
final class WatchMessagingService: NSObject, WatchMessagingServicing, @unchecked Sendable {
    private static let logger = Logger(subsystem: "ai.hanzo/bot", category: "watch.messaging")
    private let session: WCSession?
    private let replyHandlerLock = NSLock()
=======
@MainActor
final class WatchMessagingService: NSObject, @preconcurrency WatchMessagingServicing {
    nonisolated private static let logger = Logger(subsystem: "ai.openclaw", category: "watch.messaging")
    private let session: WCSession?
    private var pendingActivationContinuations: [CheckedContinuation<Void, Never>] = []
>>>>>>> upstream/main
    private var replyHandler: (@Sendable (WatchQuickReplyEvent) -> Void)?

    override init() {
        if WCSession.isSupported() {
            self.session = WCSession.default
        } else {
            self.session = nil
        }
        super.init()
        if let session = self.session {
            session.delegate = self
            session.activate()
        }
    }

<<<<<<< HEAD
    static func isSupportedOnDevice() -> Bool {
        WCSession.isSupported()
    }

    static func currentStatusSnapshot() -> WatchMessagingStatus {
=======
    nonisolated static func isSupportedOnDevice() -> Bool {
        WCSession.isSupported()
    }

    nonisolated static func currentStatusSnapshot() -> WatchMessagingStatus {
>>>>>>> upstream/main
        guard WCSession.isSupported() else {
            return WatchMessagingStatus(
                supported: false,
                paired: false,
                appInstalled: false,
                reachable: false,
                activationState: "unsupported")
        }
        let session = WCSession.default
        return status(for: session)
    }

    func status() async -> WatchMessagingStatus {
        await self.ensureActivated()
        guard let session = self.session else {
            return WatchMessagingStatus(
                supported: false,
                paired: false,
                appInstalled: false,
                reachable: false,
                activationState: "unsupported")
        }
        return Self.status(for: session)
    }

    func setReplyHandler(_ handler: (@Sendable (WatchQuickReplyEvent) -> Void)?) {
<<<<<<< HEAD
        self.replyHandlerLock.lock()
        self.replyHandler = handler
        self.replyHandlerLock.unlock()
=======
        self.replyHandler = handler
>>>>>>> upstream/main
    }

    func sendNotification(
        id: String,
<<<<<<< HEAD
        params: BotWatchNotifyParams) async throws -> WatchNotificationSendResult
=======
        params: OpenClawWatchNotifyParams) async throws -> WatchNotificationSendResult
>>>>>>> upstream/main
    {
        await self.ensureActivated()
        guard let session = self.session else {
            throw WatchMessagingError.unsupported
        }

        let snapshot = Self.status(for: session)
        guard snapshot.paired else { throw WatchMessagingError.notPaired }
        guard snapshot.appInstalled else { throw WatchMessagingError.watchAppNotInstalled }

        var payload: [String: Any] = [
            "type": "watch.notify",
            "id": id,
            "title": params.title,
            "body": params.body,
<<<<<<< HEAD
            "priority": params.priority?.rawValue ?? BotNotificationPriority.active.rawValue,
=======
            "priority": params.priority?.rawValue ?? OpenClawNotificationPriority.active.rawValue,
>>>>>>> upstream/main
            "sentAtMs": Int(Date().timeIntervalSince1970 * 1000),
        ]
        if let promptId = Self.nonEmpty(params.promptId) {
            payload["promptId"] = promptId
        }
        if let sessionKey = Self.nonEmpty(params.sessionKey) {
            payload["sessionKey"] = sessionKey
        }
        if let kind = Self.nonEmpty(params.kind) {
            payload["kind"] = kind
        }
        if let details = Self.nonEmpty(params.details) {
            payload["details"] = details
        }
        if let expiresAtMs = params.expiresAtMs {
            payload["expiresAtMs"] = expiresAtMs
        }
        if let risk = params.risk {
            payload["risk"] = risk.rawValue
        }
        if let actions = params.actions, !actions.isEmpty {
            payload["actions"] = actions.map { action in
                var encoded: [String: Any] = [
                    "id": action.id,
                    "label": action.label,
                ]
                if let style = Self.nonEmpty(action.style) {
                    encoded["style"] = style
                }
                return encoded
            }
        }

        if snapshot.reachable {
            do {
                try await self.sendReachableMessage(payload, with: session)
                return WatchNotificationSendResult(
                    deliveredImmediately: true,
                    queuedForDelivery: false,
                    transport: "sendMessage")
            } catch {
                Self.logger.error("watch sendMessage failed: \(error.localizedDescription, privacy: .public)")
            }
        }

        _ = session.transferUserInfo(payload)
        return WatchNotificationSendResult(
            deliveredImmediately: false,
            queuedForDelivery: true,
            transport: "transferUserInfo")
    }

    private func sendReachableMessage(_ payload: [String: Any], with session: WCSession) async throws {
        try await withCheckedThrowingContinuation { continuation in
            session.sendMessage(
                payload,
                replyHandler: { _ in
                    continuation.resume()
                },
                errorHandler: { error in
                    continuation.resume(throwing: error)
                }
            )
        }
    }

    private func emitReply(_ event: WatchQuickReplyEvent) {
<<<<<<< HEAD
        let handler: ((WatchQuickReplyEvent) -> Void)?
        self.replyHandlerLock.lock()
        handler = self.replyHandler
        self.replyHandlerLock.unlock()
        handler?(event)
    }

    private static func nonEmpty(_ value: String?) -> String? {
=======
        self.replyHandler?(event)
    }

    nonisolated private static func nonEmpty(_ value: String?) -> String? {
>>>>>>> upstream/main
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

<<<<<<< HEAD
    private static func parseQuickReplyPayload(
=======
    nonisolated private static func parseQuickReplyPayload(
>>>>>>> upstream/main
        _ payload: [String: Any],
        transport: String) -> WatchQuickReplyEvent?
    {
        guard (payload["type"] as? String) == "watch.reply" else {
            return nil
        }
        guard let actionId = nonEmpty(payload["actionId"] as? String) else {
            return nil
        }
        let promptId = nonEmpty(payload["promptId"] as? String) ?? "unknown"
        let replyId = nonEmpty(payload["replyId"] as? String) ?? UUID().uuidString
        let actionLabel = nonEmpty(payload["actionLabel"] as? String)
        let sessionKey = nonEmpty(payload["sessionKey"] as? String)
        let note = nonEmpty(payload["note"] as? String)
        let sentAtMs = (payload["sentAtMs"] as? Int) ?? (payload["sentAtMs"] as? NSNumber)?.intValue

        return WatchQuickReplyEvent(
            replyId: replyId,
            promptId: promptId,
            actionId: actionId,
            actionLabel: actionLabel,
            sessionKey: sessionKey,
            note: note,
            sentAtMs: sentAtMs,
            transport: transport)
    }

    private func ensureActivated() async {
        guard let session = self.session else { return }
        if session.activationState == .activated { return }
        session.activate()
<<<<<<< HEAD
        for _ in 0..<8 {
            if session.activationState == .activated { return }
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
    }

    private static func status(for session: WCSession) -> WatchMessagingStatus {
=======
        await withCheckedContinuation { continuation in
            self.pendingActivationContinuations.append(continuation)
        }
    }

    nonisolated private static func status(for session: WCSession) -> WatchMessagingStatus {
>>>>>>> upstream/main
        WatchMessagingStatus(
            supported: true,
            paired: session.isPaired,
            appInstalled: session.isWatchAppInstalled,
            reachable: session.isReachable,
            activationState: activationStateLabel(session.activationState))
    }

<<<<<<< HEAD
    private static func activationStateLabel(_ state: WCSessionActivationState) -> String {
=======
    nonisolated private static func activationStateLabel(_ state: WCSessionActivationState) -> String {
>>>>>>> upstream/main
        switch state {
        case .notActivated:
            "notActivated"
        case .inactive:
            "inactive"
        case .activated:
            "activated"
        @unknown default:
            "unknown"
        }
    }
}

extension WatchMessagingService: WCSessionDelegate {
<<<<<<< HEAD
    func session(
=======
    nonisolated func session(
>>>>>>> upstream/main
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: (any Error)?)
    {
        if let error {
            Self.logger.error("watch activation failed: \(error.localizedDescription, privacy: .public)")
<<<<<<< HEAD
            return
        }
        Self.logger.debug("watch activation state=\(Self.activationStateLabel(activationState), privacy: .public)")
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    func session(_: WCSession, didReceiveMessage message: [String: Any]) {
        guard let event = Self.parseQuickReplyPayload(message, transport: "sendMessage") else {
            return
        }
        self.emitReply(event)
    }

    func session(
=======
        } else {
            Self.logger.debug("watch activation state=\(Self.activationStateLabel(activationState), privacy: .public)")
        }
        // Always resume all waiters so callers never hang, even on error.
        Task { @MainActor in
            let waiters = self.pendingActivationContinuations
            self.pendingActivationContinuations.removeAll()
            for continuation in waiters {
                continuation.resume()
            }
        }
    }

    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}

    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    nonisolated func session(_: WCSession, didReceiveMessage message: [String: Any]) {
        guard let event = Self.parseQuickReplyPayload(message, transport: "sendMessage") else {
            return
        }
        Task { @MainActor in
            self.emitReply(event)
        }
    }

    nonisolated func session(
>>>>>>> upstream/main
        _: WCSession,
        didReceiveMessage message: [String: Any],
        replyHandler: @escaping ([String: Any]) -> Void)
    {
        guard let event = Self.parseQuickReplyPayload(message, transport: "sendMessage") else {
            replyHandler(["ok": false, "error": "unsupported_payload"])
            return
        }
        replyHandler(["ok": true])
<<<<<<< HEAD
        self.emitReply(event)
    }

    func session(_: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        guard let event = Self.parseQuickReplyPayload(userInfo, transport: "transferUserInfo") else {
            return
        }
        self.emitReply(event)
    }

    func sessionReachabilityDidChange(_ session: WCSession) {}
=======
        Task { @MainActor in
            self.emitReply(event)
        }
    }

    nonisolated func session(_: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        guard let event = Self.parseQuickReplyPayload(userInfo, transport: "transferUserInfo") else {
            return
        }
        Task { @MainActor in
            self.emitReply(event)
        }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {}
>>>>>>> upstream/main
}
