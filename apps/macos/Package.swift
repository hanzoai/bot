// swift-tools-version: 6.2
// Package manifest for the Bot macOS companion (menu bar app + IPC library).

import PackageDescription

let package = Package(
    name: "Bot",
    platforms: [
        .macOS(.v15),
    ],
    products: [
        .library(name: "BotIPC", targets: ["BotIPC"]),
        .library(name: "BotDiscovery", targets: ["BotDiscovery"]),
        .executable(name: "Bot", targets: ["Bot"]),
        .executable(name: "hanzo-bot-mac", targets: ["BotMacCLI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/orchetect/MenuBarExtraAccess", exact: "1.2.2"),
        .package(url: "https://github.com/swiftlang/swift-subprocess.git", from: "0.1.0"),
        .package(url: "https://github.com/apple/swift-log.git", from: "1.8.0"),
        .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.8.1"),
        .package(url: "https://github.com/steipete/Peekaboo.git", branch: "main"),
        .package(path: "../shared/BotKit"),
        .package(path: "../../Swabble"),
    ],
    targets: [
        .target(
            name: "BotIPC",
            dependencies: [],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "BotDiscovery",
            dependencies: [
                .product(name: "BotKit", package: "BotKit"),
            ],
            path: "Sources/BotDiscovery",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "Bot",
            dependencies: [
                "BotIPC",
                "BotDiscovery",
                .product(name: "BotKit", package: "BotKit"),
                .product(name: "BotChatUI", package: "BotKit"),
                .product(name: "BotProtocol", package: "BotKit"),
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
                .copy("Resources/Bot.icns"),
                .copy("Resources/DeviceModels"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "BotMacCLI",
            dependencies: [
                "BotDiscovery",
                .product(name: "BotKit", package: "BotKit"),
                .product(name: "BotProtocol", package: "BotKit"),
            ],
            path: "Sources/BotMacCLI",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "BotIPCTests",
            dependencies: [
                "BotIPC",
                "Bot",
                "BotDiscovery",
                .product(name: "BotProtocol", package: "BotKit"),
                .product(name: "SwabbleKit", package: "swabble"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
                .enableExperimentalFeature("SwiftTesting"),
            ]),
    ])
