import SwiftUI

/// The web game's palette and type, as SwiftUI values.
enum Theme {
    static let obsidian = Color(hex: 0x070B14)
    static let navy = Color(hex: 0x0E1729)
    static let white = Color(hex: 0xF7FAFC)
    static let cyan = Color(hex: 0x38BDF8)
    static let gold = Color(hex: 0xF59E0B)
    static let indigo = Color(hex: 0x6366F1)
    static let rose = Color(hex: 0xF43F5E)
    static let emerald = Color(hex: 0x10B981)
    static let fuchsia = Color(hex: 0xE879F9)

    static let hudBackground = Color(hex: 0x070B14, opacity: 0.78)
    static let hudBorder = Color(hex: 0x38BDF8, opacity: 0.22)
    static let hudBorderDim = Color(hex: 0xF7FAFC, opacity: 0.12)
    static let textDim = Color(hex: 0xF7FAFC, opacity: 0.56)
    static let buttonFill = Color(hex: 0x0E1729, opacity: 0.85)

    static func mono(_ size: CGFloat, bold: Bool = false) -> Font {
        .custom(bold ? "Menlo-Bold" : "Menlo-Regular", fixedSize: size)
    }
}

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }

    /// CSS-style `rgba(r, g, b, a)` with 0-255 channels.
    static func rgba(_ r: Double, _ g: Double, _ b: Double, _ a: Double = 1) -> Color {
        Color(.sRGB, red: r / 255, green: g / 255, blue: b / 255, opacity: a)
    }
}
