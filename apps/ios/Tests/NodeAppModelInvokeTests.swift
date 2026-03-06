<<<<<<< HEAD
import BotKit
import Foundation
import Testing
import UIKit
@testable import HanzoBot

private func withUserDefaults<T>(_ updates: [String: Any?], _ body: () throws -> T) rethrows -> T {
    let defaults = UserDefaults.standard
    var snapshot: [String: Any?] = [:]
    for key in updates.keys {
        snapshot[key] = defaults.object(forKey: key)
    }
    for (key, value) in updates {
        if let value {
            defaults.set(value, forKey: key)
        } else {
            defaults.removeObject(forKey: key)
        }
    }
    defer {
        for (key, value) in snapshot {
            if let value {
                defaults.set(value, forKey: key)
            } else {
                defaults.removeObject(forKey: key)
            }
        }
    }
    return try body()
=======
import OpenClawKit
import Foundation
import Testing
import UIKit
@testable import OpenClaw

private func makeAgentDeepLinkURL(
    message: String,
    deliver: Bool = false,
    to: String? = nil,
    channel: String? = nil,
    key: String? = nil) -> URL
{
    var components = URLComponents()
    components.scheme = "openclaw"
    components.host = "agent"
    var queryItems: [URLQueryItem] = [URLQueryItem(name: "message", value: message)]
    if deliver {
        queryItems.append(URLQueryItem(name: "deliver", value: "1"))
    }
    if let to {
        queryItems.append(URLQueryItem(name: "to", value: to))
    }
    if let channel {
        queryItems.append(URLQueryItem(name: "channel", value: channel))
    }
    if let key {
        queryItems.append(URLQueryItem(name: "key", value: key))
    }
    components.queryItems = queryItems
    return components.url!
}

@MainActor
private final class MockWatchMessagingService: @preconcurrency WatchMessagingServicing, @unchecked Sendable {
    var currentStatus = WatchMessagingStatus(
        supported: true,
        paired: true,
        appInstalled: true,
        reachable: true,
        activationState: "activated")
    var nextSendResult = WatchNotificationSendResult(
        deliveredImmediately: true,
        queuedForDelivery: false,
        transport: "sendMessage")
    var sendError: Error?
    var lastSent: (id: String, params: OpenClawWatchNotifyParams)?
    private var replyHandler: (@Sendable (WatchQuickReplyEvent) -> Void)?

    func status() async -> WatchMessagingStatus {
        self.currentStatus
    }

    func setReplyHandler(_ handler: (@Sendable (WatchQuickReplyEvent) -> Void)?) {
        self.replyHandler = handler
    }

    func sendNotification(id: String, params: OpenClawWatchNotifyParams) async throws -> WatchNotificationSendResult {
        self.lastSent = (id: id, params: params)
        if let sendError = self.sendError {
            throw sendError
        }
        return self.nextSendResult
    }

    func emitReply(_ event: WatchQuickReplyEvent) {
        self.replyHandler?(event)
    }
>>>>>>> upstream/main
}

@Suite(.serialized) struct NodeAppModelInvokeTests {
    @Test @MainActor func decodeParamsFailsWithoutJSON() {
        #expect(throws: Error.self) {
<<<<<<< HEAD
            _ = try NodeAppModel._test_decodeParams(HanzoBotCanvasNavigateParams.self, from: nil)
=======
            _ = try NodeAppModel._test_decodeParams(OpenClawCanvasNavigateParams.self, from: nil)
>>>>>>> upstream/main
        }
    }

    @Test @MainActor func encodePayloadEmitsJSON() throws {
        struct Payload: Codable, Equatable {
            var value: String
        }
        let json = try NodeAppModel._test_encodePayload(Payload(value: "ok"))
        #expect(json.contains("\"value\""))
    }

<<<<<<< HEAD
=======
    @Test @MainActor func chatSessionKeyDefaultsToIOSBase() {
        let appModel = NodeAppModel()
        #expect(appModel.chatSessionKey == "ios")
    }

    @Test @MainActor func chatSessionKeyUsesAgentScopedKeyForNonDefaultAgent() {
        let appModel = NodeAppModel()
        appModel.gatewayDefaultAgentId = "main"
        appModel.setSelectedAgentId("agent-123")
        #expect(appModel.chatSessionKey == SessionKey.makeAgentSessionKey(agentId: "agent-123", baseKey: "ios"))
        #expect(appModel.mainSessionKey == "agent:agent-123:main")
    }

>>>>>>> upstream/main
    @Test @MainActor func handleInvokeRejectsBackgroundCommands() async {
        let appModel = NodeAppModel()
        appModel.setScenePhase(.background)

<<<<<<< HEAD
        let req = BridgeInvokeRequest(id: "bg", command: HanzoBotCanvasCommand.present.rawValue)
=======
        let req = BridgeInvokeRequest(id: "bg", command: OpenClawCanvasCommand.present.rawValue)
>>>>>>> upstream/main
        let res = await appModel._test_handleInvoke(req)
        #expect(res.ok == false)
        #expect(res.error?.code == .backgroundUnavailable)
    }

    @Test @MainActor func handleInvokeRejectsCameraWhenDisabled() async {
        let appModel = NodeAppModel()
<<<<<<< HEAD
        let req = BridgeInvokeRequest(id: "cam", command: HanzoBotCameraCommand.snap.rawValue)
=======
        let req = BridgeInvokeRequest(id: "cam", command: OpenClawCameraCommand.snap.rawValue)
>>>>>>> upstream/main

        let defaults = UserDefaults.standard
        let key = "camera.enabled"
        let previous = defaults.object(forKey: key)
        defaults.set(false, forKey: key)
        defer {
            if let previous {
                defaults.set(previous, forKey: key)
            } else {
                defaults.removeObject(forKey: key)
            }
        }

        let res = await appModel._test_handleInvoke(req)
        #expect(res.ok == false)
        #expect(res.error?.code == .unavailable)
        #expect(res.error?.message.contains("CAMERA_DISABLED") == true)
    }

    @Test @MainActor func handleInvokeRejectsInvalidScreenFormat() async {
        let appModel = NodeAppModel()
<<<<<<< HEAD
        let params = HanzoBotScreenRecordParams(format: "gif")
=======
        let params = OpenClawScreenRecordParams(format: "gif")
>>>>>>> upstream/main
        let data = try? JSONEncoder().encode(params)
        let json = data.flatMap { String(data: $0, encoding: .utf8) }

        let req = BridgeInvokeRequest(
            id: "screen",
<<<<<<< HEAD
            command: HanzoBotScreenCommand.record.rawValue,
=======
            command: OpenClawScreenCommand.record.rawValue,
>>>>>>> upstream/main
            paramsJSON: json)

        let res = await appModel._test_handleInvoke(req)
        #expect(res.ok == false)
        #expect(res.error?.message.contains("screen format must be mp4") == true)
    }

    @Test @MainActor func handleInvokeCanvasCommandsUpdateScreen() async throws {
        let appModel = NodeAppModel()
        appModel.screen.navigate(to: "http://example.com")

<<<<<<< HEAD
        let present = BridgeInvokeRequest(id: "present", command: HanzoBotCanvasCommand.present.rawValue)
=======
        let present = BridgeInvokeRequest(id: "present", command: OpenClawCanvasCommand.present.rawValue)
>>>>>>> upstream/main
        let presentRes = await appModel._test_handleInvoke(present)
        #expect(presentRes.ok == true)
        #expect(appModel.screen.urlString.isEmpty)

        // Loopback URLs are rejected (they are not meaningful for a remote gateway).
<<<<<<< HEAD
        let navigateParams = HanzoBotCanvasNavigateParams(url: "http://example.com/")
=======
        let navigateParams = OpenClawCanvasNavigateParams(url: "http://example.com/")
>>>>>>> upstream/main
        let navData = try JSONEncoder().encode(navigateParams)
        let navJSON = String(decoding: navData, as: UTF8.self)
        let navigate = BridgeInvokeRequest(
            id: "nav",
<<<<<<< HEAD
            command: HanzoBotCanvasCommand.navigate.rawValue,
=======
            command: OpenClawCanvasCommand.navigate.rawValue,
>>>>>>> upstream/main
            paramsJSON: navJSON)
        let navRes = await appModel._test_handleInvoke(navigate)
        #expect(navRes.ok == true)
        #expect(appModel.screen.urlString == "http://example.com/")

<<<<<<< HEAD
        let evalParams = HanzoBotCanvasEvalParams(javaScript: "1+1")
=======
        let evalParams = OpenClawCanvasEvalParams(javaScript: "1+1")
>>>>>>> upstream/main
        let evalData = try JSONEncoder().encode(evalParams)
        let evalJSON = String(decoding: evalData, as: UTF8.self)
        let eval = BridgeInvokeRequest(
            id: "eval",
<<<<<<< HEAD
            command: HanzoBotCanvasCommand.evalJS.rawValue,
=======
            command: OpenClawCanvasCommand.evalJS.rawValue,
>>>>>>> upstream/main
            paramsJSON: evalJSON)
        let evalRes = await appModel._test_handleInvoke(eval)
        #expect(evalRes.ok == true)
        let payloadData = try #require(evalRes.payloadJSON?.data(using: .utf8))
        let payload = try JSONSerialization.jsonObject(with: payloadData) as? [String: Any]
        #expect(payload?["result"] as? String == "2")
    }

    @Test @MainActor func handleInvokeA2UICommandsFailWhenHostMissing() async throws {
        let appModel = NodeAppModel()

<<<<<<< HEAD
        let reset = BridgeInvokeRequest(id: "reset", command: HanzoBotCanvasA2UICommand.reset.rawValue)
=======
        let reset = BridgeInvokeRequest(id: "reset", command: OpenClawCanvasA2UICommand.reset.rawValue)
>>>>>>> upstream/main
        let resetRes = await appModel._test_handleInvoke(reset)
        #expect(resetRes.ok == false)
        #expect(resetRes.error?.message.contains("A2UI_HOST_NOT_CONFIGURED") == true)

        let jsonl = "{\"beginRendering\":{}}"
<<<<<<< HEAD
        let pushParams = HanzoBotCanvasA2UIPushJSONLParams(jsonl: jsonl)
=======
        let pushParams = OpenClawCanvasA2UIPushJSONLParams(jsonl: jsonl)
>>>>>>> upstream/main
        let pushData = try JSONEncoder().encode(pushParams)
        let pushJSON = String(decoding: pushData, as: UTF8.self)
        let push = BridgeInvokeRequest(
            id: "push",
<<<<<<< HEAD
            command: HanzoBotCanvasA2UICommand.pushJSONL.rawValue,
=======
            command: OpenClawCanvasA2UICommand.pushJSONL.rawValue,
>>>>>>> upstream/main
            paramsJSON: pushJSON)
        let pushRes = await appModel._test_handleInvoke(push)
        #expect(pushRes.ok == false)
        #expect(pushRes.error?.message.contains("A2UI_HOST_NOT_CONFIGURED") == true)
    }

    @Test @MainActor func handleInvokeUnknownCommandReturnsInvalidRequest() async {
        let appModel = NodeAppModel()
        let req = BridgeInvokeRequest(id: "unknown", command: "nope")
        let res = await appModel._test_handleInvoke(req)
        #expect(res.ok == false)
        #expect(res.error?.code == .invalidRequest)
    }

<<<<<<< HEAD
    @Test @MainActor func handleDeepLinkSetsErrorWhenNotConnected() async {
        let appModel = NodeAppModel()
        let url = URL(string: "hanzo-bot://agent?message=hello")!
=======
    @Test @MainActor func handleInvokeWatchStatusReturnsServiceSnapshot() async throws {
        let watchService = MockWatchMessagingService()
        watchService.currentStatus = WatchMessagingStatus(
            supported: true,
            paired: true,
            appInstalled: true,
            reachable: false,
            activationState: "inactive")
        let appModel = NodeAppModel(watchMessagingService: watchService)
        let req = BridgeInvokeRequest(id: "watch-status", command: OpenClawWatchCommand.status.rawValue)

        let res = await appModel._test_handleInvoke(req)
        #expect(res.ok == true)

        let payloadData = try #require(res.payloadJSON?.data(using: .utf8))
        let payload = try JSONDecoder().decode(OpenClawWatchStatusPayload.self, from: payloadData)
        #expect(payload.supported == true)
        #expect(payload.reachable == false)
        #expect(payload.activationState == "inactive")
    }

    @Test @MainActor func handleInvokeWatchNotifyRoutesToWatchService() async throws {
        let watchService = MockWatchMessagingService()
        watchService.nextSendResult = WatchNotificationSendResult(
            deliveredImmediately: false,
            queuedForDelivery: true,
            transport: "transferUserInfo")
        let appModel = NodeAppModel(watchMessagingService: watchService)
        let params = OpenClawWatchNotifyParams(
            title: "OpenClaw",
            body: "Meeting with Peter is at 4pm",
            priority: .timeSensitive)
        let paramsData = try JSONEncoder().encode(params)
        let paramsJSON = String(decoding: paramsData, as: UTF8.self)
        let req = BridgeInvokeRequest(
            id: "watch-notify",
            command: OpenClawWatchCommand.notify.rawValue,
            paramsJSON: paramsJSON)

        let res = await appModel._test_handleInvoke(req)
        #expect(res.ok == true)
        #expect(watchService.lastSent?.params.title == "OpenClaw")
        #expect(watchService.lastSent?.params.body == "Meeting with Peter is at 4pm")
        #expect(watchService.lastSent?.params.priority == .timeSensitive)

        let payloadData = try #require(res.payloadJSON?.data(using: .utf8))
        let payload = try JSONDecoder().decode(OpenClawWatchNotifyPayload.self, from: payloadData)
        #expect(payload.deliveredImmediately == false)
        #expect(payload.queuedForDelivery == true)
        #expect(payload.transport == "transferUserInfo")
    }

    @Test @MainActor func handleInvokeWatchNotifyRejectsEmptyMessage() async throws {
        let watchService = MockWatchMessagingService()
        let appModel = NodeAppModel(watchMessagingService: watchService)
        let params = OpenClawWatchNotifyParams(title: "   ", body: "\n")
        let paramsData = try JSONEncoder().encode(params)
        let paramsJSON = String(decoding: paramsData, as: UTF8.self)
        let req = BridgeInvokeRequest(
            id: "watch-notify-empty",
            command: OpenClawWatchCommand.notify.rawValue,
            paramsJSON: paramsJSON)

        let res = await appModel._test_handleInvoke(req)
        #expect(res.ok == false)
        #expect(res.error?.code == .invalidRequest)
        #expect(watchService.lastSent == nil)
    }

    @Test @MainActor func handleInvokeWatchNotifyAddsDefaultActionsForPrompt() async throws {
        let watchService = MockWatchMessagingService()
        let appModel = NodeAppModel(watchMessagingService: watchService)
        let params = OpenClawWatchNotifyParams(
            title: "Task",
            body: "Action needed",
            priority: .passive,
            promptId: "prompt-123")
        let paramsData = try JSONEncoder().encode(params)
        let paramsJSON = String(decoding: paramsData, as: UTF8.self)
        let req = BridgeInvokeRequest(
            id: "watch-notify-default-actions",
            command: OpenClawWatchCommand.notify.rawValue,
            paramsJSON: paramsJSON)

        let res = await appModel._test_handleInvoke(req)
        #expect(res.ok == true)
        #expect(watchService.lastSent?.params.risk == .low)
        let actionIDs = watchService.lastSent?.params.actions?.map(\.id)
        #expect(actionIDs == ["done", "snooze_10m", "open_phone", "escalate"])
    }

    @Test @MainActor func handleInvokeWatchNotifyAddsApprovalDefaults() async throws {
        let watchService = MockWatchMessagingService()
        let appModel = NodeAppModel(watchMessagingService: watchService)
        let params = OpenClawWatchNotifyParams(
            title: "Approval",
            body: "Allow command?",
            promptId: "prompt-approval",
            kind: "approval")
        let paramsData = try JSONEncoder().encode(params)
        let paramsJSON = String(decoding: paramsData, as: UTF8.self)
        let req = BridgeInvokeRequest(
            id: "watch-notify-approval-defaults",
            command: OpenClawWatchCommand.notify.rawValue,
            paramsJSON: paramsJSON)

        let res = await appModel._test_handleInvoke(req)
        #expect(res.ok == true)
        let actionIDs = watchService.lastSent?.params.actions?.map(\.id)
        #expect(actionIDs == ["approve", "decline", "open_phone", "escalate"])
        #expect(watchService.lastSent?.params.actions?[1].style == "destructive")
    }

    @Test @MainActor func handleInvokeWatchNotifyDerivesPriorityFromRiskAndCapsActions() async throws {
        let watchService = MockWatchMessagingService()
        let appModel = NodeAppModel(watchMessagingService: watchService)
        let params = OpenClawWatchNotifyParams(
            title: "Urgent",
            body: "Check now",
            risk: .high,
            actions: [
                OpenClawWatchAction(id: "a1", label: "A1"),
                OpenClawWatchAction(id: "a2", label: "A2"),
                OpenClawWatchAction(id: "a3", label: "A3"),
                OpenClawWatchAction(id: "a4", label: "A4"),
                OpenClawWatchAction(id: "a5", label: "A5"),
            ])
        let paramsData = try JSONEncoder().encode(params)
        let paramsJSON = String(decoding: paramsData, as: UTF8.self)
        let req = BridgeInvokeRequest(
            id: "watch-notify-derive-priority",
            command: OpenClawWatchCommand.notify.rawValue,
            paramsJSON: paramsJSON)

        let res = await appModel._test_handleInvoke(req)
        #expect(res.ok == true)
        #expect(watchService.lastSent?.params.priority == .timeSensitive)
        #expect(watchService.lastSent?.params.risk == .high)
        let actionIDs = watchService.lastSent?.params.actions?.map(\.id)
        #expect(actionIDs == ["a1", "a2", "a3", "a4"])
    }

    @Test @MainActor func handleInvokeWatchNotifyReturnsUnavailableOnDeliveryFailure() async throws {
        let watchService = MockWatchMessagingService()
        watchService.sendError = NSError(
            domain: "watch",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "WATCH_UNAVAILABLE: no paired Apple Watch"])
        let appModel = NodeAppModel(watchMessagingService: watchService)
        let params = OpenClawWatchNotifyParams(title: "OpenClaw", body: "Delivery check")
        let paramsData = try JSONEncoder().encode(params)
        let paramsJSON = String(decoding: paramsData, as: UTF8.self)
        let req = BridgeInvokeRequest(
            id: "watch-notify-fail",
            command: OpenClawWatchCommand.notify.rawValue,
            paramsJSON: paramsJSON)

        let res = await appModel._test_handleInvoke(req)
        #expect(res.ok == false)
        #expect(res.error?.code == .unavailable)
        #expect(res.error?.message.contains("WATCH_UNAVAILABLE") == true)
    }

    @Test @MainActor func watchReplyQueuesWhenGatewayOffline() async {
        let watchService = MockWatchMessagingService()
        let appModel = NodeAppModel(watchMessagingService: watchService)
        watchService.emitReply(
            WatchQuickReplyEvent(
                replyId: "reply-offline-1",
                promptId: "prompt-1",
                actionId: "approve",
                actionLabel: "Approve",
                sessionKey: "ios",
                note: nil,
                sentAtMs: 1234,
                transport: "transferUserInfo"))
        #expect(appModel._test_queuedWatchReplyCount() == 1)
    }

    @Test @MainActor func handleDeepLinkSetsErrorWhenNotConnected() async {
        let appModel = NodeAppModel()
        let url = URL(string: "openclaw://agent?message=hello")!
>>>>>>> upstream/main
        await appModel.handleDeepLink(url: url)
        #expect(appModel.screen.errorText?.contains("Gateway not connected") == true)
    }

    @Test @MainActor func handleDeepLinkRejectsOversizedMessage() async {
        let appModel = NodeAppModel()
        let msg = String(repeating: "a", count: 20001)
<<<<<<< HEAD
        let url = URL(string: "hanzo-bot://agent?message=\(msg)")!
=======
        let url = URL(string: "openclaw://agent?message=\(msg)")!
>>>>>>> upstream/main
        await appModel.handleDeepLink(url: url)
        #expect(appModel.screen.errorText?.contains("Deep link too large") == true)
    }

<<<<<<< HEAD
=======
    @Test @MainActor func handleDeepLinkRequiresConfirmationWhenConnectedAndUnkeyed() async {
        let appModel = NodeAppModel()
        appModel._test_setGatewayConnected(true)
        let url = makeAgentDeepLinkURL(message: "hello from deep link")

        await appModel.handleDeepLink(url: url)
        #expect(appModel.pendingAgentDeepLinkPrompt != nil)
        #expect(appModel.openChatRequestID == 0)

        await appModel.approvePendingAgentDeepLinkPrompt()
        #expect(appModel.pendingAgentDeepLinkPrompt == nil)
        #expect(appModel.openChatRequestID == 1)
    }

    @Test @MainActor func handleDeepLinkCoalescesPromptWhenRateLimited() async throws {
        let appModel = NodeAppModel()
        appModel._test_setGatewayConnected(true)

        await appModel.handleDeepLink(url: makeAgentDeepLinkURL(message: "first prompt"))
        let firstPrompt = try #require(appModel.pendingAgentDeepLinkPrompt)

        await appModel.handleDeepLink(url: makeAgentDeepLinkURL(message: "second prompt"))
        let coalescedPrompt = try #require(appModel.pendingAgentDeepLinkPrompt)

        #expect(coalescedPrompt.id != firstPrompt.id)
        #expect(coalescedPrompt.messagePreview.contains("second prompt"))
    }

    @Test @MainActor func handleDeepLinkStripsDeliveryFieldsWhenUnkeyed() async throws {
        let appModel = NodeAppModel()
        appModel._test_setGatewayConnected(true)
        let url = makeAgentDeepLinkURL(
            message: "route this",
            deliver: true,
            to: "123456",
            channel: "telegram")

        await appModel.handleDeepLink(url: url)
        let prompt = try #require(appModel.pendingAgentDeepLinkPrompt)
        #expect(prompt.request.deliver == false)
        #expect(prompt.request.to == nil)
        #expect(prompt.request.channel == nil)
    }

    @Test @MainActor func handleDeepLinkRejectsLongUnkeyedMessageWhenConnected() async {
        let appModel = NodeAppModel()
        appModel._test_setGatewayConnected(true)
        let message = String(repeating: "x", count: 241)
        let url = makeAgentDeepLinkURL(message: message)

        await appModel.handleDeepLink(url: url)
        #expect(appModel.pendingAgentDeepLinkPrompt == nil)
        #expect(appModel.screen.errorText?.contains("blocked") == true)
    }

    @Test @MainActor func handleDeepLinkBypassesPromptWithValidKey() async {
        let appModel = NodeAppModel()
        appModel._test_setGatewayConnected(true)
        let key = NodeAppModel._test_currentDeepLinkKey()
        let url = makeAgentDeepLinkURL(message: "trusted request", key: key)

        await appModel.handleDeepLink(url: url)
        #expect(appModel.pendingAgentDeepLinkPrompt == nil)
        #expect(appModel.openChatRequestID == 1)
    }

>>>>>>> upstream/main
    @Test @MainActor func sendVoiceTranscriptThrowsWhenGatewayOffline() async {
        let appModel = NodeAppModel()
        await #expect(throws: Error.self) {
            try await appModel.sendVoiceTranscript(text: "hello", sessionKey: "main")
        }
    }

    @Test @MainActor func canvasA2UIActionDispatchesStatus() async {
        let appModel = NodeAppModel()
        let body: [String: Any] = [
            "userAction": [
                "name": "tap",
                "id": "action-1",
                "surfaceId": "main",
                "sourceComponentId": "button-1",
                "context": ["value": "ok"],
            ],
        ]
        await appModel._test_handleCanvasA2UIAction(body: body)
        #expect(appModel.screen.urlString.isEmpty)
    }
}
