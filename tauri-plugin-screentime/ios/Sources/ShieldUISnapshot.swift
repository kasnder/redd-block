import Foundation

/// UserDefaults key for the versioned shield UI snapshot (App Group).
let shieldUISnapshotKey = "redd.shieldUISnapshot"

// MARK: - Overlap / precedence policy (read this before Passes 4–7)
//
// Each `ManagedSettingsStore` channel (manual default store vs named `schedule` store) keeps its own
// attribution maps. When both channels claim the same shield target (same normalized host or same
// token key), `ShieldAttributionPicker` chooses the row with the **smallest** `enforcementStartedAtMs`
// — i.e. whichever source **began enforcing that target first** among the rows still present in the
// snapshot. When the earlier source clears or is recomputed away, the later source’s row becomes
// visible automatically because it remains in the snapshot.
//
// **Within one channel** (e.g. multiple schedules in the union), writers must persist **at most one**
// `ShieldAttribution` per map key: the winning list for that key is the active contributor with the
// minimum `enforcementStartedAtMs` (same “first started wins” rule).

/// Display metadata for one shield attribution (one blocklist / source claiming a target).
struct ShieldAttribution: Codable, Equatable {
    /// Opaque source key, e.g. `"manual"` or `"schedule:<scheduleId>"`.
    var sourceId: String
    /// Epoch ms when this source **started** enforcing this specific target (used for precedence).
    var enforcementStartedAtMs: Double
    var blocklistEmoji: String?
    var blocklistName: String?
    var blocklistColorHex: String?
    var blockStartedAtMs: Double?
    var blockEndsAtMs: Double?
}

/// Attribution maps for one store channel (manual or schedule).
struct ShieldAttributionSection: Codable, Equatable {
    /// Keys: `ShieldSnapshotNormalization.normalizedWebHost(_)` of each blocked domain.
    var domainByNormalizedHost: [String: ShieldAttribution]
    /// Keys: base64 `ApplicationToken` blobs (same encoding as `ScheduleBlockData.appTokenData`).
    var appByTokenData: [String: ShieldAttribution]
    /// Keys: base64 `ActivityCategoryToken` blobs (same encoding as `ScheduleBlockData.categoryTokenData`).
    var categoryByTokenData: [String: ShieldAttribution]

    static var empty: ShieldAttributionSection {
        ShieldAttributionSection(domainByNormalizedHost: [:], appByTokenData: [:], categoryByTokenData: [:])
    }
}

/// Versioned JSON snapshot shared across app, monitor, plugin, and shield extension.
struct ShieldUISnapshot: Codable, Equatable {
    static let currentSchemaVersion = 1

    var schemaVersion: Int
    var updatedAtMs: Double
    var manual: ShieldAttributionSection?
    var schedule: ShieldAttributionSection?

    static func empty(nowMs: Double = Date().timeIntervalSince1970 * 1000) -> ShieldUISnapshot {
        ShieldUISnapshot(schemaVersion: currentSchemaVersion, updatedAtMs: nowMs, manual: nil, schedule: nil)
    }
}

// MARK: - Normalization

enum ShieldSnapshotNormalization {
    /// Lowercase host, trim whitespace, strip a leading `www.` segment (match writers in Pass 4–6).
    static func normalizedWebHost(_ raw: String) -> String {
        var s = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if s.hasPrefix("www.") {
            s.removeFirst(4)
        }
        return s
    }
}

// MARK: - Precedence helpers (shield + writers)

enum ShieldAttributionPicker {
    /// Prefer the attribution that began enforcing first; stable tie-break on `sourceId`.
    static func preferred(_ a: ShieldAttribution?, _ b: ShieldAttribution?) -> ShieldAttribution? {
        switch (a, b) {
        case (nil, nil):
            return nil
        case let (x?, nil):
            return x
        case let (nil, y?):
            return y
        case let (x?, y?):
            if x.enforcementStartedAtMs != y.enforcementStartedAtMs {
                return x.enforcementStartedAtMs < y.enforcementStartedAtMs ? x : y
            }
            return x.sourceId <= y.sourceId ? x : y
        }
    }

    static func winningDomainRow(normalizedHost: String, snapshot: ShieldUISnapshot) -> ShieldAttribution? {
        preferred(snapshot.manual?.domainByNormalizedHost[normalizedHost], snapshot.schedule?.domainByNormalizedHost[normalizedHost])
    }

    static func winningAppRow(tokenDataKey: String, snapshot: ShieldUISnapshot) -> ShieldAttribution? {
        preferred(snapshot.manual?.appByTokenData[tokenDataKey], snapshot.schedule?.appByTokenData[tokenDataKey])
    }

    static func winningCategoryRow(tokenDataKey: String, snapshot: ShieldUISnapshot) -> ShieldAttribution? {
        preferred(snapshot.manual?.categoryByTokenData[tokenDataKey], snapshot.schedule?.categoryByTokenData[tokenDataKey])
    }
}

// MARK: - Persistence

struct SharedShieldSnapshotStore {
    private static var sharedDefaults: UserDefaults? {
        UserDefaults(suiteName: appGroupID)
    }

    static func save(_ snapshot: ShieldUISnapshot) {
        guard let defaults = sharedDefaults else { return }
        let enc = JSONEncoder()
        guard let data = try? enc.encode(snapshot) else { return }
        defaults.set(data, forKey: shieldUISnapshotKey)
    }

