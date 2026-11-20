import Foundation
import Observation
import QuartzCore
import SlingshotCore

enum Phase {
    case aim, flight, complete, failed
}

enum StatusTone {
    case info, warn, lock
}

/// Colours an effect can take. Kept as a small enum so effects stay plain data.
enum FXColor {
    case cyan, rose, emerald, white
}

struct RelayState {
    var relay: Relay
    var locked = false
    var lockTime = 0.0
}

struct TrailPoint {
    var x: Double
    var y: Double
    var speed: Double
}

struct Ring {
    var x: Double
    var y: Double
    var color: FXColor
    var startR: Double
    var endR: Double
    var age = 0.0
    var duration: Double
}

struct Particle {
    var x: Double
    var y: Double
    var vx: Double
    var vy: Double
    var color: FXColor
    var size: Double
    var age = 0.0
    var life: Double
}

struct Callout {
    var x: Double
    var y: Double
    /// How far above its anchor the text floats, in world units. Applied up the screen, so
    /// callouts rise the right way even when the field is rotated.
    var lift: Double
    var text: String
    var color: FXColor
    var age = 0.0
    var life = 1.5
}

struct Star {
    var u: Double
    var v: Double
    var r: Double
    var alpha: Double
    var depth: Double
    var phase: Double
    var twinkle: Double
    var tint: Int
}

/// The live probe: integrator state plus what the HUD and trail need.
struct Probe {
    var state: ProbeState
    var speed = 0.0
    var launchSpeed = 0.0
    var peakSpeed = 0.0
    var frames = 0
    var trail: [TrailPoint] = []
    /// Every other frame of the whole flight, for the ghost track.
    var path: [WorldPoint] = []
}

/// What the "sector cleared" card shows.
struct MissionSummary: Equatable {
    var kicker: String
    var title: String
    var launches: String
    var launchDV: String
    var peak: String
    var nextLabel: String
}

/// All game state and rules. A port of the state and logic in the web game's `src/game.js`.
///
/// Properties the HUD shows are observed. Everything that changes every frame is marked
/// `@ObservationIgnored` and read straight by the canvas, so a flight does not re-render the HUD
/// sixty times a second.
@Observable
final class GameModel {
    let sectors = SectorLibrary.all

    // MARK: Observed by the HUD

    private(set) var sectorIndex = 0
    private(set) var completed: Set<Int> = []
    private(set) var launches = 0
    private(set) var showWells = true
    private(set) var phase: Phase = .aim
    private(set) var statusText = ""
    private(set) var statusTone: StatusTone = .info
    private(set) var statusVisible = false
    private(set) var dvText = "00.00 km/s"
    private(set) var azimuthText = "000.0°"
    private(set) var peApText = "-- / --"
    private(set) var peApWarns = false
    private(set) var relaysLocked = 0
    private(set) var summary: MissionSummary?
    private(set) var audioOn = false
    var mapOpen = false

    var sector: Sector { sectors[sectorIndex] }

    // MARK: Read by the canvas every frame

    @ObservationIgnored private(set) var time = 0.0
    @ObservationIgnored private(set) var hasInteracted = false
    @ObservationIgnored private(set) var isDragging = false
    @ObservationIgnored private(set) var dragOrigin = WorldPoint(x: 0, y: 0)
    @ObservationIgnored private(set) var pointer = WorldPoint(x: 0, y: 0)
    /// Pointer position across the screen, -1...1, for starfield parallax.
    @ObservationIgnored var pointerNorm = (x: 0.0, y: 0.0)
    @ObservationIgnored private(set) var aimVx = 0.0
    @ObservationIgnored private(set) var aimVy = 0.0
    @ObservationIgnored private(set) var hasAimVector = false
    @ObservationIgnored private(set) var ghostPath: [WorldPoint]?
    @ObservationIgnored private(set) var predicted: Prediction?
    @ObservationIgnored private(set) var probe = Probe(state: ProbeState(x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0))
    @ObservationIgnored private(set) var relays: [RelayState] = []
    @ObservationIgnored private(set) var rings: [Ring] = []
    @ObservationIgnored private(set) var particles: [Particle] = []
    @ObservationIgnored private(set) var callouts: [Callout] = []
    @ObservationIgnored private(set) var stars: [Star] = []
    @ObservationIgnored var reducedMotion = false

