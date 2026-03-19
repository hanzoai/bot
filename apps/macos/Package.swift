// swift-tools-version: 6.2
// Package manifest for the Hanzo Bot macOS companion (menu bar app + IPC library).

import PackageDescription

let package = Package(
    name: "Hanzo Bot",
    platforms: [
        .macOS(.v15),
    ],
    products: [
        .library(name: "Hanzo BotIPC", targets: ["Hanzo BotIPC"]),
        .library(name: "Hanzo BotDiscovery", targets: ["Hanzo BotDiscovery"]),
        .executable(name: "Hanzo Bot", targets: ["Hanzo Bot"]),
        .executable(name: "openclaw-mac", targets: ["Hanzo BotMacCLI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/orchetect/MenuBarExtraAccess", exact: "1.2.2"),
        .package(url: "https://github.com/swiftlang/swift-subprocess.git", from: "0.1.0"),
        .package(url: "https://github.com/apple/swift-log.git", from: "1.8.0"),
        .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.8.1"),
        .package(url: "https://github.com/steipete/Peekaboo.git", branch: "main"),
        .package(path: "../shared/Hanzo BotKit"),
        .package(path: "../../Swabble"),
    ],
    targets: [
        .target(
            name: "Hanzo BotIPC",
            dependencies: [],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "Hanzo BotDiscovery",
            dependencies: [
                .product(name: "Hanzo BotKit", package: "Hanzo BotKit"),
            ],
            path: "Sources/Hanzo BotDiscovery",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "Hanzo Bot",
            dependencies: [
                "Hanzo BotIPC",
                "Hanzo BotDiscovery",
                .product(name: "Hanzo BotKit", package: "Hanzo BotKit"),
                .product(name: "Hanzo BotChatUI", package: "Hanzo BotKit"),
                .product(name: "Hanzo BotProtocol", package: "Hanzo BotKit"),
                .product(name: "SwabbleKit", package: "swabble"),
                .product(name: "MenuBarExtraAccess", package: "MenuBarExtraAccess"),
                .product(name: "Subprocess", package: "swift-subprocess"),
                .product(name: "Logging", package: "swift-log"),
                .product(name: "Sparkle", package: "Sparkle"),
                .product(name: "PeekabooBridge", package: "Peekaboo"),
                .product(name: "PeekabooAutomationKit", package: "Peekaboo"),
            ],
            exclude: [
                "Resources/Info.plist",
            ],
            resources: [
                .copy("Resources/Hanzo Bot.icns"),
                .copy("Resources/DeviceModels"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "Hanzo BotMacCLI",
            dependencies: [
                "Hanzo BotDiscovery",
                .product(name: "Hanzo BotKit", package: "Hanzo BotKit"),
                .product(name: "Hanzo BotProtocol", package: "Hanzo BotKit"),
            ],
            path: "Sources/Hanzo BotMacCLI",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "Hanzo BotIPCTests",
            dependencies: [
                "Hanzo BotIPC",
                "Hanzo Bot",
                "Hanzo BotDiscovery",
                .product(name: "Hanzo BotProtocol", package: "Hanzo BotKit"),
                .product(name: "SwabbleKit", package: "swabble"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
                .enableExperimentalFeature("SwiftTesting"),
            ]),
    ])
