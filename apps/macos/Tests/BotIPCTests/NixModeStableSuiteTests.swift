import Foundation
import Testing
@testable import Bot

@Suite(.serialized)
struct NixModeStableSuiteTests {
    @Test func `resolves from stable suite for app bundles`() throws {
        let suite = try #require(UserDefaults(suiteName: launchdLabel))
        let key = "bot.nixMode"
        let prev = suite.object(forKey: key)
        defer {
            if let prev { suite.set(prev, forKey: key) } else { suite.removeObject(forKey: key) }
        }

        suite.set(true, forKey: key)

        let standard = try #require(UserDefaults(suiteName: "NixModeStableSuiteTests.\(UUID().uuidString)"))
        #expect(!standard.bool(forKey: key))

        let resolved = ProcessInfo.resolveNixMode(
            environment: [:],
            standard: standard,
            stableSuite: suite,
            isAppBundle: true)
        #expect(resolved)
    }

    @Test func `detects SwiftPM and XCTest runners`() {
        #expect(ProcessInfo.resolveIsRunningTests(
            environment: [:],
            processName: "swiftpm-testing-helper",
            arguments: [],
            bundleURLs: []))
        #expect(ProcessInfo.resolveIsRunningTests(
            environment: [:],
            processName: "swiftpm-xctest-helper",
            arguments: [],
            bundleURLs: []))
        for helper in ["swiftpm-testing-helper", "swiftpm-xctest-helper"] {
            #expect(ProcessInfo.resolveIsRunningTests(
                environment: [:],
                processName: "BotTests",
                arguments: ["/Library/Developer/Toolchains/usr/libexec/swift/pm/\(helper)"],
                bundleURLs: []))
        }
        #expect(ProcessInfo.resolveIsRunningTests(
            environment: ["XCTestSessionIdentifier": "session"],
            processName: "BotTests",
            arguments: [],
            bundleURLs: []))
        #expect(ProcessInfo.resolveIsRunningTests(
            environment: [:],
            processName: "BotTests",
            arguments: [],
            bundleURLs: [URL(fileURLWithPath: "/tmp/BotTests.xctest")]))
        #expect(!ProcessInfo.resolveIsRunningTests(
            environment: [:],
            processName: "Bot",
            arguments: [],
            bundleURLs: []))
    }

    @Test func `ignores stable suite outside app bundles`() throws {
        let suite = try #require(UserDefaults(suiteName: launchdLabel))
        let key = "bot.nixMode"
        let prev = suite.object(forKey: key)
        defer {
            if let prev { suite.set(prev, forKey: key) } else { suite.removeObject(forKey: key) }
        }

        suite.set(true, forKey: key)
        let standard = try #require(UserDefaults(suiteName: "NixModeStableSuiteTests.\(UUID().uuidString)"))

        let resolved = ProcessInfo.resolveNixMode(
            environment: [:],
            standard: standard,
            stableSuite: suite,
            isAppBundle: false)
        #expect(!resolved)
    }
}