    // MARK: Private

    @ObservationIgnored private var lastLaunch: (vx: Double, vy: Double)?
    @ObservationIgnored private var statusTimer = 0.0
    @ObservationIgnored private var pendingSummary: MissionSummary?
    @ObservationIgnored private var summaryDelay = 0.0
    @ObservationIgnored private var clock: FrameClock?
    @ObservationIgnored private var accumulator = 0.0
    @ObservationIgnored private let sound = SoundEngine()
    @ObservationIgnored private let haptics = Haptics()
    @ObservationIgnored private let progress = ProgressStore()

    init() {
        makeStars()
        let saved = progress.load(sectorCount: sectors.count)
        completed = saved.cleared
        loadSector(saved.last)
    }

    // MARK: Frame loop

    /// Starts the 60 Hz simulation. Rendering is driven separately by the canvas.
    func start() {
        guard clock == nil else { return }
        clock = FrameClock { [weak self] elapsed in
            self?.advance(by: elapsed)
        }
    }

    func stop() {
        clock?.invalidate()
        clock = nil
    }

    /// Accumulated fixed timestep, as in the web game's main loop.
    private func advance(by elapsed: Double) {
        accumulator += min(0.05, elapsed)
        while accumulator >= Physics.fixedDT {
            update(Physics.fixedDT)
            accumulator -= Physics.fixedDT
        }
    }

    // MARK: Sectors

    func formatID(_ id: Int) -> String {
        let width = max(2, String(sectors.count).count)
        let text = String(id)
        return String(repeating: "0", count: max(0, width - text.count)) + text
    }

    var sectorCode: String { "SECTOR \(formatID(sector.id))/\(formatID(sectors.count))" }
    var progressText: String { "\(formatID(completed.count))/\(sectors.count) CLEARED" }

    func loadSector(_ index: Int) {
        sectorIndex = ((index % sectors.count) + sectors.count) % sectors.count
        launches = 0
        lastLaunch = nil
        ghostPath = nil
        isDragging = false
        hasAimVector = false
        aimVx = 0
        aimVy = 0
        predicted = nil
        rings = []
        particles = []
        callouts = []
        relays = sector.relays.map { RelayState(relay: $0) }
        summary = nil
        pendingSummary = nil
        resetProbeToPad()
        updateHUD()
        setStatus(sector.brief, .info, 4.0)
        progress.save(cleared: completed, last: sectorIndex)
    }

    func nextSector() {
        sound.click(520)
        loadSector(sectorIndex + 1)
    }

    func previousSector() {
        sound.click(520)
        loadSector(sectorIndex - 1)
    }

    func selectSector(_ index: Int) {
        sound.click(560)
        mapOpen = false
        loadSector(index)
    }

    func resetSector() {
        sound.click(380)
        loadSector(sectorIndex)
    }

    func toggleMap() {
        sound.click(520)
        mapOpen.toggle()
    }

    func toggleWells() {
        showWells.toggle()
        sound.click(showWells ? 620 : 420)
    }

    func toggleAudio() {
        audioOn.toggle()
        sound.setEnabled(audioOn)
    }

    // MARK: Aiming and launching

    private func resetProbeToPad() {
        let pad = sector.probe
        let a = Physics.accel(x: pad.x, y: pad.y, bodies: sector.bodies)
        probe = Probe(state: ProbeState(x: pad.x, y: pad.y, vx: 0, vy: 0, ax: a.ax, ay: a.ay))
        for i in relays.indices {
            relays[i].locked = false
            relays[i].lockTime = 0
        }
        phase = .aim
    }

    private func setAim(vx: Double, vy: Double) {
        aimVx = vx
        aimVy = vy
        predicted = Physics.predict(sector, vx: vx, vy: vy)
    }

