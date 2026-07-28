import Foundation
import Testing
@testable import BotChatUI

private func textContent(_ text: String) -> BotChatMessageContent {
    BotChatMessageContent(type: "text", text: text, mimeType: nil, fileName: nil, content: nil)
}

private func toolCallContent(name: String) -> BotChatMessageContent {
    BotChatMessageContent(
        type: "toolCall",
        text: nil,
        mimeType: nil,
        fileName: nil,
        content: nil,
        id: "call-1",
        name: name)
}

@Suite("ChatMessageVisibleText")
struct ChatMessageVisibleTextTests {
    @Test func `assistant visible text skips non text blocks`() {
        let message = BotChatMessage(
            role: "assistant",
            content: [
                textContent("Here is the answer."),
                toolCallContent(name: "exec"),
                textContent("And a follow-up."),
            ],
            timestamp: 1)

        #expect(ChatMessageVisibleText.visibleText(in: message)
            == "Here is the answer.\nAnd a follow-up.")
    }

    @Test func `user text passes through without assistant parsing`() {
        let message = BotChatMessage(
            role: "user",
            content: [textContent("What is <final>up</final>?")],
            timestamp: 1)

        #expect(ChatMessageVisibleText.visibleText(in: message) == "What is <final>up</final>?")
    }

    @Test func `assistant copy excludes thinking while user copy stays exact`() {
        let assistant = BotChatMessage(
            role: "assistant",
            content: [textContent("<think>private reasoning</think>\nVisible **answer**")],
            timestamp: 1)
        let user = BotChatMessage(
            role: "user",
            content: [textContent("Keep <think>this literal tag</think>")],
            timestamp: 1)

        #expect(ChatMessageVisibleText.copyText(in: assistant) == "Visible **answer**")
        #expect(ChatMessageVisibleText.copyText(in: user) == "Keep <think>this literal tag</think>")
    }

    @Test func `history decode retains transcript identity and truncation signals`() throws {
        let metadata = try JSONDecoder().decode(
            BotChatMessage.self,
            from: Data(#"{"role":"assistant","content":"short","__bot":{"id":"msg-1","truncated":true}}"#.utf8))
        let marker = try JSONDecoder().decode(
            BotChatMessage.self,
            from: Data(#"{"role":"assistant","content":"short\n...(truncated)...","__bot":{"id":"msg-2"}}"#.utf8))

        #expect(metadata.transcriptMessageID == "msg-1")
        #expect(metadata.isTruncated)
        #expect(marker.transcriptMessageID == "msg-2")
        #expect(marker.isTruncated)
    }

    @Test func `transcript metadata survives message coding round trip`() throws {
        let original = BotChatMessage(
            role: "assistant",
            content: [textContent("short\n...(truncated)...")],
            timestamp: 1,
            transcriptMessageID: "msg-round-trip",
            isTruncated: true)

        let decoded = try JSONDecoder().decode(
            BotChatMessage.self,
            from: JSONEncoder().encode(original))

        #expect(decoded.transcriptMessageID == "msg-round-trip")
        #expect(decoded.isTruncated)
    }

    @Test func `legacy trace mapping sets both independent display options`() {
        #expect(BotChatDisplayOptions.assistantTrace(true) == [.reasoning, .toolActivity])
        #expect(BotChatDisplayOptions.assistantTrace(false).isEmpty)
        #expect(BotChatDisplayOptions.reasoning != .toolActivity)
    }

    @Test func `has visible text ignores tool blank and thinking only messages`() {
        let toolOnly = BotChatMessage(
            role: "assistant",
            content: [toolCallContent(name: "exec")],
            timestamp: 1)
        let blank = BotChatMessage(
            role: "assistant",
            content: [textContent("   ")],
            timestamp: 1)
        let spoken = BotChatMessage(
            role: "assistant",
            content: [textContent("Say this")],
            timestamp: 1)
        let thinkingOnly = BotChatMessage(
            role: "assistant",
            content: [textContent("<think>Do not speak this</think>")],
            timestamp: 1)

        #expect(!ChatMessageVisibleText.hasVisibleText(in: toolOnly))
        #expect(!ChatMessageVisibleText.hasVisibleText(in: blank))
        #expect(!ChatMessageVisibleText.hasVisibleText(in: thinkingOnly))
        #expect(ChatMessageVisibleText.hasVisibleText(in: spoken))
    }
}
