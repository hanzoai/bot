import Foundation
import Testing
@testable import HanzoBot

@Suite(.serialized)
struct BotConfigFileTests {
    @Test
    func configPathRespectsEnvOverride() async {
        let override = FileManager().temporaryDirectory
            .appendingPathComponent("hanzo-bot-config-\(UUID().uuidString)")
            .appendingPathComponent("bot.json")
            .path

        await TestIsolation.withEnvValues(["BOT_CONFIG_PATH": override]) {
            #expect(BotConfigFile.url().path == override)
        }
    }

    @MainActor
    @Test
    func remoteGatewayPortParsesAndMatchesHost() async {
        let override = FileManager().temporaryDirectory
            .appendingPathComponent("hanzo-bot-config-\(UUID().uuidString)")
            .appendingPathComponent("bot.json")
            .path

        await TestIsolation.withEnvValues(["BOT_CONFIG_PATH": override]) {
            BotConfigFile.saveDict([
                "gateway": [
                    "remote": [
                        "url": "ws://gateway.ts.net:19999",
                    ],
                ],
            ])
            #expect(BotConfigFile.remoteGatewayPort() == 19999)
            #expect(BotConfigFile.remoteGatewayPort(matchingHost: "gateway.ts.net") == 19999)
            #expect(BotConfigFile.remoteGatewayPort(matchingHost: "gateway") == 19999)
            #expect(BotConfigFile.remoteGatewayPort(matchingHost: "other.ts.net") == nil)
        }
    }

    @MainActor
    @Test
    func setRemoteGatewayUrlPreservesScheme() async {
        let override = FileManager().temporaryDirectory
            .appendingPathComponent("hanzo-bot-config-\(UUID().uuidString)")
            .appendingPathComponent("bot.json")
            .path

        await TestIsolation.withEnvValues(["BOT_CONFIG_PATH": override]) {
            BotConfigFile.saveDict([
                "gateway": [
                    "remote": [
                        "url": "wss://old-host:111",
                    ],
                ],
            ])
            BotConfigFile.setRemoteGatewayUrl(host: "new-host", port: 2222)
            let root = BotConfigFile.loadDict()
            let url = ((root["gateway"] as? [String: Any])?["remote"] as? [String: Any])?["url"] as? String
            #expect(url == "wss://new-host:2222")
        }
    }

    @Test
    func stateDirOverrideSetsConfigPath() async {
        let dir = FileManager().temporaryDirectory
            .appendingPathComponent("hanzo-bot-state-\(UUID().uuidString)", isDirectory: true)
            .path

        await TestIsolation.withEnvValues([
            "BOT_CONFIG_PATH": nil,
            "BOT_STATE_DIR": dir,
        ]) {
            #expect(BotConfigFile.stateDirURL().path == dir)
            #expect(BotConfigFile.url().path == "\(dir)/hanzo-bot.json")
        }
    }
}