    private func setAimFromPullback(dx: Double, dy: Double) {
        var vx = dx * Physics.dragGain
        var vy = dy * Physics.dragGain
        let mag = (vx * vx + vy * vy).squareRoot()
        if mag > Physics.maxSpeed {
            vx = vx / mag * Physics.maxSpeed
            vy = vy / mag * Physics.maxSpeed
        }
        aimVx = vx
        aimVy = vy
        hasAimVector = mag >= Physics.minSpeed * 0.5
        predicted = hasAimVector ? Physics.predict(sector, vx: vx, vy: vy) : nil
        updateHUD()
    }

    func pointerDown(_ point: WorldPoint) {
        guard phase != .complete else { return }
        hasInteracted = true
        // Touching the field during or after a flight returns to the pad and starts a new aim.
        if phase == .flight || phase == .failed { resetProbeToPad() }

        let pad = sector.probe
        let dist = ((point.x - pad.x) * (point.x - pad.x) + (point.y - pad.y) * (point.y - pad.y)).squareRoot()
        isDragging = true
        pointer = point
        // Near the probe, pull back from the probe itself. Anywhere else, pull back from where
        // the finger landed so it never covers the probe.
        if dist < 110 {
            dragOrigin = pad
            setAimFromPullback(dx: pad.x - point.x, dy: pad.y - point.y)
        } else {
            dragOrigin = point
        }
    }

    func pointerMoved(_ point: WorldPoint) {
        guard isDragging else { return }
        pointer = point
        setAimFromPullback(dx: dragOrigin.x - point.x, dy: dragOrigin.y - point.y)
    }

    func pointerUp() {
        guard isDragging else { return }
        isDragging = false
        let speed = (aimVx * aimVx + aimVy * aimVy).squareRoot()
        if speed >= Physics.minSpeed {
            launch(vx: aimVx, vy: aimVy)
        } else {
            hasAimVector = false
            predicted = nil
            updateHUD()
        }
    }

    private func launch(vx: Double, vy: Double) {
        let speed = (vx * vx + vy * vy).squareRoot()
        guard speed >= Physics.minSpeed else {
            setStatus("DELTA-V BELOW MINIMUM INSERTION THRESHOLD", .warn, 2.2)
            return
        }
        resetProbeToPad()
        launches += 1
        phase = .flight
        lastLaunch = (vx, vy)
        aimVx = vx
        aimVy = vy
        hasAimVector = true

        // The ghost track starts as the predicted path.
        let pred = Physics.predict(sector, vx: vx, vy: vy)
        ghostPath = pred.points
        predicted = pred

        let pad = sector.probe
        probe.state.vx = vx
        probe.state.vy = vy
        probe.speed = speed
        probe.launchSpeed = speed
        probe.peakSpeed = speed
        probe.trail = [TrailPoint(x: pad.x, y: pad.y, speed: speed)]
        probe.path = [pad]

        spawnRing(pad.x, pad.y, .cyan, 14, 58, 0.55)
        sound.launch(speedRatio: speed / Physics.maxSpeed)
        haptics.launch()
        setStatus("PROBE LAUNCHED // BALLISTIC TELEMETRY ACTIVE", .info, 2.4)
        updateHUD()
    }

    /// Once a flight ends, the ghost track becomes the path the probe really flew, which can run
    /// far past the predictor's range.
    private func keepFlownPath() {
        guard let ghost = ghostPath, probe.path.count > ghost.count else { return }
        ghostPath = probe.path + [WorldPoint(x: probe.state.x, y: probe.state.y)]
    }

    private func abortFlight() {
        guard phase == .flight || phase == .failed else { return }
        sound.click(300, duration: 0.05)
        keepFlownPath()
        resetProbeToPad()
        if let last = lastLaunch {
            hasAimVector = true
            setAim(vx: last.vx, vy: last.vy)
        }
        setStatus("FLIGHT ABORTED // RETURNED TO LAUNCHPAD", .info, 2.0)
        updateHUD()
    }

