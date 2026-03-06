<<<<<<< HEAD
import BotKit
=======
import OpenClawKit
>>>>>>> upstream/main
import Foundation
import Testing

private func setupCode(from payload: String) -> String {
    Data(payload.utf8)
        .base64EncodedString()
        .replacingOccurrences(of: "+", with: "-")
        .replacingOccurrences(of: "/", with: "_")
        .replacingOccurrences(of: "=", with: "")
}

private func agentAction(
    message: String,
    sessionKey: String? = nil,
    thinking: String? = nil,
    deliver: Bool = false,
    to: String? = nil,
    channel: String? = nil,
    timeoutSeconds: Int? = nil,
    key: String? = nil) -> DeepLinkRoute
{
    .agent(
        .init(
            message: message,
            sessionKey: sessionKey,
            thinking: thinking,
            deliver: deliver,
            to: to,
            channel: channel,
            timeoutSeconds: timeoutSeconds,
            key: key))
}

@Suite struct DeepLinkParserTests {
    @Test func parseRejectsUnknownHost() {
<<<<<<< HEAD
        let url = URL(string: "hanzo-bot://nope?message=hi")!
=======
        let url = URL(string: "openclaw://nope?message=hi")!
>>>>>>> upstream/main
        #expect(DeepLinkParser.parse(url) == nil)
    }

    @Test func parseHostIsCaseInsensitive() {
<<<<<<< HEAD
        let url = URL(string: "hanzo-bot://AGENT?message=Hello")!
        #expect(DeepLinkParser.parse(url) == .agent(.init(
            message: "Hello",
            sessionKey: nil,
            thinking: nil,
            deliver: false,
            to: nil,
            channel: nil,
            timeoutSeconds: nil,
            key: nil)))
    }

    @Test func parseRejectsNonHanzoBotScheme() {
=======
        let url = URL(string: "openclaw://AGENT?message=Hello")!
        #expect(DeepLinkParser.parse(url) == agentAction(message: "Hello"))
    }

    @Test func parseRejectsNonOpenClawScheme() {
>>>>>>> upstream/main
        let url = URL(string: "https://example.com/agent?message=hi")!
        #expect(DeepLinkParser.parse(url) == nil)
    }

    @Test func parseRejectsEmptyMessage() {
<<<<<<< HEAD
        let url = URL(string: "hanzo-bot://agent?message=%20%20%0A")!
=======
        let url = URL(string: "openclaw://agent?message=%20%20%0A")!
>>>>>>> upstream/main
        #expect(DeepLinkParser.parse(url) == nil)
    }

    @Test func parseAgentLinkParsesCommonFields() {
        let url =
<<<<<<< HEAD
            URL(string: "hanzo-bot://agent?message=Hello&deliver=1&sessionKey=node-test&thinking=low&timeoutSeconds=30")!
        #expect(
            DeepLinkParser.parse(url) == .agent(
                .init(
                    message: "Hello",
                    sessionKey: "node-test",
                    thinking: "low",
                    deliver: true,
                    to: nil,
                    channel: nil,
                    timeoutSeconds: 30,
                    key: nil)))
=======
            URL(string: "openclaw://agent?message=Hello&deliver=1&sessionKey=node-test&thinking=low&timeoutSeconds=30")!
        #expect(DeepLinkParser.parse(url) == agentAction(
            message: "Hello",
            sessionKey: "node-test",
            thinking: "low",
            deliver: true,
            timeoutSeconds: 30))
>>>>>>> upstream/main
    }

    @Test func parseAgentLinkParsesTargetRoutingFields() {
        let url =
            URL(
<<<<<<< HEAD
                string: "hanzo-bot://agent?message=Hello%20World&deliver=1&to=%2B15551234567&channel=whatsapp&key=secret")!
        #expect(
            DeepLinkParser.parse(url) == .agent(
                .init(
                    message: "Hello World",
                    sessionKey: nil,
                    thinking: nil,
                    deliver: true,
                    to: "+15551234567",
                    channel: "whatsapp",
                    timeoutSeconds: nil,
                    key: "secret")))
    }

    @Test func parseRejectsNegativeTimeoutSeconds() {
        let url = URL(string: "hanzo-bot://agent?message=Hello&timeoutSeconds=-1")!
        #expect(DeepLinkParser.parse(url) == .agent(.init(
            message: "Hello",
            sessionKey: nil,
            thinking: nil,
            deliver: false,
            to: nil,
            channel: nil,
            timeoutSeconds: nil,
            key: nil)))
