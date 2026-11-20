import Foundation

/// Cleared sectors and the last sector played, kept in UserDefaults.
struct ProgressStore {
    private let key = "voyager-slingshot.progress.v1"
    private let defaults = UserDefaults.standard

    func load(sectorCount: Int) -> (cleared: Set<Int>, last: Int) {
        guard let saved = defaults.dictionary(forKey: key) else { return ([], 0) }
        let cleared = (saved["cleared"] as? [Int] ?? []).filter { $0 >= 0 && $0 < sectorCount }
        let last = saved["last"] as? Int ?? 0
        return (Set(cleared), last >= 0 && last < sectorCount ? last : 0)
    }

    func save(cleared: Set<Int>, last: Int) {
        defaults.set(["cleared": cleared.sorted(), "last": last], forKey: key)
    }
}
