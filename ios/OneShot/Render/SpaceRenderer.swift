import SwiftUI
import SlingshotCore

/// Draws one frame of the game. A port of the Canvas 2D rendering in the web game's
/// `src/game.js`, in the same order and with the same colours.
///
/// Shapes are drawn in world coordinates through `world`, which carries the field transform.
/// Text is drawn through `screen` so it stays upright and readable when the field is rotated or
/// scaled down on a phone.
struct SpaceRenderer {
    let model: GameModel
    let layout: FieldLayout
    let size: CGSize
    var screen: GraphicsContext
    var world: GraphicsContext

    private var scale: Double { layout.scale }
    private var still: Bool { model.reducedMotion }

    init(model: GameModel, layout: FieldLayout, size: CGSize, context: GraphicsContext) {
        self.model = model
        self.layout = layout
        self.size = size
        self.screen = context
        var world = context
        world.concatenate(layout.transform)
        self.world = world
    }

    // MARK: Helpers

    /// Line width in world units, never thinner than about two thirds of a point on screen.
    private func lw(_ width: Double) -> CGFloat { max(width, 0.65 / scale) }

    private func circle(_ x: Double, _ y: Double, _ r: Double) -> Path {
        Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2))
    }

    /// An arc in the Canvas 2D sense: from `a0` to `a1` in the direction of increasing angle.
    private func arc(_ x: Double, _ y: Double, _ r: Double, _ a0: Double, _ a1: Double) -> Path {
        var path = Path()
        path.addArc(center: CGPoint(x: x, y: y), radius: r, startAngle: .radians(a0), endAngle: .radians(a1), clockwise: false)
        return path
    }

    private func segment(_ x0: Double, _ y0: Double, _ x1: Double, _ y1: Double) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: x0, y: y0))
        path.addLine(to: CGPoint(x: x1, y: y1))
        return path
    }

    private func radial(_ stops: [(Double, Color)], _ x: Double, _ y: Double, _ r0: Double, _ r1: Double) -> GraphicsContext.Shading {
        .radialGradient(
            Gradient(stops: stops.map { Gradient.Stop(color: $0.1, location: $0.0) }),
            center: CGPoint(x: x, y: y), startRadius: r0, endRadius: r1
        )
    }

    private func fxColor(_ color: FXColor) -> Color {
        switch color {
        case .cyan: return Theme.cyan
        case .rose: return Theme.rose
        case .emerald: return Theme.emerald
        case .white: return Theme.white
        }
    }

    /// Text at a world position, drawn upright in screen space. `size` is the web game's pixel
    /// size; it scales with the field but never below a readable minimum. `dx` and `dy` are
    /// offsets in world units, applied on screen (so "below" is always down the screen).
    private func label(
        _ string: String, _ x: Double, _ y: Double, dx: Double = 0, dy: Double = 0,
        size: Double, bold: Bool = false, color: Color, anchor: UnitPoint = .center, opacity: Double = 1
    ) {
        let fontSize = max(size * scale, 7)
        let at = layout.toView(x, y)
        let text = Text(string).font(Theme.mono(fontSize, bold: bold)).foregroundColor(color.opacity(opacity))
        screen.draw(text, at: CGPoint(x: at.x + dx * scale, y: at.y + dy * scale), anchor: anchor)
    }

    /// Text just below a round thing, clear of its edge at any scale.
    private func caption(_ string: String, under x: Double, _ y: Double, radius: Double, gap: Double, size: Double, color: Color) {
        let fontSize = max(size * scale, 7)
        let at = layout.toView(x, y)
        let text = Text(string).font(Theme.mono(fontSize)).foregroundColor(color)
        screen.draw(text, at: CGPoint(x: at.x, y: at.y + radius * scale + max(gap * scale, 3) + fontSize * 0.5), anchor: .center)
    }

    // MARK: Frame

    func draw() {
        drawBackground()
        drawStars()
        drawCoordinateGrid()

        let sector = model.sector
        if model.showWells { drawGravityWells(sector.bodies) }
        if let ghost = model.ghostPath, ghost.count > 1, model.phase == .aim { drawGhostPath(ghost) }
        if let pred = model.predicted, model.phase == .aim {
            drawPredictedTrajectory(pred)
        } else if !model.hasInteracted, model.phase == .aim {
            drawIdleHint(sector)
        }
        drawLaunchpad(sector.probe)
        for relay in model.relays { drawRelayBeacon(relay) }
        for body in sector.bodies { drawBody(body, all: sector.bodies) }
        if model.phase == .aim, model.hasAimVector { drawAimVector(sector.probe) }
        if model.phase == .flight || model.phase == .complete { drawProbeTrail(model.probe.trail) }
        if model.phase != .failed { drawProbe() }
        drawEffects()
        drawVignette()
    }

    // MARK: Sky

    private func drawBackground() {
        let w = size.width
        let h = size.height
        screen.fill(
            Path(CGRect(origin: .zero, size: size)),
            with: radial([(0, Color(hex: 0x0E1729)), (0.58, Color(hex: 0x09101E)), (1, Color(hex: 0x070B14))],
                         w * 0.5, h * 0.5, 30, max(w, h) * 0.78)
        )
    }

    private static let starTints: [Color] = [
        Color(hex: 0xF7FAFC), Color(hex: 0xE0F2FE), Color(hex: 0xFEF3C7), Color(hex: 0xC7D2FE), Color(hex: 0xBAE6FD)
    ]

    private func drawStars() {
        let w = size.width
        let h = size.height
        let px = still ? 0 : model.pointerNorm.x
        let py = still ? 0 : model.pointerNorm.y
        let t = model.time
        for s in model.stars {
            var sx = (s.u * w - px * s.depth).truncatingRemainder(dividingBy: w)
            var sy = (s.v * h - py * s.depth).truncatingRemainder(dividingBy: h)
            if sx < 0 { sx += w }
            if sy < 0 { sy += h }
            let twinkle = still ? 1 : 0.78 + 0.22 * sin(t * s.twinkle + s.phase)
            screen.fill(circle(sx, sy, s.r), with: .color(Self.starTints[s.tint % 5].opacity(s.alpha * twinkle)))
        }
    }

    private func drawCoordinateGrid() {
        guard 120 * scale >= 24 else { return }
        var lines = Path()
        var wx = 0.0
        while wx <= Physics.worldW {
            lines.move(to: CGPoint(x: wx, y: 0))
            lines.addLine(to: CGPoint(x: wx, y: Physics.worldH))
            wx += 120
        }
        var wy = 0.0
        while wy <= Physics.worldH {
            lines.move(to: CGPoint(x: 0, y: wy))
            lines.addLine(to: CGPoint(x: Physics.worldW, y: wy))
            wy += 120
        }
        world.stroke(lines, with: .color(.rgba(56, 189, 248, 0.045)), lineWidth: 1 / scale)

        // Corner calibration brackets
        let b = 14 / scale
        let w = Physics.worldW
        let h = Physics.worldH
        var brackets = Path()
        brackets.move(to: CGPoint(x: 0, y: b)); brackets.addLine(to: .zero); brackets.addLine(to: CGPoint(x: b, y: 0))
        brackets.move(to: CGPoint(x: w - b, y: 0)); brackets.addLine(to: CGPoint(x: w, y: 0)); brackets.addLine(to: CGPoint(x: w, y: b))
        brackets.move(to: CGPoint(x: 0, y: h - b)); brackets.addLine(to: CGPoint(x: 0, y: h)); brackets.addLine(to: CGPoint(x: b, y: h))
        brackets.move(to: CGPoint(x: w - b, y: h)); brackets.addLine(to: CGPoint(x: w, y: h)); brackets.addLine(to: CGPoint(x: w, y: h - b))
        world.stroke(brackets, with: .color(.rgba(56, 189, 248, 0.22)), lineWidth: 1 / scale)
    }

    private func drawVignette() {
        let w = size.width
        let h = size.height
        screen.fill(
            Path(CGRect(origin: .zero, size: size)),
            with: radial([(0, .clear), (0.55, .clear), (1, .rgba(4, 7, 14, 0.58))], w * 0.5, h * 0.5, 0, max(w, h) * 0.72)
        )
    }

    // MARK: Gravity wells

    private func wellRGB(_ body: Body) -> (Double, Double, Double) {
        switch body.type {
        case .star: return (245, 158, 11)
        case .hazard: return (244, 63, 94)
        case .planet: return (56, 189, 248)
        case .repulsor: return (232, 121, 249)
        case .giant: return (99, 102, 241)
        }
    }

    private func drawGravityWells(_ bodies: [Body]) {
        let pulse = still ? 0 : sin(model.time * 1.4) * 2.5
        for b in bodies {
            let (r, g, bl) = wellRGB(b)
            let maxR = abs(b.mass).squareRoot() * 19.5
            let rings = 5

            // Faint potential-field fill
            world.fill(
                circle(b.x, b.y, maxR),
                with: radial([(0, .rgba(r, g, bl, 0.13)), (0.5, .rgba(r, g, bl, 0.045)), (1, .rgba(r, g, bl, 0))], b.x, b.y, b.r, maxR)
            )

            // Contour rings. A repulsor's field is a hill, not a well: every contour is broken.
            for k in 1...rings {
                let frac = Double(k) / Double(rings)
                let radius = b.r + (maxR - b.r) * (frac * frac * 0.55 + frac * 0.45) + pulse * frac
                let dash: [CGFloat] = b.type == .repulsor ? [2, 5] : k % 2 == 0 ? [4, 6] : []
                world.stroke(
                    circle(b.x, b.y, radius),
                    with: .color(.rgba(r, g, bl, 0.28 * (1 - frac * 0.72))),
                    style: StrokeStyle(lineWidth: lw(k == 1 ? 1.15 : 0.9), dash: dash)
                )
            }

            let mu = String(format: "%.2f", abs(b.mass) / 100)
            caption("\(b.label) · μ\(b.mass < 0 ? "−" : "")\(mu)", under: b.x, b.y, radius: b.r, gap: 11, size: 9.5, color: .rgba(r, g, bl, 0.72))
        }
    }

    // MARK: Bodies

    private func drawBody(_ b: Body, all: [Body]) {
        if b.ring == true { drawPlanetaryRing(b, backHalf: true) }

        switch b.type {
        case .star:
            let shimmer = still ? 1 : 0.94 + 0.06 * sin(model.time * 2.8 + b.x)
            world.fill(
                circle(b.x, b.y, b.r * 2.6 * shimmer),
                with: radial([(0, .rgba(254, 243, 199, 0.92)), (0.28, .rgba(245, 158, 11, 0.55)), (0.6, .rgba(245, 158, 11, 0.14)), (1, .rgba(245, 158, 11, 0))],
                             b.x, b.y, b.r * 0.7, b.r * 2.6 * shimmer)
            )
            world.fill(
                circle(b.x, b.y, b.r),
                with: radial([(0, Color(hex: 0xFFFBEB)), (0.45, Color(hex: 0xFCD34D)), (0.88, Color(hex: 0xF59E0B)), (1, Color(hex: 0xD97706))],
                             b.x - b.r * 0.2, b.y - b.r * 0.2, b.r * 0.1, b.r * 1.25)
            )

        case .hazard:
            // Singularity: black core, rose photon ring, rotating accretion ticks.
            world.fill(
                circle(b.x, b.y, b.r * 2.5),
                with: radial([(0, .rgba(244, 63, 94, 0.65)), (0.42, .rgba(244, 63, 94, 0.18)), (1, .rgba(244, 63, 94, 0))], b.x, b.y, b.r * 0.85, b.r * 2.5)
            )
            world.fill(circle(b.x, b.y, b.r), with: .color(Color(hex: 0x05070D)))
            world.stroke(circle(b.x, b.y, b.r), with: .color(Theme.rose), lineWidth: lw(2.2))
            let rot = still ? 0 : model.time * 1.3
            let ticks = Color.rgba(244, 63, 94, 0.65)
            world.stroke(arc(b.x, b.y, b.r + 7, rot, rot + .pi * 0.65), with: .color(ticks), lineWidth: lw(1.2))
            world.stroke(arc(b.x, b.y, b.r + 7, rot + .pi, rot + .pi * 1.65), with: .color(ticks), lineWidth: lw(1.2))

        case .repulsor:
            // Exotic-matter node: it pushes. Pale core, fuchsia halo, rings travelling outward.
            world.fill(
                circle(b.x, b.y, b.r * 2.4),
                with: radial([(0, .rgba(232, 121, 249, 0.5)), (0.45, .rgba(232, 121, 249, 0.14)), (1, .rgba(232, 121, 249, 0))], b.x, b.y, b.r * 0.5, b.r * 2.4)
            )
            for k in 0..<2 {
                let phase = still ? 0.35 + Double(k) * 0.4 : (model.time * 0.55 + Double(k) * 0.5).truncatingRemainder(dividingBy: 1)
                world.stroke(circle(b.x, b.y, b.r + phase * b.r * 1.35), with: .color(.rgba(232, 121, 249, (1 - phase) * 0.55)), lineWidth: lw(1.2))
            }
            world.fill(
                circle(b.x, b.y, b.r),
                with: radial([(0, Color(hex: 0xFDF4FF)), (0.35, Color(hex: 0xF5D0FE)), (0.8, Color(hex: 0xC026D3)), (1, Color(hex: 0x701A75))], b.x, b.y, 0, b.r)
            )
            world.stroke(circle(b.x, b.y, b.r), with: .color(Theme.fuchsia), lineWidth: lw(1.8))
            // Four outward chevrons: the direction of the push
            var chevrons = Path()
            for k in 0..<4 {
                let a = .pi / 2 * Double(k) + .pi / 4
                let cx = cos(a)
                let cy = sin(a)
                let tip = b.r * 0.72
                let back = b.r * 0.4
                let wing = b.r * 0.24
                chevrons.move(to: CGPoint(x: b.x + cx * back - cy * wing, y: b.y + cy * back + cx * wing))
                chevrons.addLine(to: CGPoint(x: b.x + cx * tip, y: b.y + cy * tip))
                chevrons.addLine(to: CGPoint(x: b.x + cx * back + cy * wing, y: b.y + cy * back - cx * wing))
            }
            world.stroke(chevrons, with: .color(.rgba(253, 244, 255, 0.85)), lineWidth: lw(1.4))

        case .giant, .planet:
            // Lit from the first star in the sector, if there is one.
            var lx = -0.5
            var ly = -0.5
            if let star = all.first(where: { $0.type == .star }) {
                let dx = star.x - b.x
                let dy = star.y - b.y
                let d = max((dx * dx + dy * dy).squareRoot(), 1)
                lx = dx / d
                ly = dy / d
            }
            let planet = b.type == .planet
            // Atmospheric glow
            let glow: Color = planet ? .rgba(56, 189, 248, 0.35) : .rgba(99, 102, 241, 0.4)
            world.fill(circle(b.x, b.y, b.r + 16), with: radial([(0, glow), (1, glow.opacity(0))], b.x, b.y, b.r * 0.9, b.r + 16))

            let stops: [(Double, Color)] = planet
                ? [(0, Color(hex: 0xBAE6FD)), (0.5, Color(hex: 0x38BDF8)), (0.85, Color(hex: 0x1E3A8A)), (1, Color(hex: 0x0B1120))]
                : [(0, Color(hex: 0xA5B4FC)), (0.45, Color(hex: 0x6366F1)), (0.85, Color(hex: 0x312E81)), (1, Color(hex: 0x0F172A))]
            world.fill(circle(b.x, b.y, b.r), with: radial(stops, b.x + lx * b.r * 0.45, b.y + ly * b.r * 0.45, b.r * 0.12, b.r * 1.5))
            world.stroke(circle(b.x, b.y, b.r), with: .color(planet ? .rgba(186, 230, 253, 0.38) : .rgba(165, 180, 252, 0.35)), lineWidth: lw(1.1))
        }

        if b.ring == true { drawPlanetaryRing(b, backHalf: false) }
    }

    private func drawPlanetaryRing(_ b: Body, backHalf: Bool) {
        let a0 = backHalf ? Double.pi : 0
        let a1 = backHalf ? Double.pi * 2 : Double.pi
        let place = CGAffineTransform(translationX: b.x, y: b.y).rotated(by: b.tilt ?? -0.28)
        let inner = arc(0, 0, 1, a0, a1).applying(place.scaledBy(x: b.r * 1.78, y: b.r * 0.44))
        let outer = arc(0, 0, 1, a0, a1).applying(place.scaledBy(x: b.r * 2.02, y: b.r * 0.5))
        world.stroke(inner, with: .color(.rgba(165, 180, 252, 0.38)), lineWidth: 4.5)
        world.stroke(outer, with: .color(.rgba(99, 102, 241, 0.25)), lineWidth: 2)
    }

    // MARK: Launchpad and relays

    private func drawLaunchpad(_ pad: WorldPoint) {
        let t = model.time
        let rot = still ? 0 : t * 0.35
        world.stroke(
            arc(pad.x, pad.y, 34, rot, rot + .pi * 2),
            with: .color(.rgba(56, 189, 248, 0.26)),
            style: StrokeStyle(lineWidth: lw(1.2), dash: [4, 6])
        )
        var ticks = Path()
        for i in 0..<12 {
            let a = .pi * 2 * Double(i) / 12
            let r0: Double = i % 3 == 0 ? 22 : 25
            ticks.move(to: CGPoint(x: pad.x + cos(a) * r0, y: pad.y + sin(a) * r0))
            ticks.addLine(to: CGPoint(x: pad.x + cos(a) * 29, y: pad.y + sin(a) * 29))
        }
        world.stroke(ticks, with: .color(.rgba(247, 250, 252, 0.28)), lineWidth: lw(1))

        // Standby pulse while waiting for an aim
        if model.phase == .aim, !model.isDragging, !still {
            let p = (t * 0.8).truncatingRemainder(dividingBy: 1)
            world.stroke(circle(pad.x, pad.y, 14 + p * 32), with: .color(.rgba(56, 189, 248, (1 - p) * 0.45)), lineWidth: lw(1.2))
        }
        caption("LAUNCHPAD", under: pad.x, pad.y, radius: 34, gap: 7, size: 9, color: .rgba(56, 189, 248, 0.72))
    }

    private func drawRelayBeacon(_ state: RelayState) {
        let r = state.relay
        let t = model.time
        let rot = still ? 0 : t * (state.locked ? 0.4 : 1.1)

        let glowR = state.locked ? r.r * 2.5 : r.r * 2.0
        world.fill(
            circle(r.x, r.y, glowR),
            with: radial([(0, .rgba(16, 185, 129, state.locked ? 0.55 : 0.34)), (1, .rgba(16, 185, 129, 0))], r.x, r.y, 3, glowR)
        )

        if !state.locked, !still {
            let ping = (t * 0.65 + r.x * 0.01).truncatingRemainder(dividingBy: 1)
            world.stroke(circle(r.x, r.y, r.r * 0.7 + ping * r.r * 1.4), with: .color(.rgba(16, 185, 129, (1 - ping) * 0.45)), lineWidth: lw(1.1))
        }

        // Rotating bracket arcs
        var brackets = Path()
        for k in 0..<4 {
            let a0 = .pi * 0.5 * Double(k) + 0.28 + rot
            brackets.addPath(arc(r.x, r.y, r.r, a0, a0 + 0.96))
        }
        world.stroke(brackets, with: .color(state.locked ? Theme.emerald : .rgba(16, 185, 129, 0.85)), lineWidth: lw(state.locked ? 2.1 : 1.5))

        // Transponder diamond
        let s = state.locked ? 8.5 : 6.5
        var diamond = Path()
        diamond.move(to: CGPoint(x: r.x, y: r.y - s * 1.414))
        diamond.addLine(to: CGPoint(x: r.x + s * 1.414, y: r.y))
        diamond.addLine(to: CGPoint(x: r.x, y: r.y + s * 1.414))
        diamond.addLine(to: CGPoint(x: r.x - s * 1.414, y: r.y))
        diamond.closeSubpath()
        world.fill(diamond, with: .color(state.locked ? Theme.emerald : .rgba(16, 185, 129, 0.22)))
        world.stroke(diamond, with: .color(state.locked ? Theme.white : Theme.emerald), lineWidth: lw(1.5))
        world.fill(circle(r.x, r.y, 2.3), with: .color(Theme.white))

        caption(state.locked ? "LOCKED" : r.code, under: r.x, r.y, radius: r.r, gap: 8, size: 9,
                color: state.locked ? Theme.emerald : .rgba(16, 185, 129, 0.8))
    }

    // MARK: Paths

    private func polyline(_ points: [WorldPoint]) -> Path {
        var path = Path()
        guard let first = points.first else { return path }
        path.move(to: CGPoint(x: first.x, y: first.y))
        for p in points.dropFirst() { path.addLine(to: CGPoint(x: p.x, y: p.y)) }
        return path
    }

    private func drawGhostPath(_ points: [WorldPoint]) {
        world.stroke(polyline(points), with: .color(.rgba(247, 250, 252, 0.14)), style: StrokeStyle(lineWidth: lw(1.25), dash: [4, 7]))
    }

    private func drawPredictedTrajectory(_ pred: Prediction) {
        let pts = pred.points
        guard pts.count >= 2 else { return }
        let total = pts.count
        // Dots swell a little on small screens so the path stays easy to follow.
        let grow = max(1, 0.6 / scale)

        for i in 1..<total {
            let t = Double(i) / Double(total)
            let alpha = max(0.08, (1 - t * 0.84) * 0.92)
            let color: Color = pred.impact != nil && t > 0.82
                ? .rgba(244, 63, 94, alpha)
                : pred.allRelaysPredicted ? .rgba(16, 185, 129, alpha) : .rgba(56, 189, 248, alpha)
            world.fill(circle(pts[i].x, pts[i].y, max(1.2, 2.5 - t * 1.1) * grow), with: .color(color))
        }

        world.stroke(
            polyline(pts),
            with: .color(pred.allRelaysPredicted ? .rgba(16, 185, 129, 0.28) : .rgba(56, 189, 248, 0.2)),
            lineWidth: lw(1.1)
        )

        for hit in pred.relayHits {
            world.stroke(circle(hit.x, hit.y, 29), with: .color(Theme.emerald), lineWidth: lw(1.8))
        }

        if let imp = pred.impact {
            let sz = 6.5 * grow
            var cross = Path()
            cross.move(to: CGPoint(x: imp.x - sz, y: imp.y - sz)); cross.addLine(to: CGPoint(x: imp.x + sz, y: imp.y + sz))
            cross.move(to: CGPoint(x: imp.x + sz, y: imp.y - sz)); cross.addLine(to: CGPoint(x: imp.x - sz, y: imp.y + sz))
            world.stroke(cross, with: .color(Theme.rose), lineWidth: lw(2))
            label("IMPACT", imp.x, imp.y, dx: 10 * grow, size: 9, bold: true, color: Theme.rose, anchor: .leading)
        }
    }

    private func drawIdleHint(_ sector: Sector) {
        // An animated pull-back cue before the first interaction
        let p = sector.probe
        let phase = still ? 0.5 : (sin(model.time * 2.2) + 1) * 0.5
        let rad = sector.hintAngle * .pi / 180
        let pull = 36 + phase * 34
        let bx = p.x - cos(rad) * pull
        let by = p.y - sin(rad) * pull
        world.stroke(segment(p.x, p.y, bx, by), with: .color(.rgba(56, 189, 248, 0.34)), style: StrokeStyle(lineWidth: lw(1.2), dash: [4, 4]))
        world.fill(circle(bx, by, 4), with: .color(.rgba(56, 189, 248, 0.55)))
        let fontSize = max(10 * scale, 7)
        let at = layout.toView(p.x, p.y)
        screen.draw(
            Text("DRAG BACK TO AIM").font(Theme.mono(fontSize)).foregroundColor(.rgba(247, 250, 252, 0.72)),
            at: CGPoint(x: at.x, y: at.y - 40 * scale - fontSize * 0.5), anchor: .center
        )
    }

    private func drawAimVector(_ pad: WorldPoint) {
        let vx = model.aimVx
        let vy = model.aimVy
        let speed = (vx * vx + vy * vy).squareRoot()
        guard speed >= 8 else { return }

        let len = min(165, speed * 0.32)
        let ang = atan2(vy, vx)
        let ex = pad.x + cos(ang) * len
        let ey = pad.y + sin(ang) * len

        // Pull-back tether while dragging
        if model.isDragging {
            world.stroke(
                segment(model.dragOrigin.x, model.dragOrigin.y, model.pointer.x, model.pointer.y),
                with: .color(.rgba(247, 250, 252, 0.22)), style: StrokeStyle(lineWidth: lw(1), dash: [3, 4])
            )
            world.fill(circle(model.pointer.x, model.pointer.y, 4), with: .color(.rgba(56, 189, 248, 0.5)))
        }

        let color = model.predicted?.allRelaysPredicted == true ? Theme.emerald : Theme.cyan
        world.stroke(segment(pad.x, pad.y, ex, ey), with: .color(color), lineWidth: lw(2.2))

        let head = 10.0
        var arrow = Path()
        arrow.move(to: CGPoint(x: ex, y: ey))
        arrow.addLine(to: CGPoint(x: ex - cos(ang - 0.38) * head, y: ey - sin(ang - 0.38) * head))
        arrow.addLine(to: CGPoint(x: ex - cos(ang + 0.38) * head, y: ey - sin(ang + 0.38) * head))
        arrow.closeSubpath()
        world.fill(arrow, with: .color(color))

        var deg = (ang * 180 / .pi + 360).truncatingRemainder(dividingBy: 360)
        if deg < 0 { deg += 360 }
        label(String(format: "%.2f km/s · %.1f°", speed * Physics.speedToKms, deg), ex, ey, dx: 10, dy: -10,
              size: 10, color: Theme.white, anchor: .leading)
    }

    // MARK: Probe

    private func drawProbeTrail(_ trail: [TrailPoint]) {
        guard trail.count >= 2 else { return }
        let count = Double(trail.count)
        for i in 1..<trail.count {
            let p0 = trail[i - 1]
            let p1 = trail[i]
            let t = Double(i) / count
            let boost = min(1, max(0, (p1.speed - model.probe.launchSpeed) / 180))
            let path = segment(p0.x, p0.y, p1.x, p1.y)
            // Cyan plasma sheath, then a white-hot core
            world.stroke(
                path,
                with: .color(boost > 0.35 ? .rgba(125, 211, 252, t * 0.72) : .rgba(56, 189, 248, t * 0.62)),
                style: StrokeStyle(lineWidth: 1.2 + t * 5.2, lineCap: .round, lineJoin: .round)
            )
            world.stroke(
                path,
                with: .color(.rgba(247, 250, 252, t * 0.85)),
                style: StrokeStyle(lineWidth: 0.6 + t * 1.8, lineCap: .round, lineJoin: .round)
            )
        }
    }

    private func drawProbe() {
        let p = model.probe.state
        var ang = 0.0
        if model.phase == .flight || model.phase == .complete {
            ang = atan2(p.vy, p.vx)
        } else if model.hasAimVector {
            ang = atan2(model.aimVy, model.aimVx)
        }
        // The probe is drawn a little larger on small screens so it never becomes a speck.
        let grow = max(1, 0.55 / scale)
        let place = CGAffineTransform(translationX: p.x, y: p.y).rotated(by: ang).scaledBy(x: grow, y: grow)

        world.fill(
            circle(p.x, p.y, 14 * grow),
            with: radial([(0, .rgba(247, 250, 252, 0.85)), (0.45, .rgba(56, 189, 248, 0.42)), (1, .rgba(56, 189, 248, 0))], p.x, p.y, 1, 14 * grow)
        )

        var hull = Path()
        hull.move(to: CGPoint(x: 8.5, y: 0))
        hull.addLine(to: CGPoint(x: -5.5, y: -5.2))
        hull.addLine(to: CGPoint(x: -3.2, y: 0))
        hull.addLine(to: CGPoint(x: -5.5, y: 5.2))
        hull.closeSubpath()
        world.fill(hull.applying(place), with: .color(Theme.white))
        world.stroke(segment(-2, -6.5, -2, 6.5).applying(place), with: .color(Theme.cyan), lineWidth: lw(1.3))
    }

    // MARK: Effects

    private func drawEffects() {
        for r in model.rings {
            let t = min(1, r.age / r.duration)
            let ease = 1 - pow(1 - t, 3)
            let radius = r.startR + (r.endR - r.startR) * ease
            world.stroke(circle(r.x, r.y, radius), with: .color(fxColor(r.color).opacity((1 - t) * 0.9)), lineWidth: lw(2.2 * (1 - t * 0.65)))
        }
        let grow = max(1, 0.6 / scale)
        for p in model.particles {
            let t = min(1, p.age / p.life)
            let s = p.size * grow
            world.fill(Path(CGRect(x: p.x - s * 0.5, y: p.y - s * 0.5, width: s, height: s)), with: .color(fxColor(p.color).opacity(1 - t)))
        }
        for c in model.callouts {
            let t = min(1, c.age / c.life)
            let alpha = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8
            label(c.text, c.x, c.y, dy: -c.lift, size: 10.5, bold: true, color: fxColor(c.color), opacity: alpha)
        }
    }
}
