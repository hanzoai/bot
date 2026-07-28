import Foundation
import Testing
@testable import Bot

@Suite(.serialized) struct NodeServiceManagerTests {
    @Test func `builds node service commands with current CLI shape`() async throws {
        try await TestIsolation.withUserDefaultsValues(["bot.gatewayProjectRootPath": nil]) {
            let tmp = try makeTempDirForTests()
            CommandResolver.setProjectRoot(tmp.path)

            let botPath = tmp.appendingPathComponent("node_modules/.bin/bot")
            try makeExecutableForTests(at: botPath)

            let start = NodeServiceManager._testServiceCommand(["start"])
            #expect(start == [botPath.path, "node", "start", "--json"])

            let stop = NodeServiceManager._testServiceCommand(["stop"])
            #expect(stop == [botPath.path, "node", "stop", "--json"])

            let restart = NodeServiceManager._testServiceCommand(["restart"])
            #expect(restart == [botPath.path, "node", "restart", "--json"])
        }
    }

    @Test func `reads node service ownership command directly from launchd`() throws {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("bot-node-\(UUID().uuidString).plist")
        defer { try? FileManager.default.removeItem(at: url) }
        let arguments = [
            "/Users/Test/.bot/tools/node/bin/node",
            "/Users/Test/.bot/lib/node_modules/bot/dist/index.js",
            "node",
            "run",
        ]
        let data = try PropertyListSerialization.data(
            fromPropertyList: ["ProgramArguments": arguments],
            format: .xml,
            options: 0)
        try data.write(to: url, options: .atomic)

        #expect(NodeServiceManager._testLaunchdProgramArguments(plistURL: url) == arguments)
        try Data("not a plist".utf8).write(to: url, options: .atomic)
        #expect(NodeServiceManager._testLaunchdProgramArguments(plistURL: url) == nil)
        try FileManager.default.removeItem(at: url)
        #expect(NodeServiceManager._testLaunchdProgramArguments(plistURL: url) == [])
    }

    @Test func `node status requires loaded running service`() {
        #expect(NodeServiceManager._testRuntimeIsRunning(fromJSON: """
        {"service":{"loaded":true,"runtime":{"status":"running"}}}
        """))
        #expect(!NodeServiceManager._testRuntimeIsRunning(fromJSON: """
        {"service":{"loaded":false,"runtime":{"status":"running"}}}
        """))
        #expect(!NodeServiceManager._testRuntimeIsRunning(fromJSON: """
        {"service":{"loaded":true,"runtime":{"status":"stopped"}}}
        """))
    }
}
