import Foundation
import Testing
@testable import Bot

@Suite(.serialized)
@MainActor
struct CLIInstallerTests {
    @Test func `installed location finds executable`() throws {
        let fm = FileManager()
        let root = fm.temporaryDirectory.appendingPathComponent(
            "bot-cli-installer-\(UUID().uuidString)")
        defer { try? fm.removeItem(at: root) }

        let binDir = root.appendingPathComponent("bin")
        try fm.createDirectory(at: binDir, withIntermediateDirectories: true)
        let cli = binDir.appendingPathComponent("bot")
        fm.createFile(atPath: cli.path, contents: Data())
        try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: cli.path)

        let found = CLIInstaller.installedLocation(
            searchPaths: [binDir.path],
            fileManager: fm)
        #expect(found == cli.path)

        try fm.removeItem(at: cli)
        fm.createFile(atPath: cli.path, contents: Data())
        try fm.setAttributes([.posixPermissions: 0o644], ofItemAtPath: cli.path)

        let missing = CLIInstaller.installedLocation(
            searchPaths: [binDir.path],
            fileManager: fm)
        #expect(missing == nil)
    }

    @Test func `installer command runs the signed bundled script without a shell pipeline`() {
        let command = CLIInstaller.installScriptCommand(
            target: .exact("2026.7.3-beta.1"),
            prefix: "/Users/Test User/.bot",
            scriptPath: "/Applications/Bot.app/Contents/Resources/install-cli.sh")

        #expect(command == [
            "/bin/bash",
            "/Applications/Bot.app/Contents/Resources/install-cli.sh",
            "--json",
            "--no-onboard",
            "--prefix",
            "/Users/Test User/.bot",
            "--version",
            "2026.7.3-beta.1",
        ])
        #expect(!command.contains("curl"))
    }

    @Test func `dev installer uses a managed git main checkout`() {
        let command = CLIInstaller.installScriptCommand(
            target: .channel(.dev),
            prefix: "/Users/Test User/.bot",
            scriptPath: "/Applications/Bot.app/Contents/Resources/install-cli.sh")

        #expect(command.suffix(6) == [
            "--version",
            "main",
            "--install-method",
            "git",
            "--git-dir",
            "/Users/Test User/.bot/dev/bot",
        ])
    }

    @Test func `managed update uses the canonical updater without accepting downgrades`() {
        let command = CLIInstaller.managedUpdateCommand(
            executable: "/Users/Test User/.bot/bin/bot",
            targetVersion: "2026.7.4")

        #expect(command == [
            "/Users/Test User/.bot/bin/bot",
            "update",
            "--tag",
            "2026.7.4",
            "--json",
            "--timeout",
            "900",
        ])
        #expect(!command.contains("--yes"))

        let withoutRestart = CLIInstaller.managedUpdateCommand(
            executable: "/Users/Test User/.bot/bin/bot",
            targetVersion: "2026.7.4",
            restartGateway: false)
        #expect(withoutRestart == command + ["--no-restart"])

        let repair = CLIInstaller.managedUpdateCommand(
            executable: "/Users/Test User/.bot/bin/bot",
            targetVersion: "2026.7.4",
            restartGateway: false,
            repair: true)
        #expect(repair == [
            "/Users/Test User/.bot/bin/bot",
            "update",
            "repair",
            "--json",
            "--timeout",
            "900",
            "--yes",
            "--no-restart",
        ])
    }

    @Test func `managed update parses structured updater diagnostics`() throws {
        let summary = try #require(CLIInstaller.parseManagedUpdateSummary("""
        {
          "status": "error",
          "mode": "npm",
          "reason": "package-update-failed",
          "before": { "version": "2026.7.3" },
          "after": { "version": "2026.7.3" },
          "steps": [
            { "name": "package update", "exitCode": 1, "stderrTail": "registry unavailable" }
          ],
          "durationMs": 42
        }
        """))

        #expect(summary.status == "error")
        #expect(summary.reason == "package-update-failed")
        #expect(summary.before?.version == "2026.7.3")
        #expect(summary.steps?.first?.name == "package update")
        #expect(summary.steps?.first?.stderrTail == "registry unavailable")
    }

    @Test func `release builds install exact while unreleased builds choose a channel`() {
        #expect(CLIInstaller.automaticInstallTarget(
            appVersion: "2026.7.2",
            isDebug: false) == .exact("2026.7.2"))
        #expect(CLIInstaller.automaticInstallTarget(
            appVersion: "2026.7.2-1",
            isDebug: false) == .exact("2026.7.2-1"))
        #expect(CLIInstaller.automaticInstallTarget(
            appVersion: "2026.7.2-beta.1",
            isDebug: false) == nil)
        #expect(CLIInstaller.automaticInstallTarget(
            appVersion: "2026.7.2",
            isDebug: true) == nil)
        #expect(CLIInstaller.suggestedChannel(
            appVersion: "2026.7.2-beta.1",
            isDebug: false) == .beta)
        #expect(CLIInstaller.suggestedChannel(
            appVersion: "2026.7.2",
            isDebug: true) == .dev)
    }

    @Test func `channel policy accepts the selected channel version`() throws {
        let suite = "CLIInstallerTests.channel-policy.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }

        #expect(CLIInstallPolicy.storedPolicy(defaults: defaults) == nil)
        #expect(CLIInstallPolicy.requiredGatewayVersionString(
            appVersion: "2026.7.2",
            isDebug: true,
            defaults: defaults) == "2026.7.2")
        defaults.set("beta", forKey: cliInstallPolicyKey)
        #expect(CLIInstallPolicy.storedPolicy(defaults: defaults) == "beta")
        #expect(CLIInstallPolicy.requiredGatewayVersionString(
            appVersion: "2026.7.2",
            isDebug: true,
            defaults: defaults) == nil)
        #expect(CLIInstallPolicy.requiredGatewayVersionString(
            appVersion: "2026.7.2-beta.1",
            isDebug: false,
            defaults: defaults) == nil)
        #expect(CLIInstallPolicy.requiredGatewayVersionString(
            appVersion: "2026.7.2",
            isDebug: false,
            defaults: defaults) == "2026.7.2")
    }

    @Test func `managed setup requires a parseable compatible version`() {
        let location = "/Users/test/.bot/bin/bot"

        #expect(CLIInstaller.classifyVersion(
            location: location,
            output: "Bot 2026.7.3\n",
            expectedVersion: "2026.7.3") == .ready(location: location, version: "2026.7.3"))
        #expect(CLIInstaller.classifyVersion(
            location: location,
            output: "Bot\n",
            expectedVersion: "2026.7.3") == .unusable(location: location))
        #expect(CLIInstaller.classifyVersion(
            location: location,
            output: "2026.6.1\n",
            expectedVersion: "2026.7.3") == .incompatible(
            location: location,
            found: "2026.6.1",
            required: "2026.7.3"))
        #expect(CLIInstaller.classifyVersion(
            location: location,
            output: "2026.7.3-beta.1\n",
            expectedVersion: "2026.7.3-beta.2") == .incompatible(
            location: location,
            found: "2026.7.3-beta.1",
            required: "2026.7.3-beta.2"))
        #expect(CLIInstaller.classifyVersion(
            location: location,
            output: "2026.7.3-beta.2\n",
            expectedVersion: "2026.7.3") == .incompatible(
            location: location,
            found: "2026.7.3-beta.2",
            required: "2026.7.3"))
        #expect(CLIInstaller.classifyVersion(
            location: location,
            output: "2026.7.3\n",
            expectedVersion: "2026.7.3-beta.2") == .incompatible(
            location: location,
            found: "2026.7.3",
            required: "2026.7.3-beta.2"))
        #expect(CLIInstaller.classifyVersion(
            location: location,
            output: "2026.7.3-alpha.1\n",
            expectedVersion: "2026.7.3") == .incompatible(
            location: location,
            found: "2026.7.3-alpha.1",
            required: "2026.7.3"))
    }

    @Test func `compatible external CLI satisfies setup`() async throws {
        let root = FileManager().temporaryDirectory.appendingPathComponent(
            "bot-compatible-cli-\(UUID().uuidString)")
        defer { try? FileManager().removeItem(at: root) }
        try FileManager().createDirectory(at: root, withIntermediateDirectories: true)
        let executable = root.appendingPathComponent("bot")
        try "#!/bin/sh\necho 'Bot 2026.7.3'\n".write(
            to: executable,
            atomically: true,
            encoding: .utf8)
        try FileManager().setAttributes([.posixPermissions: 0o755], ofItemAtPath: executable.path)

        let status = await CLIInstaller.status(location: executable.path)

        #expect(status == .ready(location: executable.path, version: "2026.7.3"))
    }

    @Test func `matching external CLI with unsupported Node is unusable`() async throws {
        let root = FileManager().temporaryDirectory.appendingPathComponent(
            "bot-old-node-cli-\(UUID().uuidString)")
        defer { try? FileManager().removeItem(at: root) }
        try FileManager().createDirectory(at: root, withIntermediateDirectories: true)
        let executable = root.appendingPathComponent("bot")
        let node = root.appendingPathComponent("node")
        try "#!/bin/sh\necho 'Bot 2026.7.3'\n".write(
            to: executable,
            atomically: true,
            encoding: .utf8)
        try "#!/bin/sh\necho 'v20.18.0'\n".write(
            to: node,
            atomically: true,
            encoding: .utf8)
        try FileManager().setAttributes([.posixPermissions: 0o755], ofItemAtPath: executable.path)
        try FileManager().setAttributes([.posixPermissions: 0o755], ofItemAtPath: node.path)

        let status = await CLIInstaller.status(location: executable.path)

        #expect(status == .unusable(location: executable.path))
    }

    @Test func `CLI probe preserves environment and resolves shebang tools beside executable`() {
        let location = "/custom/bin/bot"
        let environment = CLIInstaller.probeEnvironment(
            location: location,
            processEnvironment: ["HOME": "/Users/test", "PATH": "/usr/bin"],
            preferredPaths: ["/opt/homebrew/bin", "/usr/bin"])

        #expect(environment["HOME"] == "/Users/test")
        #expect(environment["PATH"] == "/custom/bin:/opt/homebrew/bin:/usr/bin")
    }

    @Test func `managed CLI probe prefers its private runtime`() {
        let executable = "/Users/test/.bot/bin/bot"
        let environment = CLIInstaller.probeEnvironment(
            location: executable,
            processEnvironment: [:],
            preferredPaths: ["/Users/test/.nvm/versions/node/v20/bin", "/usr/bin"],
            managedExecutable: executable,
            managedRuntimeDirectory: "/Users/test/.bot/tools/node/bin")

        #expect(environment["PATH"] == [
            "/Users/test/.bot/bin",
            "/Users/test/.bot/tools/node/bin",
            "/Users/test/.nvm/versions/node/v20/bin",
            "/usr/bin",
        ].joined(separator: ":"))
    }

    @Test func `successful CLI setup starts the local gateway and waits for readiness`() async {
        var didStart = false
        var didWait = false

        let activation = await CLIInstaller.activateLocalGateway(
            mode: .local,
            paused: false,
            start: { didStart = true },
            waitUntilReady: {
                didWait = true
                return true
            })

        #expect(didStart)
        #expect(didWait)
        #expect(activation == .ready)
    }

    @Test func `paused CLI setup defers gateway activation`() async {
        var didStart = false
        var didWait = false

        let activation = await CLIInstaller.activateLocalGateway(
            mode: .local,
            paused: true,
            start: { didStart = true },
            waitUntilReady: {
                didWait = true
                return true
            })

        #expect(!didStart)
        #expect(!didWait)
        #expect(activation == .deferred)
    }
}
