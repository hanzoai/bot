// swift-tools-version: 6.2
// Isolated MLX TTS helper package. Keep this out of apps/macos/Package.swift so
// normal macOS app tests do not compile the full MLX audio stack.

import PackageDescription

let package = Package(
    name: "BotMLXTTS",
    platforms: [
        .macOS(.v15),
    ],
    products: [
        .executable(name: "bot-mlx-tts", targets: ["BotMLXTTSHelper"]),
    ],
    dependencies: [
        .package(url: "https://github.com/Blaizzy/mlx-audio-swift", exact: "0.1.3"),
        .package(path: "../shared/BotMLXTTSProtocol"),
    ],
    targets: [
        .target(
            name: "BotMLXTTSRuntime",
            dependencies: [
                .product(name: "MLXAudioTTS", package: "mlx-audio-swift"),
                .product(name: "BotMLXTTSProtocol", package: "BotMLXTTSProtocol"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "BotMLXTTSHelper",
            dependencies: [
                "BotMLXTTSRuntime",
                .product(name: "BotMLXTTSProtocol", package: "BotMLXTTSProtocol"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "BotMLXTTSRuntimeTests",
            dependencies: [
                "BotMLXTTSRuntime",
                .product(name: "BotMLXTTSProtocol", package: "BotMLXTTSProtocol"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
    ])
