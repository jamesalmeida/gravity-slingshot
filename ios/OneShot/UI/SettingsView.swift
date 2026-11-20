import GSVAbout
import SwiftUI

/// Settings, reached from the bottom of the sector map. Uses the standard system form like the
/// other GSV apps, with the shared Build section (version, build number, release notes).
struct SettingsView: View {
    let model: GameModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Game") {
                    Toggle("Sound", isOn: Binding(get: { model.audioOn }, set: { _ in model.toggleAudio() }))
                    Toggle("Gravity wells", isOn: Binding(get: { model.showWells }, set: { _ in model.toggleWells() }))
                    LabeledContent("Sectors cleared", value: "\(model.completed.count) of \(model.sectors.count)")
                }

                Section {
                    Text("Drag back from the probe to aim, then let go to launch. The dotted line shows where the probe will fly. Use the trim buttons for fine adjustments.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } header: {
                    Text("How to play")
                }

                Section {
                    Text("Based on the “gravity slingshot puzzle” study in miaai-lab’s Gemini-4-Neon-100-HTML-Files. The web version of this game plays the same 100 sectors.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } header: {
                    Text("Acknowledgements")
                }

                GSVBuildSection()
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
