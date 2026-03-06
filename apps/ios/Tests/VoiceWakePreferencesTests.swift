import Foundation
import Testing
<<<<<<< HEAD
@testable import HanzoBot

@Suite struct VoiceWakePreferencesTests {
    @Test func sanitizeTriggerWordsTrimsAndDropsEmpty() {
        #expect(VoiceWakePreferences.sanitizeTriggerWords([" hanzo-bot ", "", " \nclaude\t"]) == ["hanzo-bot", "claude"])
=======
@testable import OpenClaw

@Suite struct VoiceWakePreferencesTests {
    @Test func sanitizeTriggerWordsTrimsAndDropsEmpty() {
        #expect(VoiceWakePreferences.sanitizeTriggerWords([" openclaw ", "", " \nclaude\t"]) == ["openclaw", "claude"])
>>>>>>> upstream/main
    }

    @Test func sanitizeTriggerWordsFallsBackToDefaultsWhenEmpty() {
        #expect(VoiceWakePreferences.sanitizeTriggerWords(["", "  "]) == VoiceWakePreferences.defaultTriggerWords)
    }

    @Test func sanitizeTriggerWordsLimitsWordLength() {
        let long = String(repeating: "x", count: VoiceWakePreferences.maxWordLength + 5)
        let cleaned = VoiceWakePreferences.sanitizeTriggerWords(["ok", long])
        #expect(cleaned[1].count == VoiceWakePreferences.maxWordLength)
    }

    @Test func sanitizeTriggerWordsLimitsWordCount() {
        let words = (1...VoiceWakePreferences.maxWords + 3).map { "w\($0)" }
        let cleaned = VoiceWakePreferences.sanitizeTriggerWords(words)
        #expect(cleaned.count == VoiceWakePreferences.maxWords)
    }

    @Test func displayStringUsesSanitizedWords() {
<<<<<<< HEAD
        #expect(VoiceWakePreferences.displayString(for: ["", " "]) == "hanzo-bot, claude")
=======
        #expect(VoiceWakePreferences.displayString(for: ["", " "]) == "openclaw, claude")
>>>>>>> upstream/main
    }

    @Test func loadAndSaveTriggerWordsRoundTrip() {
        let suiteName = "VoiceWakePreferencesTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!

        #expect(VoiceWakePreferences.loadTriggerWords(defaults: defaults) == VoiceWakePreferences.defaultTriggerWords)
        VoiceWakePreferences.saveTriggerWords(["computer"], defaults: defaults)
        #expect(VoiceWakePreferences.loadTriggerWords(defaults: defaults) == ["computer"])
    }
}
