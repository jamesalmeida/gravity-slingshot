import SwiftUI

/// The mission-control chrome around the playfield, in whichever arrangement the layout chose.
struct HUDView: View {
    let model: GameModel
    let layout: FieldLayout

    var body: some View {
        ZStack {
            Group {
                switch layout.chrome {
                case .bars: bars
                case .rails: rails
                }
            }
            .padding(FieldLayout.margin)
            .frame(width: layout.safe.width, height: layout.safe.height)
            .position(x: layout.safe.midX, y: layout.safe.midY)

            StatusPill(text: model.statusText, tone: model.statusTone)
                .frame(maxWidth: max(120, layout.rect.width - 16))
                .opacity(model.statusVisible ? 1 : 0)
                .animation(.easeInOut(duration: 0.25), value: model.statusVisible)
                .position(x: layout.rect.midX, y: layout.rect.minY + 18)
                .allowsHitTesting(false)
        }
    }

    // MARK: Bars: roomy or tall windows

    private var bars: some View {
        VStack(spacing: 0) {
            Group {
                if layout.narrow {
                    VStack(spacing: 6) {
                        HStack(spacing: 8) {
                            BrandBlock(model: model, compact: true)
                            Spacer(minLength: 4)
                            SectorStepper(model: model, showsProgress: layout.safe.width > 560)
                        }
                        Divider().overlay(Theme.hudBorderDim)
                        Telemetry(model: model, style: .spread)
                    }
                } else {
                    HStack(spacing: 14) {
                        BrandBlock(model: model, compact: false)
                        Spacer(minLength: 8)
                        SectorStepper(model: model, showsProgress: true)
                        Spacer(minLength: 8)
                        Telemetry(model: model, style: layout.safe.width > 980 ? .full : .short)
                    }
                }
            }
            .padding(.horizontal, layout.narrow ? 10 : 14)
            .frame(maxWidth: .infinity)
            .frame(height: FieldLayout.topBarHeight(narrow: layout.narrow))
            .hudPanel()

            Spacer(minLength: 0)

            Group {
                if layout.narrow {
                    VStack(spacing: 8) {
                        HStack(spacing: 6) {
                            ControlButtons(model: model, labels: .short)
                        }
                        HStack(spacing: 8) {
                            TrimPad(model: model, vertical: false)
                            LaunchButton(model: model, expands: true)
                        }
                    }
                } else {
                    HStack(spacing: 8) {
                        ControlButtons(model: model, labels: layout.safe.width > 980 ? .long : .short)
                        Spacer(minLength: 8)
                        if layout.safe.width > 1080 {
                            HintText()
                            Spacer(minLength: 8)
                        }
                        TrimPad(model: model, vertical: false)
                        LaunchButton(model: model)
                    }
                }
            }
            .padding(.horizontal, layout.narrow ? 10 : 14)
            .frame(maxWidth: .infinity)
            .frame(height: FieldLayout.bottomBarHeight(narrow: layout.narrow))
            .hudPanel()
        }
    }

    // MARK: Rails: short, wide windows (a phone on its side)

    private var rails: some View {
        VStack(spacing: FieldLayout.gap) {
            HStack(spacing: 10) {
                Text(model.sectorCode).foregroundStyle(Theme.cyan)
                Text("//").foregroundStyle(Theme.cyan)
                Text(model.sector.name).foregroundStyle(Theme.white.opacity(0.85)).lineLimit(1)
                Spacer(minLength: 6)
                Telemetry(model: model, style: .inline)
            }
            .font(Theme.mono(10.5))
            .tracking(1.2)
            .padding(.horizontal, 10)
            .frame(maxWidth: .infinity)
            .frame(height: FieldLayout.stripHeight)
            .hudPanel()

            HStack(spacing: 0) {
                VStack(spacing: 6) {
                    SectorStepper(model: model, showsProgress: true, vertical: true)
                    Spacer(minLength: 0)
                    ControlButtons(model: model, labels: .iconOnly)
                }
                .padding(6)
                .frame(width: FieldLayout.railWidth)
                .frame(maxHeight: .infinity)
                .hudPanel()

                Spacer(minLength: 0)

                VStack(spacing: 6) {
                    TrimPad(model: model, vertical: true)
                    Spacer(minLength: 0)
                    LaunchButton(model: model, stacked: true)
                }
                .padding(6)
                .frame(width: FieldLayout.railWidth)
                .frame(maxHeight: .infinity)
                .hudPanel()
            }
        }
    }
}

