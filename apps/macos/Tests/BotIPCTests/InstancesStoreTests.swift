import BotProtocol
import Testing
@testable import Bot

@Suite struct InstancesStoreTests {
    @Test
    @MainActor
    func presenceEventPayloadDecodesViaJSONEncoder() {
        // Build a payload that mirrors the gateway's presence event shape:
        // { "presence": [ PresenceEntry ] }
        let entry: [String: BotProtocol.AnyCodable] = [
            "host": .init("gw"),
            "ip": .init("10.0.0.1"),
            "version": .init("2.0.0"),
            "mode": .init("gateway"),
            "lastInputSeconds": .init(5),
            "reason": .init("test"),
            "text": .init("Gateway node"),
            "ts": .init(1_730_000_000),
        ]
        let payloadMap: [String: BotProtocol.AnyCodable] = [
            "presence": .init([BotProtocol.AnyCodable(entry)]),
        ]
        let payload = BotProtocol.AnyCodable(payloadMap)

        let store = InstancesStore(isPreview: true)
        store.handlePresenceEventPayload(payload)

        #expect(store.instances.count == 1)
        let instance = store.instances.first
        #expect(instance?.host == "gw")
        #expect(instance?.ip == "10.0.0.1")
        #expect(instance?.mode == "gateway")
        #expect(instance?.reason == "test")
    }
}
