import Foundation
import Testing
<<<<<<< HEAD
@testable import HanzoBot

@Suite struct KeychainStoreTests {
    @Test func saveLoadUpdateDeleteRoundTrip() {
        let service = "ai.hanzo.bot.tests.\(UUID().uuidString)"
=======
@testable import OpenClaw

@Suite struct KeychainStoreTests {
    @Test func saveLoadUpdateDeleteRoundTrip() {
        let service = "ai.openclaw.tests.\(UUID().uuidString)"
>>>>>>> upstream/main
        let account = "value"

        #expect(KeychainStore.delete(service: service, account: account))
        #expect(KeychainStore.loadString(service: service, account: account) == nil)

        #expect(KeychainStore.saveString("first", service: service, account: account))
        #expect(KeychainStore.loadString(service: service, account: account) == "first")

        #expect(KeychainStore.saveString("second", service: service, account: account))
        #expect(KeychainStore.loadString(service: service, account: account) == "second")

        #expect(KeychainStore.delete(service: service, account: account))
        #expect(KeychainStore.loadString(service: service, account: account) == nil)
    }
}
