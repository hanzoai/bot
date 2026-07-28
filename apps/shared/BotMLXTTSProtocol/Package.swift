// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "BotMLXTTSProtocol",
    platforms: [
        .macOS(.v15),
    ],
    products: [
        .library(name: "BotMLXTTSProtocol", targets: ["BotMLXTTSProtocol"]),
    ],
    targets: [
        .target(name: "BotMLXTTSProtocol"),
        .testTarget(
            name: "BotMLXTTSProtocolTests",
            dependencies: ["BotMLXTTSProtocol"]),
    ])
