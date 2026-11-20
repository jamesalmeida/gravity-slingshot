import Foundation

/// A point in world space. The world is 1200 x 720, origin top left, y down.
public struct WorldPoint: Codable, Hashable, Sendable {
    public var x: Double
    public var y: Double

    public init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }
}

/// A body with gravity. Repulsors have negative mass.
public struct Body: Codable, Hashable, Sendable {
    public enum Kind: String, Codable, Sendable {
        case star, giant, planet, hazard, repulsor
    }

    public var x: Double
    public var y: Double
    public var r: Double
    public var mass: Double
    public var type: Kind
    public var ring: Bool?
    public var tilt: Double?
    public var label: String
    /// True for a body the route never swings by (sectors 061 onwards). Not shown to the player.
    public var decoy: Bool?
}

/// A relay beacon. The probe locks it by passing within `r` plus `Physics.relaySlop`.
public struct Relay: Codable, Hashable, Sendable {
    public var x: Double
    public var y: Double
    public var r: Double
    public var code: String
}

/// A launch: screen azimuth in degrees (0 = right, 90 = down) and speed in px/s.
public struct Launch: Codable, Hashable, Sendable {
    public var angle: Double
    public var speed: Double

    public var velocity: (vx: Double, vy: Double) {
        let rad = angle * .pi / 180
        return (cos(rad) * speed, sin(rad) * speed)
    }
}

public struct Sector: Codable, Identifiable, Hashable, Sendable {
    public var id: Int
    public var name: String
    public var arc: String
    public var brief: String
    public var probe: WorldPoint
    /// Where the aim starts if the player presses LAUNCH or a trim button before dragging.
    public var hintAngle: Double
    public var hintSpeed: Double
    /// One launch known to clear the sector.
    public var solution: Launch
    public var bodies: [Body]
    public var relays: [Relay]
}

public enum SectorLibrary {
    /// All sectors in play order. The data is exported from the web game by `npm run export:ios`,
    /// so both versions always have the same sectors.
    public static let all: [Sector] = {
        guard let url = Bundle.module.url(forResource: "sectors", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let sectors = try? JSONDecoder().decode([Sector].self, from: data) else {
            fatalError("sectors.json is missing or unreadable. Run `npm run export:ios`.")
        }
        return sectors
    }()

    /// Arcs in play order, each with the index range of its sectors.
    public static let arcs: [(name: String, range: Range<Int>)] = {
        var arcs: [(name: String, range: Range<Int>)] = []
        var start = 0
        for index in all.indices where index == all.count - 1 || all[index + 1].arc != all[index].arc {
            arcs.append((all[index].arc, start..<(index + 1)))
            start = index + 1
        }
        return arcs
    }()
}
