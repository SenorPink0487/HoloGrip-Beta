// swift-tools-version:5.5
import Foundation
import PackageDescription

// Cargo supplies the API path from the exact Tauri dependency being linked.
guard let tauriPath = ProcessInfo.processInfo.environment["DEP_TAURI_IOS_LIBRARY_PATH"] else {
    fatalError("Build this package through Cargo: missing DEP_TAURI_IOS_LIBRARY_PATH")
}

let package = Package(
    name: "HoloGripAppleVision",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "HoloGripAppleVision", type: .static, targets: ["HoloGripAppleVision"])
    ],
    dependencies: [.package(name: "Tauri", path: tauriPath)],
    targets: [
        .target(
            name: "HoloGripAppleVision",
            dependencies: [.byName(name: "Tauri")],
            path: ".",
            sources: ["AppleVisionHandManager.swift", "AppleVisionPlugin.swift"],
            linkerSettings: [
                .linkedFramework("AVFoundation"),
                .linkedFramework("Vision"),
                .linkedFramework("CoreMedia"),
                .linkedFramework("CoreVideo"),
                .linkedFramework("WebKit")
            ]
        )
    ]
)
