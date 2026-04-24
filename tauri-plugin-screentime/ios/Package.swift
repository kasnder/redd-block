// swift-tools-version:5.7
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "tauri-plugin-screentime",
    platforms: [
        .iOS(.v16),
        .macOS(.v14),
    ],
    products: [
        .library(
            name: "tauri-plugin-screentime",
            type: .static,
            targets: ["tauri-plugin-screentime"]),
    ],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api")
    ],
    targets: [
        .target(
            name: "tauri-plugin-screentime",
            dependencies: [
                .byName(name: "Tauri")
            ],
            path: "Sources")
    ]
)
