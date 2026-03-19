// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "Hanzo BotKit",
    platforms: [
        .iOS(.v18),
        .macOS(.v15),
    ],
    products: [
        .library(name: "Hanzo BotProtocol", targets: ["Hanzo BotProtocol"]),
        .library(name: "Hanzo BotKit", targets: ["Hanzo BotKit"]),
        .library(name: "Hanzo BotChatUI", targets: ["Hanzo BotChatUI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/steipete/ElevenLabsKit", exact: "0.1.0"),
        .package(url: "https://github.com/gonzalezreal/textual", exact: "0.3.1"),
    ],
    targets: [
        .target(
            name: "Hanzo BotProtocol",
            path: "Sources/Hanzo BotProtocol",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "Hanzo BotKit",
            dependencies: [
                "Hanzo BotProtocol",
                .product(name: "ElevenLabsKit", package: "ElevenLabsKit"),
            ],
            path: "Sources/Hanzo BotKit",
            resources: [
                .process("Resources"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "Hanzo BotChatUI",
            dependencies: [
                "Hanzo BotKit",
                .product(
                    name: "Textual",
                    package: "textual",
                    condition: .when(platforms: [.macOS, .iOS])),
            ],
            path: "Sources/Hanzo BotChatUI",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "Hanzo BotKitTests",
            dependencies: ["Hanzo BotKit", "Hanzo BotChatUI"],
            path: "Tests/Hanzo BotKitTests",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
                .enableExperimentalFeature("SwiftTesting"),
            ]),
    ])