    /// Decodes when present and `schemaVersion` is known; otherwise nil (callers treat as “no snapshot”).
    static func load() -> ShieldUISnapshot? {
        guard let defaults = sharedDefaults,
              let data = defaults.data(forKey: shieldUISnapshotKey) else { return nil }
        guard let snap = try? JSONDecoder().decode(ShieldUISnapshot.self, from: data) else { return nil }
        if snap.schemaVersion != ShieldUISnapshot.currentSchemaVersion {
            return nil
        }
        return snap
    }

    static func clear() {
        sharedDefaults?.removeObject(forKey: shieldUISnapshotKey)
    }
}

// MARK: - Schedule union → snapshot (DeviceActivityMonitor + plugin re-apply)

/// Writes `ShieldUISnapshot.schedule` from schedules that are **active right now**, preserving `manual`.
enum ShieldScheduleSnapshotWriter {
    static func persistScheduleUnion(activeEntries: [(String, ScheduleBlockData)], now: Date = Date()) {
        let nowMs = now.timeIntervalSince1970 * 1000
        let previous = SharedShieldSnapshotStore.load()
        let manual = previous?.manual

        guard !activeEntries.isEmpty else {
            let snap = ShieldUISnapshot(
                schemaVersion: ShieldUISnapshot.currentSchemaVersion,
                updatedAtMs: nowMs,
                manual: manual,
                schedule: nil
            )
            SharedShieldSnapshotStore.save(snap)
            return
        }

        var domainMap: [String: ShieldAttribution] = [:]
        let domainKeys = Set(activeEntries.flatMap { $0.1.domains.prefix(50).map { ShieldSnapshotNormalization.normalizedWebHost($0) } })
        for key in domainKeys {
            if let picked = pickBest(entries: activeEntries, now: now, matches: { d in
                d.domains.prefix(50).contains { ShieldSnapshotNormalization.normalizedWebHost($0) == key }
            }) {
                domainMap[key] = attribution(scheduleId: picked.0, data: picked.1, enforcementMs: picked.2)
            }
        }

        var appMap: [String: ShieldAttribution] = [:]
        let appKeys = Set(activeEntries.flatMap { $0.1.appTokenData })
        for token in appKeys {
            if let picked = pickBest(entries: activeEntries, now: now, matches: { $0.appTokenData.contains(token) }) {
                appMap[token] = attribution(scheduleId: picked.0, data: picked.1, enforcementMs: picked.2)
            }
        }

        var categoryMap: [String: ShieldAttribution] = [:]
        let categoryKeys = Set(activeEntries.flatMap { $0.1.categoryTokenData })
        for token in categoryKeys {
            if let picked = pickBest(entries: activeEntries, now: now, matches: { $0.categoryTokenData.contains(token) }) {
                categoryMap[token] = attribution(scheduleId: picked.0, data: picked.1, enforcementMs: picked.2)
            }
        }

        let scheduleSection: ShieldAttributionSection? =
            domainMap.isEmpty && appMap.isEmpty && categoryMap.isEmpty
            ? nil
            : ShieldAttributionSection(
                domainByNormalizedHost: domainMap,
                appByTokenData: appMap,
                categoryByTokenData: categoryMap
            )
        let snap = ShieldUISnapshot(
            schemaVersion: ShieldUISnapshot.currentSchemaVersion,
            updatedAtMs: nowMs,
            manual: manual,
            schedule: scheduleSection
        )
        SharedShieldSnapshotStore.save(snap)
    }

    private static func attribution(scheduleId: String, data: ScheduleBlockData, enforcementMs: Double) -> ShieldAttribution {
        ShieldAttribution(
            sourceId: "schedule:\(scheduleId)",
            enforcementStartedAtMs: enforcementMs,
            blocklistEmoji: data.blocklistEmoji,
            blocklistName: data.blocklistName,
            blocklistColorHex: data.blocklistColorHex,
            blockStartedAtMs: enforcementMs,
            blockEndsAtMs: data.activeUntilTimestampMs
        )
    }

    private static func pickBest(
        entries: [(String, ScheduleBlockData)],
        now: Date,
        matches: (ScheduleBlockData) -> Bool
    ) -> (String, ScheduleBlockData, Double)? {
        var best: (String, ScheduleBlockData, Double)?
        for (id, data) in entries where matches(data) {
            let ms = scheduleEnforcementAnchorMs(data, now: now)
            if let cur = best {
                if ms < cur.2 || (ms == cur.2 && id < cur.0) {
                    best = (id, data, ms)
                }
            } else {
                best = (id, data, ms)
            }
        }
        return best
    }

    private static func scheduleEnforcementAnchorMs(_ data: ScheduleBlockData, now: Date) -> Double {
        let nowMs = now.timeIntervalSince1970 * 1000
        if let af = data.activeFromTimestampMs {
            return af
        }
        return estimatedTodaySegmentStartMs(data, now: now) ?? nowMs
    }

    private static func estimatedTodaySegmentStartMs(_ data: ScheduleBlockData, now: Date) -> Double? {
        guard let sh = data.startHour, let sm = data.startMinute else { return nil }
        let cal = Calendar.current
        var dc = cal.dateComponents([.year, .month, .day], from: now)
        dc.hour = sh
        dc.minute = sm
        dc.second = 0
        guard let startToday = cal.date(from: dc) else { return nil }
        let startMs = startToday.timeIntervalSince1970 * 1000
        let nowMs = now.timeIntervalSince1970 * 1000
        if startMs <= nowMs { return startMs }
        guard let prevDay = cal.date(byAdding: .day, value: -1, to: startToday) else { return nil }
        return prevDay.timeIntervalSince1970 * 1000
    }
}
