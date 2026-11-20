import UIKit

/// Taps for the moments that matter. iPad and the simulator have no Taptic Engine, where these
/// calls do nothing.
final class Haptics {
    private let light = UIImpactFeedbackGenerator(style: .light)
    private let medium = UIImpactFeedbackGenerator(style: .medium)
    private let rigid = UIImpactFeedbackGenerator(style: .rigid)
    private let notify = UINotificationFeedbackGenerator()
    private let selection = UISelectionFeedbackGenerator()

    func tick() { selection.selectionChanged() }
    func launch() { medium.impactOccurred() }
    func relayLock() { rigid.impactOccurred() }
    func impact() { notify.notificationOccurred(.error) }
    func lost() { light.impactOccurred() }
    func sectorComplete() { notify.notificationOccurred(.success) }
}
