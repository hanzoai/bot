// swift-tools-version: 6.2
<<<<<<< HEAD
// Package manifest for the HanzoBot macOS companion (menu bar app + IPC library).
=======
// Package manifest for the OpenClaw macOS companion (menu bar app + IPC library).
>>>>>>> upstream/main

import PackageDescription

let package = Package(
<<<<<<< HEAD
    name: "HanzoBot",
=======
    name: "OpenClaw",
>>>>>>> upstream/main
    platforms: [
        .macOS(.v15),
    ],
    products: [
<<<<<<< HEAD
        .library(name: "BotIPC", targets: ["BotIPC"]),
        .library(name: "BotDiscovery", targets: ["BotDiscovery"]),
        .executable(name: "HanzoBot", targets: ["HanzoBot"]),
        .executable(name: "hanzo-bot-mac", targets: ["BotMacCLI"]),
=======
        .library(name: "OpenClawIPC", targets: ["OpenClawIPC"]),
        .library(name: "OpenClawDiscovery", targets: ["OpenClawDiscovery"]),
        .executable(name: "OpenClaw", targets: ["OpenClaw"]),
        .executable(name: "openclaw-mac", targets: ["OpenClawMacCLI"]),
>>>>>>> upstream/main
    ],
    dependencies: [
        .package(url: "https://github.com/orchetect/MenuBarExtraAccess", exact: "1.2.2"),
        .package(url: "https://github.com/swiftlang/swift-subprocess.git", from: "0.1.0"),
        .package(url: "https://github.com/apple/swift-log.git", from: "1.8.0"),
        .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.8.1"),
        .package(url: "https://github.com/steipete/Peekaboo.git", branch: "main"),
<<<<<<< HEAD
        .package(path: "../shared/BotKit"),
=======
        .package(path: "../shared/OpenClawKit"),
>>>>>>> upstream/main
        .package(path: "../../Swabble"),
    ],
    targets: [
        .target(
<<<<<<< HEAD
            name: "BotIPC",
=======
            name: "OpenClawIPC",
>>>>>>> upstream/main
            dependencies: [],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
<<<<<<< HEAD
            name: "BotDiscovery",
            dependencies: [
                .product(name: "BotKit", package: "BotKit"),
            ],
            path: "Sources/BotDiscovery",
=======
            name: "OpenClawDiscovery",
            dependencies: [
                .product(name: "OpenClawKit", package: "OpenClawKit"),
            ],
            path: "Sources/OpenClawDiscovery",
>>>>>>> upstream/main
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
<<<<<<< HEAD
            name: "HanzoBot",
            dependencies: [
                "BotIPC",
                "BotDiscovery",
                .product(name: "BotKit", package: "BotKit"),
                .product(name: "BotChatUI", package: "BotKit"),
                .product(name: "HanzoBotProtocol", package: "BotKit"),
=======
            name: "OpenClaw",
            dependencies: [
                "OpenClawIPC",
                "OpenClawDiscovery",
                .product(name: "OpenClawKit", package: "OpenClawKit"),
                .product(name: "OpenClawChatUI", package: "OpenClawKit"),
                .product(name: "OpenClawProtocol", package: "OpenClawKit"),
>>>>>>> upstream/main
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
<<<<<<< HEAD
                .copy("Resources/HanzoBot.icns"),
=======
                .copy("Resources/OpenClaw.icns"),
>>>>>>> upstream/main
                .copy("Resources/DeviceModels"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
<<<<<<< HEAD
            name: "BotMacCLI",
            dependencies: [
                "BotDiscovery",
                .product(name: "BotKit", package: "BotKit"),
                .product(name: "HanzoBotProtocol", package: "BotKit"),
            ],
            path: "Sources/BotMacCLI",
=======
            name: "OpenClawMacCLI",
            dependencies: [
                "OpenClawDiscovery",
                .product(name: "OpenClawKit", package: "OpenClawKit"),
                .product(name: "OpenClawProtocol", package: "OpenClawKit"),
            ],
            path: "Sources/OpenClawMacCLI",
>>>>>>> upstream/main
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
<<<<<<< HEAD
            name: "BotIPCTests",
            dependencies: [
                "BotIPC",
                "HanzoBot",
                "BotDiscovery",
                .product(name: "HanzoBotProtocol", package: "BotKit"),
=======
            name: "OpenClawIPCTests",
            dependencies: [
                "OpenClawIPC",
                "OpenClaw",
                "OpenClawDiscovery",
                .product(name: "OpenClawProtocol", package: "OpenClawKit"),
>>>>>>> upstream/main
                .product(name: "SwabbleKit", package: "swabble"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
                .enableExperimentalFeature("SwiftTesting"),
            ]),
    ])