// MARK: - Pieces

private struct HUDPanel: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(Theme.hudBackground)
            .background(.ultraThinMaterial.opacity(0.5))
            .overlay(Rectangle().strokeBorder(Theme.hudBorderDim, lineWidth: 1))
            .overlay(alignment: .top) { Rectangle().fill(Theme.hudBorder).frame(height: 1) }
            .shadow(color: .black.opacity(0.45), radius: 16, y: 8)
    }
}

extension View {
    func hudPanel() -> some View { modifier(HUDPanel()) }
}

/// The orbit-and-probe mark from the web game's header.
struct BrandMark: View {
    var body: some View {
        Canvas { context, size in
            let k = size.width / 32
            var ctx = context
            ctx.scaleBy(x: k, y: k)
            ctx.stroke(
                Path(ellipseIn: CGRect(x: 3, y: 3, width: 26, height: 26)),
                with: .color(Theme.cyan.opacity(0.55)), style: StrokeStyle(lineWidth: 1.2, dash: [3, 3])
            )
            var orbit = Path()
            orbit.move(to: CGPoint(x: 7, y: 22))
            orbit.addCurve(to: CGPoint(x: 26, y: 12), control1: CGPoint(x: 11, y: 10), control2: CGPoint(x: 21, y: 8))
            ctx.stroke(orbit, with: .color(Theme.cyan), lineWidth: 1.6)
            ctx.fill(Path(ellipseIn: CGRect(x: 12.8, y: 12.8, width: 6.4, height: 6.4)), with: .color(Theme.gold))
            var head = Path()
            head.move(to: CGPoint(x: 26, y: 12))
            head.addLine(to: CGPoint(x: 22, y: 10.8))
            head.addLine(to: CGPoint(x: 23.8, y: 14.6))
            head.closeSubpath()
            ctx.fill(head, with: .color(Theme.white))
        }
        .accessibilityHidden(true)
    }
}

private struct BrandBlock: View {
    let model: GameModel
    let compact: Bool

