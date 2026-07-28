import Foundation
import BotKit
import Testing
import UIKit
@testable import Bot

@Suite(.serialized) struct BotAppDelegateTests {
    @Test @MainActor func `resolves registry model before view task assigns delegate model`() {
        let registryModel = NodeAppModel()
        BotAppModelRegistry.appModel = registryModel
        defer { BotAppModelRegistry.appModel = nil }

        let delegate = BotAppDelegate()

        #expect(delegate._test_resolvedAppModel() === registryModel)
    }

    @Test @MainActor func `prefers explicit delegate model over registry fallback`() {
        let registryModel = NodeAppModel()
        let explicitModel = NodeAppModel()
        BotAppModelRegistry.appModel = registryModel
        defer { BotAppModelRegistry.appModel = nil }

        let delegate = BotAppDelegate()
        delegate.appModel = explicitModel

        #expect(delegate._test_resolvedAppModel() === explicitModel)
    }

    @Test @MainActor func `derives background refresh task identifier from app bundle identifier`() {
        let delegate = BotAppDelegate()
        let bundleIdentifier = Bundle.main.bundleIdentifier ?? "ai.botfoundation.app.tests"

        #expect(delegate._test_wakeRefreshTaskIdentifier() == "\(bundleIdentifier).bgrefresh")
    }

    @Test @MainActor func `stages a gateway URL when the model is ready`() async throws {
        BotAppModelRegistry.appModel = nil
        defer { BotAppModelRegistry.appModel = nil }
        let model = NodeAppModel()
        let delegate = BotAppDelegate()
        delegate.appModel = model
        let url = try #require(URL(
            string: "bot://gateway?host=gateway.example.com&port=443&tls=1&token=tok"))

        #expect(delegate.application(UIApplication.shared, open: url))
        let link = await Self.waitForGatewaySetup(in: model)

        #expect(link?.host == "gateway.example.com")
        #expect(link?.port == 443)
        #expect(link?.tls == true)
        #expect(link?.token == "tok")
    }

    @Test @MainActor func `replays a gateway URL received before the model is ready`() async throws {
        BotAppModelRegistry.appModel = nil
        defer { BotAppModelRegistry.appModel = nil }
        let delegate = BotAppDelegate()
        let url = try #require(URL(
            string: "bot://gateway?host=gateway.example.com&port=443&tls=1&token=tok"))

        #expect(delegate.application(UIApplication.shared, open: url))

        let model = NodeAppModel()
        delegate.appModel = model
        let link = await Self.waitForGatewaySetup(in: model)

        #expect(link?.host == "gateway.example.com")
        #expect(link?.token == "tok")
    }

    @Test @MainActor func `rejects an invalid URL`() throws {
        let delegate = BotAppDelegate()
        let url = try #require(URL(string: "https://example.com/gateway"))

        #expect(!delegate.application(UIApplication.shared, open: url))
    }

    @MainActor
    private static func waitForGatewaySetup(in model: NodeAppModel) async -> GatewayConnectDeepLink? {
        for _ in 0..<20 {
            if model.gatewaySetupRequestID > 0 {
                return model.consumePendingGatewaySetupLink()
            }
            await Task.yield()
        }
        return nil
    }
}