    /// The LAUNCH / ABORT button.
    func launchPressed() {
        if phase == .flight {
            abortFlight()
        } else if phase == .complete {
            return
        } else if hasAimVector, (aimVx * aimVx + aimVy * aimVy).squareRoot() >= Physics.minSpeed {
            launch(vx: aimVx, vy: aimVy)
        } else if let last = lastLaunch {
            launch(vx: last.vx, vy: last.vy)
        } else {
            // Nothing aimed yet: load the sector's nominal heading as a starting point.
            let rad = sector.hintAngle * .pi / 180
            hasAimVector = true
            setAim(vx: cos(rad) * sector.hintSpeed * 0.85, vy: sin(rad) * sector.hintSpeed * 0.85)
            updateHUD()
            setStatus("VECTOR LOADED // DRAG TO REFINE OR PRESS LAUNCH AGAIN", .info, 2.8)
        }
    }

    /// Fine trim, the touch equivalent of the web game's arrow keys.
    /// One step is 0.6° of azimuth or 5 px/s; a coarse step is 2.5° or 18 px/s.
    func trim(azimuthSteps: Int, speedSteps: Int, coarse: Bool = false) {
        guard phase != .complete else { return }
        hasInteracted = true
        if phase == .flight || phase == .failed { resetProbeToPad() }
        if !hasAimVector {
            let rad = sector.hintAngle * .pi / 180
            aimVx = cos(rad) * 240
            aimVy = sin(rad) * 240
            hasAimVector = true
        }
        var speed = (aimVx * aimVx + aimVy * aimVy).squareRoot()
        var angle = atan2(aimVy, aimVx)
        angle += Double(azimuthSteps) * (coarse ? 2.5 : 0.6) * .pi / 180
        speed += Double(speedSteps) * (coarse ? 18 : 5)
        speed = min(Physics.maxSpeed, max(Physics.minSpeed, speed))
        setAim(vx: cos(angle) * speed, vy: sin(angle) * speed)
        haptics.tick()
        updateHUD()
    }

    /// Space or Return on a hardware keyboard.
    func confirmPressed() {
        if phase == .complete {
            nextSector()
        } else {
            launchPressed()
        }
    }

    func replay() {
        sound.click(480)
        loadSector(sectorIndex)
    }

    func advanceFromSummary() {
        sound.click(640)
        loadSector(sectorIndex + 1)
    }

    // MARK: Status and HUD

    private func setStatus(_ text: String, _ tone: StatusTone, _ duration: Double) {
        statusText = text
        statusTone = tone
        statusVisible = true
        statusTimer = duration
    }

    private func set<T: Equatable>(_ keyPath: ReferenceWritableKeyPath<GameModel, T>, _ value: T) {
        if self[keyPath: keyPath] != value { self[keyPath: keyPath] = value }
    }

    private func updateHUD() {
        set(\.relaysLocked, relays.filter(\.locked).count)

        func readout(vx: Double, vy: Double) -> (String, String) {
            let kms = (vx * vx + vy * vy).squareRoot() * Physics.speedToKms
            var deg = (atan2(vy, vx) * 180 / .pi + 360).truncatingRemainder(dividingBy: 360)
            if deg < 0 { deg += 360 }
            let degText = String(format: "%.1f", deg)
            return (String(format: "%.2f km/s", kms), String(repeating: "0", count: max(0, 5 - degText.count)) + degText + "°")
        }

        if phase == .flight {
            let (dv, az) = readout(vx: probe.state.vx, vy: probe.state.vy)
            set(\.dvText, dv)
            set(\.azimuthText, az)
        } else if hasAimVector {
            let (dv, az) = readout(vx: aimVx, vy: aimVy)
            set(\.dvText, dv)
            set(\.azimuthText, az)
        } else {
            set(\.dvText, "00.00 km/s")
            set(\.azimuthText, "000.0°")
        }

        if let pred = predicted {
            set(\.peApText, String(format: "%.0f / %.0f Mm", pred.periapsis * 0.42, pred.apoapsis * 0.42))
            set(\.peApWarns, pred.impact != nil)
        } else {
            set(\.peApText, "-- / --")
            set(\.peApWarns, false)
        }
    }

    // MARK: Effects

    private func spawnRing(_ x: Double, _ y: Double, _ color: FXColor, _ startR: Double, _ endR: Double, _ duration: Double = 0.85) {
        if rings.count > 24 { rings.removeFirst() }
        rings.append(Ring(x: x, y: y, color: color, startR: startR, endR: endR, duration: duration))
    }

