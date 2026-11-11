import Foundation

// Only display data is shared with the widget. Login credentials stay in the main app's keychain.
struct WidgetTask: Codable, Equatable {
    let title: String
    let start: String?
    let end: String?
    let completed: Bool
    let id: String?
    let occurrenceDate: String?
    let editable: Bool?
    var status: String? = nil
    var taskStatus: String { completed ? "completed" : status ?? "pending" }
    var statusSymbol: String { switch taskStatus { case "completed": return "checkmark.circle.fill"; case "cancelled": return "minus.circle"; case "deferred": return "chevron.right.circle"; default: return "circle" } }
    init(title: String, start: String?, end: String?, completed: Bool, id: String? = nil, occurrenceDate: String? = nil, editable: Bool? = nil, status: String? = nil) {
        self.title = title; self.start = start; self.end = end; self.completed = completed
        self.id = id; self.occurrenceDate = occurrenceDate; self.editable = editable; self.status = status
    }
}

struct WidgetSnapshot: Codable, Equatable {
    let date: String
    let updatedAt: Date
    let total: Int
    let completed: Int
    let pending: Int
    let tasks: [WidgetTask]
    var actionContext: String? = nil
}

struct WidgetCompletionRequest: Codable {
    let id: String
    let occurrenceDate: String?
    let date: String
    let context: String
    var status: String? = nil
}

struct WidgetBridgePayload: Codable {
    let status: String
    let snapshot: WidgetSnapshot?
}

enum WidgetSnapshotStore {
    static let kind = "io.xipo.todo.mac.today"
    static var port: Int { Bundle.main.object(forInfoDictionaryKey: "XipoWidgetBridgePort") as? Int ?? 18763 }
    private static let suite = "io.xipo.todo.mac.widget-data"
    private static let key = "today-snapshot-v1"

    static var today: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "Asia/Shanghai")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }

    static func read() -> WidgetSnapshot? {
        guard let data = UserDefaults(suiteName: suite)?.data(forKey: key),
              let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data),
              snapshot.date == today else { return nil }
        return snapshot
    }

    static func save(_ snapshot: WidgetSnapshot) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        let defaults = UserDefaults(suiteName: suite)
        defaults?.set(data, forKey: key)
        defaults?.synchronize()
    }

    static func clear() {
        let defaults = UserDefaults(suiteName: suite)
        defaults?.removeObject(forKey: key)
        defaults?.synchronize()
    }
}