    var body: some View {
        HStack(spacing: compact ? 8 : 12) {
            BrandMark().frame(width: compact ? 22 : 28, height: compact ? 22 : 28)
            if compact {
                // No room for the title at phone width: the mark stands in for it.
                VStack(alignment: .leading, spacing: 3) {
                    Text(model.sectorCode).foregroundStyle(Theme.cyan)
                    Text(model.sector.name).foregroundStyle(Theme.white.opacity(0.9)).fontWeight(.bold)
                }
                .font(Theme.mono(10.5))
                .tracking(1.2)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            } else {
                VStack(alignment: .leading, spacing: 2) {
                    Text("VOYAGER SLINGSHOT")
                        .font(.system(size: 14, weight: .bold))
                        .tracking(2.2)
                        .foregroundStyle(Theme.white)
                    HStack(spacing: 6) {
                        Text(model.sectorCode).foregroundStyle(Theme.cyan)
                        Text("//").foregroundStyle(Theme.cyan)
                        Text(model.sector.name).foregroundStyle(Theme.white.opacity(0.85))
                    }
                    .font(Theme.mono(10.5))
                    .tracking(1.4)
                }
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

private struct SectorStepper: View {
    let model: GameModel
    let showsProgress: Bool
    var vertical = false

    var body: some View {
        if vertical {
            VStack(spacing: 6) {
                mapButton
                HStack(spacing: 4) {
                    previous
                    next
                }
            }
        } else {
            HStack(spacing: 4) {
                previous
                mapButton
                next
            }
        }
    }

    private var previous: some View {
        Button(action: model.previousSector) { Image(systemName: "chevron.left") }
            .buttonStyle(HUDButtonStyle(square: true))
            .accessibilityLabel("Previous sector")
    }

    private var next: some View {
        Button(action: model.nextSector) { Image(systemName: "chevron.right") }
            .buttonStyle(HUDButtonStyle(square: true))
            .accessibilityLabel("Next sector")
    }

    private var mapButton: some View {
        Button(action: model.toggleMap) {
            if vertical {
                VStack(spacing: 3) {
                    Image(systemName: "square.grid.3x3.fill")
                    Text("\(model.completed.count)/\(model.sectors.count)")
                        .font(Theme.mono(9.5, bold: true))
                        .tracking(0)
                        .minimumScaleFactor(0.7)
                }
                .frame(maxWidth: .infinity)
            } else {
                HStack(spacing: 7) {
                    Image(systemName: "square.grid.3x3.fill")
                    if showsProgress { Text(model.progressText) }
                }
            }
        }
        .buttonStyle(HUDButtonStyle(fillsWidth: vertical))
        .accessibilityLabel("Sector map, \(model.completed.count) of \(model.sectors.count) cleared")
    }
}

private struct Telemetry: View {
    enum Style {
        /// Every cell, right-aligned (wide top bar).
        case full
        /// Without Pe / Ap (medium top bar).
        case short
        /// Every cell spread across the width (narrow top bar's second row).
        case spread
        /// One line of "LABEL value" pairs (the rails strip).
        case inline
    }

    let model: GameModel
    let style: Style

    var body: some View {
        switch style {
        case .inline:
            HStack(spacing: 12) {
                pair("ΔV", model.dvText, Theme.cyan)
                pair("AZM", model.azimuthText, Theme.white)
                pair("RLY", relays, Theme.emerald)
                pair("L", launches, Theme.white)
            }
            .lineLimit(1)
        case .spread:
            HStack(spacing: 0) {
                cell("LAUNCHES", launches, Theme.white, .leading)
                Spacer(minLength: 4)
                cell("DELTA-V", model.dvText, Theme.cyan, .leading)
                Spacer(minLength: 4)
                cell("AZIMUTH", model.azimuthText, Theme.white, .leading)
                Spacer(minLength: 4)
                cell("RELAYS", relays, Theme.emerald, .leading)
            }
        case .full, .short:
            HStack(spacing: 14) {
                cell("LAUNCHES", launches, Theme.white, .trailing)
                cell("DELTA-V", model.dvText, Theme.cyan, .trailing)
                cell("AZIMUTH", model.azimuthText, Theme.white, .trailing)
                if style == .full {
                    cell("PE / AP", model.peApText, model.peApWarns ? Theme.rose : Theme.gold, .trailing)
                }
                cell("RELAYS", relays, Theme.emerald, .trailing)
            }
        }
    }

    private var launches: String { model.launches < 10 ? "0\(model.launches)" : "\(model.launches)" }
    private var relays: String { "\(model.relaysLocked)/\(model.sector.relays.count)" }

    private func cell(_ label: String, _ value: String, _ color: Color, _ alignment: HorizontalAlignment) -> some View {
        VStack(alignment: alignment, spacing: 2) {
            Text(label).font(Theme.mono(9)).tracking(1.2).foregroundStyle(Theme.textDim)
            Text(value).font(Theme.mono(12.5, bold: true)).monospacedDigit().foregroundStyle(color)
        }
        .lineLimit(1)
        .fixedSize()
        .accessibilityElement(children: .combine)
    }

    private func pair(_ label: String, _ value: String, _ color: Color) -> some View {
        HStack(spacing: 4) {
            Text(label).foregroundStyle(Theme.textDim)
            Text(value).foregroundStyle(color).fontWeight(.bold).monospacedDigit()
        }
        .fixedSize()
        .accessibilityElement(children: .combine)
    }
}

private struct ControlButtons: View {
    enum Labels {
        case long, short, iconOnly
    }

    let model: GameModel
    let labels: Labels

    var body: some View {
        Group {
            Button(action: model.resetSector) {
                content("arrow.counterclockwise", long: "RESET SECTOR", short: "RESET")
            }
            .buttonStyle(HUDButtonStyle(square: labels == .iconOnly, fillsWidth: labels != .long))
            .accessibilityLabel("Reset sector")

            Button(action: model.toggleWells) {
                content("circle.dotted.circle", long: "SHOW GRAVITY WELLS", short: "WELLS")
            }
            .buttonStyle(HUDButtonStyle(tone: model.showWells ? .active : .plain, square: labels == .iconOnly, fillsWidth: labels != .long))
            .accessibilityLabel("Gravity wells")
            .accessibilityValue(model.showWells ? "On" : "Off")

            Button(action: model.toggleAudio) {
                content(model.audioOn ? "speaker.wave.2.fill" : "speaker.slash.fill",
                        long: model.audioOn ? "AUDIO ON" : "AUDIO OFF", short: model.audioOn ? "AUDIO ON" : "AUDIO OFF")
            }
            .buttonStyle(HUDButtonStyle(tone: model.audioOn ? .active : .plain, square: labels == .iconOnly, fillsWidth: labels != .long))
            .accessibilityLabel("Audio")
            .accessibilityValue(model.audioOn ? "On" : "Off")
        }
    }

    @ViewBuilder
    private func content(_ icon: String, long: String, short: String) -> some View {
        switch labels {
        case .iconOnly:
            Image(systemName: icon).frame(maxWidth: .infinity)
        case .short:
            HStack(spacing: 6) {
                Image(systemName: icon)
                Text(short)
            }
        case .long:
            HStack(spacing: 7) {
                Image(systemName: icon)
                Text(long)
            }
        }
    }
}

/// Fine aim, a step at a time: the touch stand-in for the web game's arrow keys.
/// Hold a button to repeat.
private struct TrimPad: View {
    let model: GameModel
    let vertical: Bool

    var body: some View {
        if vertical {
            VStack(spacing: 5) {
                caption("AZIMUTH")
                HStack(spacing: 4) { azimuth }
                caption("DELTA-V")
                HStack(spacing: 4) { speed }
            }
        } else {
            HStack(spacing: 4) {
                azimuth
                Rectangle().fill(Theme.hudBorderDim).frame(width: 1, height: 22).padding(.horizontal, 3)
                speed
            }
        }
    }

    private func caption(_ text: String) -> some View {
        Text(text).font(Theme.mono(8.5)).tracking(1).foregroundStyle(Theme.textDim)
    }

    @ViewBuilder private var azimuth: some View {
        step("arrow.counterclockwise", "Aim anticlockwise") { model.trim(azimuthSteps: -1, speedSteps: 0) }
        step("arrow.clockwise", "Aim clockwise") { model.trim(azimuthSteps: 1, speedSteps: 0) }
    }

    @ViewBuilder private var speed: some View {
        step("minus", "Less delta-V") { model.trim(azimuthSteps: 0, speedSteps: -1) }
        step("plus", "More delta-V") { model.trim(azimuthSteps: 0, speedSteps: 1) }
    }

    private func step(_ icon: String, _ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { Image(systemName: icon) }
            .buttonStyle(HUDButtonStyle(square: true))
            .buttonRepeatBehavior(.enabled)
            .accessibilityLabel(label)
    }
}

private struct LaunchButton: View {
    let model: GameModel
    var stacked = false
    /// Take whatever width is left (the narrow bottom bar).
    var expands = false

    var body: some View {
        let aborting = model.phase == .flight
        Button(action: model.launchPressed) {
            Group {
                if stacked {
                    VStack(spacing: 4) {
                        Image(systemName: aborting ? "xmark" : "play.fill")
                        Text(aborting ? "ABORT" : "LAUNCH")
                            .font(Theme.mono(10, bold: true))
                            .tracking(0.4)
                            .minimumScaleFactor(0.7)
                    }
                    .frame(maxWidth: .infinity, minHeight: 40)
                } else {
                    HStack(spacing: 7) {
                        Image(systemName: aborting ? "xmark" : "play.fill")
                        Text(aborting ? "ABORT" : "LAUNCH")
                    }
                    .frame(minWidth: 76)
                }
            }
        }
        .buttonStyle(HUDButtonStyle(tone: aborting ? .abort : .primary, fillsWidth: stacked || expands))
        .accessibilityLabel(aborting ? "Abort flight" : "Launch")
    }
}

private struct HintText: View {
    var body: some View {
        (Text("DRAG BACK").foregroundColor(Theme.cyan).fontWeight(.semibold)
            + Text(" FROM PROBE TO AIM · TRIM TO FINE-TUNE"))
            .font(Theme.mono(10.5))
            .tracking(1.2)
            .foregroundStyle(Theme.textDim)
            .lineLimit(1)
            .accessibilityHidden(true)
    }
}

private struct StatusPill: View {
    let text: String
    let tone: StatusTone

    var body: some View {
        let color: Color = tone == .warn ? Theme.rose : tone == .lock ? Theme.emerald : Theme.cyan
        Text(text)
            .font(Theme.mono(11))
            .tracking(1.4)
            .lineLimit(1)
            .minimumScaleFactor(0.55)
            .foregroundStyle(color)
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .background(Color(hex: 0x070B14, opacity: 0.84))
            .overlay(Rectangle().strokeBorder(color.opacity(0.6), lineWidth: 1))
            .accessibilityAddTraits(.updatesFrequently)
    }
}

/// The "sector cleared" card.
struct MissionCard: View {
    let summary: MissionSummary
    let replay: () -> Void
    let next: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            Text(summary.kicker)
                .font(Theme.mono(10.5))
                .tracking(2)
                .foregroundStyle(Theme.emerald)
                .multilineTextAlignment(.center)
            Text(summary.title)
                .font(.system(size: 21, weight: .bold))
                .tracking(2.4)
                .foregroundStyle(Theme.white)
                .multilineTextAlignment(.center)
            HStack(spacing: 8) {
                stat("LAUNCHES", summary.launches)
                stat("LAUNCH ΔV", summary.launchDV)
                stat("PEAK VEL", summary.peak)
            }
            .padding(.vertical, 12)
            .overlay(alignment: .top) { Rectangle().fill(Theme.hudBorderDim).frame(height: 1) }
            .overlay(alignment: .bottom) { Rectangle().fill(Theme.hudBorderDim).frame(height: 1) }
            HStack(spacing: 10) {
                Button("REPLAY", action: replay).buttonStyle(HUDButtonStyle(fillsWidth: true))
                Button(summary.nextLabel, action: next).buttonStyle(HUDButtonStyle(tone: .emerald, fillsWidth: true))
            }
        }
        .padding(.horizontal, 26)
        .padding(.vertical, 22)
        .background(Color(hex: 0x070B14, opacity: 0.92))
        .background(.ultraThinMaterial)
        .overlay(Rectangle().strokeBorder(Theme.emerald.opacity(0.55), lineWidth: 1))
        .shadow(color: Theme.emerald.opacity(0.16), radius: 20)
        .shadow(color: .black.opacity(0.7), radius: 24, y: 18)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(spacing: 4) {
            Text(label).font(Theme.mono(9)).tracking(1.2).foregroundStyle(Theme.textDim)
            Text(value).font(Theme.mono(13, bold: true)).foregroundStyle(Theme.white)
        }
        .frame(maxWidth: .infinity)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .accessibilityElement(children: .combine)
    }
}

/// Square-cornered mission-control buttons.
struct HUDButtonStyle: ButtonStyle {
    enum Tone {
        case plain, active, primary, abort, emerald
    }

    var tone: Tone = .plain
    /// A fixed square for icon-only buttons.
    var square = false
    var fillsWidth = false

    func makeBody(configuration: Configuration) -> some View {
        let border: Color
        let fill: Color
        let text: Color
        switch tone {
        case .plain: (border, fill, text) = (Theme.hudBorderDim, Theme.buttonFill, Theme.white)
        case .active: (border, fill, text) = (Theme.cyan, Theme.cyan.opacity(0.12), Theme.cyan)
        case .primary: (border, fill, text) = (Theme.cyan, Theme.cyan.opacity(0.16), Theme.white)
        case .abort: (border, fill, text) = (Theme.rose, Theme.rose.opacity(0.18), Color(hex: 0xFFE4E6))
        case .emerald: (border, fill, text) = (Theme.emerald, Theme.emerald.opacity(0.18), Theme.white)
        }
        return configuration.label
            .font(Theme.mono(11.5, bold: true))
            .tracking(1.2)
            .lineLimit(1)
            .imageScale(.small)
            .foregroundStyle(text)
            .padding(.horizontal, square ? 0 : fillsWidth ? 4 : 12)
            .frame(minWidth: square ? 34 : nil, maxWidth: fillsWidth ? .infinity : nil, minHeight: 34)
            .background(fill)
            .background(Theme.buttonFill)
            .overlay(Rectangle().strokeBorder(border, lineWidth: 1))
            .opacity(configuration.isPressed ? 0.6 : 1)
            .contentShape(Rectangle())
    }
}
