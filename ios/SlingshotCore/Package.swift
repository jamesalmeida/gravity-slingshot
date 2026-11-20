// swift-tools-version: 5.9
import PackageDescription

// The game's rules with no UI: physics, sector data and flight analysis.
// Kept as a package so `swift test` can check it on a Mac without a simulator.
let package = Package(
    name: "SlingshotCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "SlingshotCore", targets: ["SlingshotCore"])
    ],
    targets: [
        .target(
            name: "SlingshotCore",
            resources: [.process("Resources")]
        ),
        .testTarget(
            name: "SlingshotCoreTests",
            dependencies: ["SlingshotCore"],
            resources: [.process("Fixtures")]
        )
    ]
)