    private func spawnBurst(_ x: Double, _ y: Double, _ color: FXColor, _ count: Int = 18) {
        let cap = reducedMotion ? min(6, count) : count
        for i in 0..<cap {
            if particles.count >= 160 { particles.removeFirst() }
            let angle = 2 * Double.pi * Double(i) / Double(cap) + (Double.random(in: 0..<1) - 0.5) * 0.35
            let speed = 45 + Double.random(in: 0..<1) * 145
            particles.append(Particle(
                x: x, y: y, vx: cos(angle) * speed, vy: sin(angle) * speed, color: color,
                size: 1.6 + Double.random(in: 0..<1) * 2.1, life: 0.45 + Double.random(in: 0..<1) * 0.45
            ))
        }
    }

    private func spawnCallout(_ x: Double, _ y: Double, lift: Double, _ text: String, _ color: FXColor) {
        if callouts.count > 10 { callouts.removeFirst() }
        callouts.append(Callout(x: x, y: y, lift: lift, text: text, color: color))
    }

    private func makeStars() {
        // Same generator and seed as the web game, so the sky is the same sky.
        var seed: UInt64 = 133791
        func rand() -> Double {
            seed = (seed * 1664525 + 1013904223) % 4294967296
            return Double(seed) / 4294967296
        }
        stars = (0..<210).map { i in
            let layer = i < 120 ? 0 : i < 180 ? 1 : 2
            let u = rand()
            let v = rand()
            let r = layer == 0 ? 0.65 + rand() * 0.55 : layer == 1 ? 1.0 + rand() * 0.7 : 1.45 + rand() * 0.9
            let alpha = layer == 0 ? 0.22 + rand() * 0.3 : layer == 1 ? 0.35 + rand() * 0.35 : 0.55 + rand() * 0.4
            let depth: Double = layer == 0 ? 5 : layer == 1 ? 12 : 22
            let phase = rand() * .pi * 2
            let twinkle = 0.6 + rand() * 1.4
            let tint = Int(rand() * 5)
            return Star(u: u, v: v, r: r, alpha: alpha, depth: depth, phase: phase, twinkle: twinkle, tint: tint)
        }
    }

    // MARK: Simulation (60 Hz fixed step)

