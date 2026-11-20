import SwiftUI
import SlingshotCore

/// Every sector as a cell, grouped by arc. Cleared sectors carry an emerald dot.
struct SectorMapView: View {
    let model: GameModel
    let safe: CGRect

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 10)

    var body: some View {
        ZStack {
            Color(hex: 0x04070D, opacity: 0.66)
                .contentShape(Rectangle())
                .onTapGesture { model.mapOpen = false }
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .bottom) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("DEEP SPACE NETWORK").font(Theme.mono(10.5)).tracking(2).foregroundStyle(Theme.cyan)
                        Text("SECTOR MAP").font(.system(size: 18, weight: .bold)).tracking(2).foregroundStyle(Theme.white)
                    }
                    Spacer()
                    Button("CLOSE") { model.mapOpen = false }.buttonStyle(HUDButtonStyle())
                }

                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 12) {
                            ForEach(SectorLibrary.arcs, id: \.name) { arc in
                                VStack(alignment: .leading, spacing: 6) {
                                    HStack {
                                        Text(arc.name)
                                        Spacer()
                                        Text("\(model.formatID(arc.range.lowerBound + 1))–\(model.formatID(arc.range.upperBound))").opacity(0.75)
                                    }
                                    .font(Theme.mono(10, bold: true))
                                    .tracking(1.6)
                                    .foregroundStyle(Theme.textDim)

                                    LazyVGrid(columns: columns, spacing: 4) {
                                        ForEach(Array(arc.range), id: \.self) { index in
                                            cell(index)
                                        }
                                    }
                                }
                                .id(arc.name)
                            }
                        }
                        .padding(.trailing, 2)
                    }
                    .onAppear { proxy.scrollTo(model.sector.arc, anchor: .center) }
                }

                HStack(spacing: 10) {
                    Text("\(model.formatID(model.sector.id)) // \(model.sector.name)")
                        .font(Theme.mono(11))
                        .tracking(1)
                        .foregroundStyle(Theme.cyan)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Button(action: model.openSettings) {
                        HStack(spacing: 6) {
                            Image(systemName: "gearshape")
                            Text("SETTINGS")
                        }
                    }
                    .buttonStyle(HUDButtonStyle())
                }
                    .padding(.top, 10)
                    .overlay(alignment: .top) { Rectangle().fill(Theme.hudBorderDim).frame(height: 1) }
            }
            .padding(18)
            .frame(maxWidth: 480)
            .frame(maxHeight: max(160, safe.height - 20))
            .background(Color(hex: 0x070B14, opacity: 0.95))
            .background(.ultraThinMaterial)
            .overlay(Rectangle().strokeBorder(Theme.hudBorder, lineWidth: 1))
            .shadow(color: Theme.cyan.opacity(0.12), radius: 20)
            .shadow(color: .black.opacity(0.7), radius: 24, y: 18)
            .padding(.horizontal, 10)
            .position(x: safe.midX, y: safe.midY)
            .accessibilityAddTraits(.isModal)
        }
    }

    private func cell(_ index: Int) -> some View {
        let sector = model.sectors[index]
        let active = index == model.sectorIndex
        let cleared = model.completed.contains(index)
        return Button {
            model.selectSector(index)
        } label: {
            Text(model.formatID(sector.id))
                .font(Theme.mono(10.5, bold: true))
                .minimumScaleFactor(0.6)
                .lineLimit(1)
                .foregroundStyle(active || cleared ? Theme.white : Theme.textDim)
                .frame(maxWidth: .infinity, minHeight: 30)
                .background(active ? Theme.cyan.opacity(0.16) : Color(hex: 0x0E1729, opacity: 0.8))
                .overlay(Rectangle().strokeBorder(active ? Theme.cyan : cleared ? Theme.emerald.opacity(0.45) : Theme.hudBorderDim, lineWidth: 1))
                .overlay(alignment: .topTrailing) {
                    if cleared { Circle().fill(Theme.emerald).frame(width: 4, height: 4).padding(3) }
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Sector \(sector.id), \(sector.name)\(cleared ? ", cleared" : "")")
        .accessibilityAddTraits(active ? .isSelected : [])
    }
}
