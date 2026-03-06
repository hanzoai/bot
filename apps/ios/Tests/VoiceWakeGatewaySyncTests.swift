import Foundation
import Testing
<<<<<<< HEAD
@testable import HanzoBot

@Suite struct VoiceWakeGatewaySyncTests {
    @Test func decodeGatewayTriggersFromJSONSanitizes() {
        let payload = #"{"triggers":[" hanzo-bot  ","", "computer"]}"#
        let triggers = VoiceWakePreferences.decodeGatewayTriggers(from: payload)
        #expect(triggers == ["hanzo-bot", "computer"])
=======
@testable import OpenClaw

@Suite struct VoiceWakeGatewaySyncTests {
    @Test func decodeGatewayTriggersFromJSONSanitizes() {
        let payload = #"{"triggers":[" openclaw  ","", "computer"]}"#
        let triggers = VoiceWakePreferences.decodeGatewayTriggers(from: payload)
        #expect(triggers == ["openclaw", "computer"])
>>>>>>> upstream/main
    }

    @Test func decodeGatewayTriggersFromJSONFallsBackWhenEmpty() {
        let payload = #"{"triggers":["  ",""]}"#
        let triggers = VoiceWakePreferences.decodeGatewayTriggers(from: payload)
        #expect(triggers == VoiceWakePreferences.defaultTriggerWords)
    }

    @Test func decodeGatewayTriggersFromInvalidJSONReturnsNil() {
        let triggers = VoiceWakePreferences.decodeGatewayTriggers(from: "not json")
        #expect(triggers == nil)
    }
}
