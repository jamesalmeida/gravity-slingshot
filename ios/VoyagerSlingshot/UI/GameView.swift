import SwiftUI
import SlingshotCore

/// The whole game screen: the playfield canvas, the HUD around it, and the overlays.
struct GameView: View {
    @State private var model = GameModel()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @FocusState private var keyboardFocus: Bool

    var body: some View {
        // The reader stays inside the safe area so it can report the insets; the content then
        // spreads over the whole window and works in window coordinates.
        GeometryReader { geo in
            let insets = geo.safeAreaInsets
            let window = CGSize(
                width: geo.size.width + insets.leading + insets.trailing,
                height: geo.size.height + insets.top + insets.bottom
            )
            let layout = FieldLayout.best(size: window, insets: insets)
            ZStack {
                SpaceCanvas(model: model, layout: layout)
                HUDView(model: model, layout: layout)
                if let summary = model.summary {
                    MissionCard(summary: summary, replay: model.replay, next: model.advanceFromSummary)
                        .frame(maxWidth: min(400, layout.safe.width - 24))
                        .position(x: layout.safe.midX, y: layout.safe.midY)
                        .transition(.scale(scale: 0.97).combined(with: .opacity))
                }
                if model.mapOpen {
                    SectorMapView(model: model, safe: layout.safe)
                        .transition(.opacity)
                }
            }
            .animation(.easeOut(duration: 0.24), value: model.summary)
            .animation(.easeOut(duration: 0.18), value: model.mapOpen)
            .frame(width: window.width, height: window.height)
            .ignoresSafeArea()
        }
        .background(Theme.obsidian.ignoresSafeArea())
        .focusable()
        .focusEffectDisabled()
        .focused($keyboardFocus)
        .onKeyPress(phases: [.down, .repeat]) { press in handleKey(press) }
        .onAppear {
            model.reducedMotion = reduceMotion
            model.start()
            keyboardFocus = true
        }
        .onChange(of: reduceMotion) { _, value in model.reducedMotion = value }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { model.start() } else { model.stop() }
        }
    }

    /// Hardware keyboard, with the same keys as the web game.
    private func handleKey(_ press: KeyPress) -> KeyPress.Result {
        if press.key == .escape, model.mapOpen {
            model.mapOpen = false
            return .handled
        }
        if press.characters.lowercased() == "m" {
            model.toggleMap()
            return .handled
        }
        if model.mapOpen { return .ignored }

        let coarse = press.modifiers.contains(.shift)
        switch press.key {
        case .leftArrow: model.trim(azimuthSteps: -1, speedSteps: 0, coarse: coarse)
        case .rightArrow: model.trim(azimuthSteps: 1, speedSteps: 0, coarse: coarse)
        case .upArrow: model.trim(azimuthSteps: 0, speedSteps: 1, coarse: coarse)
        case .downArrow: model.trim(azimuthSteps: 0, speedSteps: -1, coarse: coarse)
        case .space, .return: model.confirmPressed()
        default:
            switch press.characters.lowercased() {
            case "r": model.resetSector()
            case "g": model.toggleWells()
            case "[": model.previousSector()
            case "]": model.nextSector()
            default: return .ignored
            }
        }
        return .handled
    }
}

/// The playfield. Redraws every display frame and turns drags into aim.
private struct SpaceCanvas: View {
    let model: GameModel
    let layout: FieldLayout
    @State private var dragging = false

    var body: some View {
        TimelineView(.animation) { timeline in
            Canvas { context, size in
                _ = timeline.date
                SpaceRenderer(model: model, layout: layout, size: size, context: context).draw()
            }
        }
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 0, coordinateSpace: .local)
                .onChanged { value in
                    let size = CGSize(width: max(1, layout.safe.maxX), height: max(1, layout.safe.maxY))
                    model.pointerNorm = (
                        Double((value.location.x / size.width - 0.5) * 2),
                        Double((value.location.y / size.height - 0.5) * 2)
                    )
                    if dragging {
                        model.pointerMoved(layout.toWorld(value.location))
                    } else {
                        dragging = true
                        model.pointerDown(layout.toWorld(value.startLocation))
                        model.pointerMoved(layout.toWorld(value.location))
                    }
                }
                .onEnded { _ in
                    dragging = false
                    model.pointerUp()
                }
        )
        .accessibilityLabel("Playfield")
        .accessibilityHint("Drag back from the probe to aim, then release to launch")
    }
}
