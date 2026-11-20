import SwiftUI
import SlingshotCore

/// Where the 1200 x 720 playfield sits on screen, and which HUD arrangement goes around it.
///
/// The app never assumes a device. Given any window size it tries four arrangements and keeps
/// the one with the biggest playfield, so the same code serves an iPhone either way up, an iPad
/// in a split view, and an iPhone Duo folded or open (its window resizes when it unfolds).
struct FieldLayout: Equatable {
    enum Chrome {
        /// Bars above and below the field. Suits tall or roomy windows.
        case bars
        /// A thin strip on top and a column of controls each side. Suits short, wide windows.
        case rails
    }

    var chrome: Chrome
    /// The field is turned a quarter turn so its long side runs up the screen.
    var rotated: Bool
    /// Bars need two rows each when the window is narrow.
    var narrow: Bool
    var scale: CGFloat
    /// The field in view coordinates.
    var rect: CGRect
    /// The window minus safe-area insets.
    var safe: CGRect

    static let railWidth: CGFloat = 78
    static let stripHeight: CGFloat = 30
    static func topBarHeight(narrow: Bool) -> CGFloat { narrow ? 86 : 54 }
    static func bottomBarHeight(narrow: Bool) -> CGFloat { narrow ? 96 : 52 }
    static let margin: CGFloat = 8
    static let gap: CGFloat = 6

    /// World to view.
    var transform: CGAffineTransform {
        if rotated {
            // World x runs up the screen, world y runs right: a quarter turn anticlockwise.
            return CGAffineTransform(a: 0, b: -scale, c: scale, d: 0, tx: rect.minX, ty: rect.maxY)
        }
        return CGAffineTransform(a: scale, b: 0, c: 0, d: scale, tx: rect.minX, ty: rect.minY)
    }

    func toView(_ x: Double, _ y: Double) -> CGPoint {
        CGPoint(x: x, y: y).applying(transform)
    }

    func toWorld(_ point: CGPoint) -> WorldPoint {
        let p = point.applying(transform.inverted())
        return WorldPoint(x: p.x, y: p.y)
    }

    static func best(size: CGSize, insets: EdgeInsets) -> FieldLayout {
        let safe = CGRect(
            x: insets.leading,
            y: insets.top,
            width: max(1, size.width - insets.leading - insets.trailing),
            height: max(1, size.height - insets.top - insets.bottom)
        )
        let narrow = safe.width < 720

        func candidate(_ chrome: Chrome, rotated: Bool) -> FieldLayout {
            var avail = safe.insetBy(dx: margin, dy: margin)
            switch chrome {
            case .bars:
                let top = topBarHeight(narrow: narrow) + gap
                let bottom = bottomBarHeight(narrow: narrow) + gap
                avail = CGRect(x: avail.minX, y: avail.minY + top, width: avail.width, height: avail.height - top - bottom)
            case .rails:
                let side = railWidth + gap
                let top = stripHeight + gap
                avail = CGRect(x: avail.minX + side, y: avail.minY + top, width: avail.width - side * 2, height: avail.height - top)
            }
            let fieldW = rotated ? Physics.worldH : Physics.worldW
            let fieldH = rotated ? Physics.worldW : Physics.worldH
            let scale = max(0.05, min(avail.width / fieldW, avail.height / fieldH))
            let rect = CGRect(
                x: avail.midX - fieldW * scale / 2,
                y: avail.midY - fieldH * scale / 2,
                width: fieldW * scale,
                height: fieldH * scale
            )
            return FieldLayout(chrome: chrome, rotated: rotated, narrow: narrow, scale: scale, rect: rect, safe: safe)
        }

        // The plain arrangement wins unless another gives a clearly bigger field.
        let options: [(FieldLayout, CGFloat)] = [
            (candidate(.bars, rotated: false), 1.0),
            (candidate(.rails, rotated: false), 0.92),
            (candidate(.bars, rotated: true), 0.87),
            (candidate(.rails, rotated: true), 0.80)
        ]
        return options.max { $0.0.scale * $0.1 < $1.0.scale * $1.1 }!.0
    }
}