    private func update(_ dt: Double) {
        time += dt

        if statusTimer > 0 {
            statusTimer -= dt
            if statusTimer <= 0 { statusVisible = false }
        }
        if summaryDelay > 0 {
            summaryDelay -= dt
            if summaryDelay <= 0, phase == .complete { summary = pendingSummary }
        }

        for i in rings.indices { rings[i].age += dt }
        rings.removeAll { $0.age >= $0.duration }

        for i in particles.indices {
            particles[i].age += dt
            particles[i].x += particles[i].vx * dt
            particles[i].y += particles[i].vy * dt
            particles[i].vx *= 0.96
            particles[i].vy *= 0.96
        }
        particles.removeAll { $0.age >= $0.life }

        for i in callouts.indices {
            callouts[i].age += dt
            callouts[i].lift += 16 * dt
        }
        callouts.removeAll { $0.age >= $0.life }

        guard phase == .flight else { return }
        let bodies = sector.bodies

        for _ in 0..<Physics.substeps {
            Physics.step(&probe.state, bodies: bodies)
            let x = probe.state.x
            let y = probe.state.y

            if let body = Physics.hitBody(x: x, y: y, bodies: bodies) {
                phase = .failed
                keepFlownPath()
                spawnRing(x, y, .rose, 8, 68, 0.75)
                spawnBurst(x, y, .rose, 26)
                spawnCallout(x, y, lift: 16, "HULL IMPACT", .rose)
                sound.impact()
                haptics.impact()
                setStatus("SIGNAL LOST // IMPACT WITH \(body.label)", .warn, 4.0)
                return
            }

            for i in relays.indices where !relays[i].locked && Physics.touches(x: x, y: y, relay: relays[i].relay) {
                relays[i].locked = true
                relays[i].lockTime = time
                let r = relays[i].relay
                let lockedNow = relays.filter(\.locked).count
                spawnRing(r.x, r.y, .emerald, r.r * 0.6, r.r * 4.4, 0.9)
                spawnRing(r.x, r.y, .white, r.r * 0.4, r.r * 2.5, 0.55)
                spawnBurst(r.x, r.y, .emerald, 24)
                spawnCallout(r.x, r.y, lift: r.r + 10, "RELAY LOCKED", .emerald)
                sound.relayLock(index: lockedNow - 1)
                haptics.relayLock()
                setStatus("RELAY LOCKED (\(lockedNow)/\(relays.count)) // SIGNAL CONFIRMED", .lock, 2.4)
                if lockedNow == relays.count {
                    completeSector()
                    return
                }
            }
        }

        probe.frames += 1
        let vx = probe.state.vx
        let vy = probe.state.vy
        probe.speed = (vx * vx + vy * vy).squareRoot()
        if probe.speed > probe.peakSpeed { probe.peakSpeed = probe.speed }

        probe.trail.append(TrailPoint(x: probe.state.x, y: probe.state.y, speed: probe.speed))
        if probe.trail.count > 92 { probe.trail.removeFirst() }
        if probe.frames % 2 == 0 { probe.path.append(WorldPoint(x: probe.state.x, y: probe.state.y)) }

        // Sparks when the probe has picked up speed in a well.
        if !reducedMotion, probe.speed > probe.launchSpeed * 1.25, probe.frames % 3 == 0, particles.count < 150 {
            particles.append(Particle(
                x: probe.state.x, y: probe.state.y,
                vx: -vx * 0.12 + (Double.random(in: 0..<1) - 0.5) * 28,
                vy: -vy * 0.12 + (Double.random(in: 0..<1) - 0.5) * 28,
                color: .cyan, size: 1.5, life: 0.35
            ))
        }

        let m = Physics.flightMargin
        if probe.state.x < -m || probe.state.x > Physics.worldW + m ||
            probe.state.y < -m || probe.state.y > Physics.worldH + m ||
            probe.frames > Physics.maxFlightFrames {
            phase = .failed
            keepFlownPath()
            haptics.lost()
            setStatus("SIGNAL LOST // PROBE DRIFTED BEYOND RELAY RANGE", .warn, 3.5)
            return
        }

        updateHUD()
    }

    private func completeSector() {
        phase = .complete
        completed.insert(sectorIndex)
        progress.save(cleared: completed, last: sectorIndex)
        updateHUD()
        sound.sectorComplete()
        haptics.sectorComplete()

        let isFinal = sectorIndex == sectors.count - 1
        let allCleared = completed.count == sectors.count
        pendingSummary = MissionSummary(
            kicker: allCleared ? "DEEP SPACE NETWORK ONLINE // ALL SECTORS LOCKED" : "RELAY LOCKED // ORBITAL INSERTION CONFIRMED",
            title: isFinal && allCleared ? "GRAND TOUR COMPLETE" : "SECTOR \(formatID(sector.id)) CLEARED",
            launches: launches < 10 ? "0\(launches)" : "\(launches)",
            launchDV: String(format: "%.2f km/s", probe.launchSpeed * Physics.speedToKms),
            peak: String(format: "%.2f km/s", probe.peakSpeed * Physics.speedToKms),
            nextLabel: isFinal ? "SECTOR \(formatID(1)) →" : "NEXT SECTOR →"
        )
        summaryDelay = 0.52
    }
}

/// Calls back once per display refresh with the time since the previous one.
private final class FrameClock: NSObject {
    private var link: CADisplayLink?
    private var last: CFTimeInterval = 0
    private let onFrame: (Double) -> Void

    init(onFrame: @escaping (Double) -> Void) {
        self.onFrame = onFrame
        super.init()
        let link = CADisplayLink(target: self, selector: #selector(tick))
        link.add(to: .main, forMode: .common)
        self.link = link
    }

    @objc private func tick(_ link: CADisplayLink) {
        let elapsed = last == 0 ? 0 : link.timestamp - last
        last = link.timestamp
        onFrame(elapsed)
    }

    func invalidate() {
        link?.invalidate()
        link = nil
    }
}
