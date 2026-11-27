import Foundation

enum LaunchAgentManager {
    private static var plistURL: URL {
        FileManager().homeDirectoryForCurrentUser
            .appendingPathComponent("Library/LaunchAgents/ai.hanzo.bot.mac.plist")
    }

    static func status() async -> Bool {
        guard FileManager().fileExists(atPath: self.plistURL.path) else { return false }
        let disabled = await self.isDisabledInLaunchd()
        return !disabled
    }

    static func set(enabled: Bool, bundlePath: String) async {
        if enabled {
            // Write the LaunchAgent plist for future logins without calling `bootstrap`/`kickstart -k`:
            // this method is invoked from the already-running app, so bootstrapping with RunAtLoad=true
            // or kickstarting immediately spawns a duplicate menu bar instance.
            self.writePlist(bundlePath: bundlePath)
            _ = await self.runLaunchctl(["enable", "gui/\(getuid())/\(launchdLabel)"])
        } else {
            // Disable autostart going forward while leaving the current app running.
            // bootout would terminate the launchd job immediately if launched via agent.
            try? FileManager().removeItem(at: self.plistURL)
            _ = await self.runLaunchctl(["disable", "gui/\(getuid())/\(launchdLabel)"])
        }
    }

    private static func writePlist(bundlePath: String) {
        let dir = self.plistURL.deletingLastPathComponent()
        try? FileManager().createDirectory(at: dir, withIntermediateDirectories: true)
        // Intentionally omit `KeepAlive=true`: a GUI menu bar login item should launch once at
        // login (`RunAtLoad=true`) and must not be respawned in a loop by launchd when the user
        // quits or a duplicate instance exits cleanly.
        let plist = """
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
        <plist version="1.0">
        <dict>
          <key>Label</key>
          <string>ai.hanzo.bot.mac</string>
          <key>ProgramArguments</key>
          <array>
            <string>\(bundlePath)/Contents/MacOS/HanzoBot</string>
          </array>
          <key>WorkingDirectory</key>
          <string>\(FileManager().homeDirectoryForCurrentUser.path)</string>
          <key>RunAtLoad</key>
          <true/>
          <key>EnvironmentVariables</key>
          <dict>
            <key>PATH</key>
            <string>\(CommandResolver.preferredPaths().joined(separator: ":"))</string>
          </dict>
          <key>StandardOutPath</key>
          <string>\(LogLocator.launchdLogPath)</string>
          <key>StandardErrorPath</key>
          <string>\(LogLocator.launchdLogPath)</string>
        </dict>
        </plist>
        """
        try? plist.write(to: self.plistURL, atomically: true, encoding: .utf8)
    }

    private static func isDisabledInLaunchd() async -> Bool {
        await Task.detached(priority: .utility) { () -> Bool in
            let process = Process()
            process.launchPath = "/bin/launchctl"
            process.arguments = ["print-disabled", "gui/\(getuid())"]
            let pipe = Pipe()
            process.standardOutput = pipe
            process.standardError = pipe
            do {
                let data = try process.runAndReadToEnd(from: pipe)
                guard process.terminationStatus == 0,
                      let output = String(data: data, encoding: .utf8)
                else {
                    return false
                }
                let marker = "\"\(launchdLabel)\" =>"
                for line in output.split(whereSeparator: \.isNewline) where line.contains(marker) {
                    return line.contains("disabled") || line.contains("true")
                }
                return false
            } catch {
                return false
            }
        }.value
    }

    @discardableResult
    private static func runLaunchctl(_ args: [String]) async -> Int32 {
        await Task.detached(priority: .utility) { () -> Int32 in
            let process = Process()
            process.launchPath = "/bin/launchctl"
            process.arguments = args
            let pipe = Pipe()
            process.standardOutput = pipe
            process.standardError = pipe
            do {
                _ = try process.runAndReadToEnd(from: pipe)
                return process.terminationStatus
            } catch {
                return -1
            }
        }.value
    }
}