=======
                string: "openclaw://agent?message=Hello%20World&deliver=1&to=%2B15551234567&channel=whatsapp&key=secret")!
        #expect(DeepLinkParser.parse(url) == agentAction(
            message: "Hello World",
            deliver: true,
            to: "+15551234567",
            channel: "whatsapp",
            key: "secret"))
    }

    @Test func parseRejectsNegativeTimeoutSeconds() {
        let url = URL(string: "openclaw://agent?message=Hello&timeoutSeconds=-1")!
        #expect(DeepLinkParser.parse(url) == agentAction(message: "Hello"))
>>>>>>> upstream/main
    }

    @Test func parseGatewayLinkParsesCommonFields() {
        let url = URL(
<<<<<<< HEAD
            string: "bot://gateway?host=bot.local&port=18789&tls=1&token=abc&password=def")!
        #expect(
            DeepLinkParser.parse(url) == .gateway(
                .init(host: "bot.local", port: 18789, tls: true, token: "abc", password: "def")))
=======
            string: "openclaw://gateway?host=openclaw.local&port=18789&tls=1&token=abc&password=def")!
        #expect(
            DeepLinkParser.parse(url) == .gateway(
                .init(host: "openclaw.local", port: 18789, tls: true, token: "abc", password: "def")))
    }

    @Test func parseGatewayLinkRejectsInsecureNonLoopbackWs() {
        let url = URL(
            string: "openclaw://gateway?host=attacker.example&port=18789&tls=0&token=abc")!
        #expect(DeepLinkParser.parse(url) == nil)
    }

    @Test func parseGatewayLinkRejectsInsecurePrefixBypassHost() {
        let url = URL(
            string: "openclaw://gateway?host=127.attacker.example&port=18789&tls=0&token=abc")!
        #expect(DeepLinkParser.parse(url) == nil)
>>>>>>> upstream/main
    }

    @Test func parseGatewaySetupCodeParsesBase64UrlPayload() {
        let payload = #"{"url":"wss://gateway.example.com:443","token":"tok","password":"pw"}"#
        let link = GatewayConnectDeepLink.fromSetupCode(setupCode(from: payload))

        #expect(link == .init(
            host: "gateway.example.com",
            port: 443,
            tls: true,
            token: "tok",
            password: "pw"))
    }

    @Test func parseGatewaySetupCodeRejectsInvalidInput() {
        #expect(GatewayConnectDeepLink.fromSetupCode("not-a-valid-setup-code") == nil)
    }

    @Test func parseGatewaySetupCodeDefaultsTo443ForWssWithoutPort() {
        let payload = #"{"url":"wss://gateway.example.com","token":"tok"}"#
        let link = GatewayConnectDeepLink.fromSetupCode(setupCode(from: payload))

        #expect(link == .init(
            host: "gateway.example.com",
            port: 443,
            tls: true,
            token: "tok",
            password: nil))
    }
<<<<<<< HEAD
=======

    @Test func parseGatewaySetupCodeRejectsInsecureNonLoopbackWs() {
        let payload = #"{"url":"ws://attacker.example:18789","token":"tok"}"#
        let link = GatewayConnectDeepLink.fromSetupCode(setupCode(from: payload))
        #expect(link == nil)
    }

    @Test func parseGatewaySetupCodeRejectsInsecurePrefixBypassHost() {
        let payload = #"{"url":"ws://127.attacker.example:18789","token":"tok"}"#
        let link = GatewayConnectDeepLink.fromSetupCode(setupCode(from: payload))
        #expect(link == nil)
    }

    @Test func parseGatewaySetupCodeAllowsLoopbackWs() {
        let payload = #"{"url":"ws://127.0.0.1:18789","token":"tok"}"#
        let link = GatewayConnectDeepLink.fromSetupCode(setupCode(from: payload))

        #expect(link == .init(
            host: "127.0.0.1",
            port: 18789,
            tls: false,
            token: "tok",
            password: nil))
    }
>>>>>>> upstream/main
}
