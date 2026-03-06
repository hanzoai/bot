import Foundation
import SwabbleKit
import Testing
<<<<<<< HEAD
@testable import HanzoBot
=======
@testable import OpenClaw

private let openclawTranscript = "hey openclaw do thing"

private func openclawSegments(postTriggerStart: TimeInterval) -> [WakeWordSegment] {
    makeSegments(
        transcript: openclawTranscript,
        words: [
            ("hey", 0.0, 0.1),
            ("openclaw", 0.2, 0.1),
            ("do", postTriggerStart, 0.1),
            ("thing", postTriggerStart + 0.2, 0.1),
        ])
}
>>>>>>> upstream/main

@Suite struct VoiceWakeManagerExtractCommandTests {
    @Test func extractCommandReturnsNilWhenNoTriggerFound() {
        let transcript = "hello world"
        let segments = makeSegments(
            transcript: transcript,
            words: [("hello", 0.0, 0.1), ("world", 0.2, 0.1)])
<<<<<<< HEAD
        #expect(VoiceWakeManager.extractCommand(from: transcript, segments: segments, triggers: ["hanzo-bot"]) == nil)
    }

    @Test func extractCommandTrimsTokensAndResult() {
        let transcript = "hey hanzo-bot do thing"
        let segments = makeSegments(
            transcript: transcript,
            words: [
                ("hey", 0.0, 0.1),
                ("hanzo-bot", 0.2, 0.1),
                ("do", 0.9, 0.1),
                ("thing", 1.1, 0.1),
            ])
        let cmd = VoiceWakeManager.extractCommand(
            from: botTranscript,
            segments: segments,
            triggers: ["  hanzo-bot  "],
=======
        #expect(VoiceWakeManager.extractCommand(from: transcript, segments: segments, triggers: ["openclaw"]) == nil)
    }

    @Test func extractCommandTrimsTokensAndResult() {
        let segments = openclawSegments(postTriggerStart: 0.9)
        let cmd = VoiceWakeManager.extractCommand(
            from: openclawTranscript,
            segments: segments,
            triggers: ["  openclaw  "],
>>>>>>> upstream/main
            minPostTriggerGap: 0.3)
        #expect(cmd == "do thing")
    }

    @Test func extractCommandReturnsNilWhenGapTooShort() {
<<<<<<< HEAD
        let transcript = "hey hanzo-bot do thing"
        let segments = makeSegments(
            transcript: transcript,
            words: [
                ("hey", 0.0, 0.1),
                ("hanzo-bot", 0.2, 0.1),
                ("do", 0.35, 0.1),
                ("thing", 0.5, 0.1),
            ])
        let cmd = VoiceWakeManager.extractCommand(
            from: botTranscript,
            segments: segments,
            triggers: ["hanzo-bot"],
=======
        let segments = openclawSegments(postTriggerStart: 0.35)
        let cmd = VoiceWakeManager.extractCommand(
            from: openclawTranscript,
            segments: segments,
            triggers: ["openclaw"],
>>>>>>> upstream/main
            minPostTriggerGap: 0.3)
        #expect(cmd == nil)
    }

    @Test func extractCommandReturnsNilWhenNothingAfterTrigger() {
<<<<<<< HEAD
        let transcript = "hey hanzo-bot"
        let segments = makeSegments(
            transcript: transcript,
            words: [("hey", 0.0, 0.1), ("hanzo-bot", 0.2, 0.1)])
        #expect(VoiceWakeManager.extractCommand(from: transcript, segments: segments, triggers: ["hanzo-bot"]) == nil)
    }

    @Test func extractCommandIgnoresEmptyTriggers() {
        let transcript = "hey hanzo-bot do thing"
        let segments = makeSegments(
            transcript: transcript,
            words: [
                ("hey", 0.0, 0.1),
                ("hanzo-bot", 0.2, 0.1),
                ("do", 0.9, 0.1),
                ("thing", 1.1, 0.1),
            ])
        let cmd = VoiceWakeManager.extractCommand(
            from: botTranscript,
            segments: segments,
            triggers: ["", "   ", "hanzo-bot"],
=======
        let transcript = "hey openclaw"
        let segments = makeSegments(
            transcript: transcript,
            words: [("hey", 0.0, 0.1), ("openclaw", 0.2, 0.1)])
        #expect(VoiceWakeManager.extractCommand(from: transcript, segments: segments, triggers: ["openclaw"]) == nil)
    }

    @Test func extractCommandIgnoresEmptyTriggers() {
        let segments = openclawSegments(postTriggerStart: 0.9)
        let cmd = VoiceWakeManager.extractCommand(
            from: openclawTranscript,
            segments: segments,
            triggers: ["", "   ", "openclaw"],
>>>>>>> upstream/main
            minPostTriggerGap: 0.3)
        #expect(cmd == "do thing")
    }
}

private func makeSegments(
    transcript: String,
    words: [(String, TimeInterval, TimeInterval)])
-> [WakeWordSegment] {
    var searchStart = transcript.startIndex
    var output: [WakeWordSegment] = []
    for (word, start, duration) in words {
        let range = transcript.range(of: word, range: searchStart..<transcript.endIndex)
        output.append(WakeWordSegment(text: word, start: start, duration: duration, range: range))
        if let range { searchStart = range.upperBound }
    }
    return output
}
