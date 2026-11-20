import Foundation

/// The probe's state in the integrator.
public struct ProbeState: Sendable {
    public var x: Double
    public var y: Double
    public var vx: Double
    public var vy: Double
    public var ax: Double
    public var ay: Double

    public init(x: Double, y: Double, vx: Double, vy: Double, ax: Double, ay: Double) {
        self.x = x
        self.y = y
        self.vx = vx
        self.vy = vy
        self.ax = ax
        self.ay = ay
    }
}

public enum FlightResult: String, Codable, Sendable {
    case complete, impact, lost
}

/// What the dotted predictor shows for one launch.
public struct Prediction: Sendable {
    public var points: [WorldPoint]
    public var impact: WorldPoint?
    /// Centres of the relays the path reaches, in the order it reaches them.
    public var relayHits: [WorldPoint]
    public var allRelaysPredicted: Bool
    /// Closest and farthest distance from the surface of the sector's first body.
    public var periapsis: Double
    public var apoapsis: Double
}

/// Velocity-Verlet integrator and trajectory prediction.
///
/// This is a line-for-line port of `src/physics.js`. The arithmetic is written in the same order
/// on purpose: the tests replay flights computed by the JavaScript and expect the same frame
/// counts and end positions, so a launch that wins on the web wins here.
public enum Physics {
    public static let worldW = 1200.0
    public static let worldH = 720.0
    public static let g = 85000.0
    public static let soft = 16.0
    public static let fixedDT = 1.0 / 60.0
    public static let substeps = 6
    public static let subDT = fixedDT / Double(substeps)
    public static let maxSpeed = 520.0
    public static let minSpeed = 45.0
    public static let dragGain = 2.65
    /// Maps 520 px/s to 16.64 km/s.
    public static let speedToKms = 0.032
    public static let probeRadius = 5.0
    /// Extra lock radius on top of the relay's own.
    public static let relaySlop = 9.0
    public static let predictFrames = 310
    public static let maxFlightFrames = 960
    /// Prediction stops this far off-screen.
    public static let predictMargin = 140.0
    /// A live flight is lost this far off-screen.
    public static let flightMargin = 160.0

    @inlinable
    public static func accel(x: Double, y: Double, bodies: [Body]) -> (ax: Double, ay: Double) {
        var ax = 0.0
        var ay = 0.0
        for b in bodies {
            let dx = b.x - x
            let dy = b.y - y
            let r2 = dx * dx + dy * dy + soft
            let invR = 1 / r2.squareRoot()
            let f = g * b.mass * invR * invR * invR
            ax += dx * f
            ay += dy * f
        }
        return (ax, ay)
    }

    @inlinable
    public static func step(_ p: inout ProbeState, bodies: [Body]) {
        p.x += p.vx * subDT + 0.5 * p.ax * subDT * subDT
        p.y += p.vy * subDT + 0.5 * p.ay * subDT * subDT
        let (ax2, ay2) = accel(x: p.x, y: p.y, bodies: bodies)
        p.vx += 0.5 * (p.ax + ax2) * subDT
        p.vy += 0.5 * (p.ay + ay2) * subDT
        p.ax = ax2
        p.ay = ay2
    }

    /// The body the point has hit, if any.
    @inlinable
    public static func hitBody(x: Double, y: Double, bodies: [Body]) -> Body? {
        for b in bodies {
            let dx = x - b.x
            let dy = y - b.y
            if dx * dx + dy * dy < (b.r + probeRadius) * (b.r + probeRadius) { return b }
        }
        return nil
    }

    @inlinable
    public static func touches(x: Double, y: Double, relay r: Relay) -> Bool {
        let dx = x - r.x
        let dy = y - r.y
        return dx * dx + dy * dy < (r.r + relaySlop) * (r.r + relaySlop)
    }

    public static func launchState(_ sector: Sector, vx: Double, vy: Double) -> ProbeState {
        let (ax, ay) = accel(x: sector.probe.x, y: sector.probe.y, bodies: sector.bodies)
        return ProbeState(x: sector.probe.x, y: sector.probe.y, vx: vx, vy: vy, ax: ax, ay: ay)
    }

    /// The dotted predictor: `predictFrames` frames ahead, a point every other frame.
    public static func predict(_ sector: Sector, vx: Double, vy: Double) -> Prediction {
        let bodies = sector.bodies
        let relays = sector.relays
        var sim = launchState(sector, vx: vx, vy: vy)

        var points = [WorldPoint(x: sim.x, y: sim.y)]
        points.reserveCapacity(predictFrames / 2 + 2)
        var relayHits: [WorldPoint] = []
        var hit = [Bool](repeating: false, count: relays.count)
        var impact: WorldPoint?

        // The first body anchors the Pe / Ap readout.
        let primary = bodies[0]
        var minDist = Double.infinity
        var maxDist = 0.0

        frames: for f in 0..<predictFrames {
            for _ in 0..<substeps {
                step(&sim, bodies: bodies)

                let dx = sim.x - primary.x
                let dy = sim.y - primary.y
                let dist = (dx * dx + dy * dy).squareRoot()
                if dist < minDist { minDist = dist }
                if dist > maxDist { maxDist = dist }

                if hitBody(x: sim.x, y: sim.y, bodies: bodies) != nil {
                    impact = WorldPoint(x: sim.x, y: sim.y)
                    break
                }
                for i in relays.indices where !hit[i] && touches(x: sim.x, y: sim.y, relay: relays[i]) {
                    hit[i] = true
                    relayHits.append(WorldPoint(x: relays[i].x, y: relays[i].y))
                }
            }

            if f % 2 == 0 || impact != nil { points.append(WorldPoint(x: sim.x, y: sim.y)) }
            if impact != nil { break frames }
            if sim.x < -predictMargin || sim.x > worldW + predictMargin ||
                sim.y < -predictMargin || sim.y > worldH + predictMargin { break frames }
        }

        return Prediction(
            points: points,
            impact: impact,
            relayHits: relayHits,
            allRelaysPredicted: relayHits.count == relays.count,
            periapsis: max(0, minDist - primary.r),
            apoapsis: max(0, maxDist - primary.r)
        )
    }

    /// A whole flight under the game's rules, without rendering. Used by the tests.
    public static func fly(_ sector: Sector, vx: Double, vy: Double) -> (result: FlightResult, frames: Int, end: ProbeState) {
        let bodies = sector.bodies
        let relays = sector.relays
        var p = launchState(sector, vx: vx, vy: vy)
        var locked = [Bool](repeating: false, count: relays.count)
        var lockedCount = 0
        var frames = 0

        while true {
            for _ in 0..<substeps {
                step(&p, bodies: bodies)
                if hitBody(x: p.x, y: p.y, bodies: bodies) != nil { return (.impact, frames, p) }
                for i in relays.indices where !locked[i] && touches(x: p.x, y: p.y, relay: relays[i]) {
                    locked[i] = true
                    lockedCount += 1
                    if lockedCount == relays.count { return (.complete, frames, p) }
                }
            }
            frames += 1
            if p.x < -flightMargin || p.x > worldW + flightMargin ||
                p.y < -flightMargin || p.y > worldH + flightMargin ||
                frames > maxFlightFrames { return (.lost, frames, p) }
        }
    }
}
