import Foundation
import Combine

@MainActor final class InlineScheduleComposer: ObservableObject {
    @Published var title = ""
    @Published var notes = ""
    @Published var date = Date()
    @Published var start = Date()
    @Published var end = Date()
    @Published var editing = false
    @Published var saving = false
    @Published var error = ""
    private var eventID = UUID().uuidString
    private var requestID = UUID().uuidString
    static let beginNotification = Notification.Name("XipoBeginInlineSchedule")
    static var calendar: Calendar {
        var value = Calendar(identifier: .gregorian)
        value.timeZone = TimeZone(identifier: "Asia/Shanghai")!
        return value
    }
    static func roundedStart(_ now: Date) -> Date {
        let day = calendar.startOfDay(for: now)
        let minute = calendar.component(.hour, from: now) * 60 + calendar.component(.minute, from: now)
        return calendar.date(byAdding: .minute, value: ((minute + 9) / 10) * 10, to: day)!
    }
    func activate(now: Date = Date()) {
        guard !editing, !saving else { return }
        start = Self.roundedStart(now)
        end = start.addingTimeInterval(3600)
        date = Self.calendar.startOfDay(for: start)
        error = ""; editing = true
    }
    func changed() { requestID = UUID().uuidString; error = "" }
    var draft: NewSchedule {
        NewSchedule(id: eventID, requestID: requestID, title: title, date: Beijing.format(date, "yyyy-MM-dd"),
                    start: Beijing.format(start, "HH:mm"), end: Beijing.format(end, "HH:mm"),
                    notes: notes, frequency: nil, weekdays: [])
    }
    func commit(store: TodoStore) {
        guard editing, !saving else { return }
        guard !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { reset(); return }
        let value = draft
        if let reason = value.validationError() { error = reason; return }
        saving = true; error = ""
        Task {
            // A click-away save may coincide with the periodic background refresh.
            for _ in 0..<250 where store.busy && store.connected {
                try? await Task.sleep(for: .milliseconds(100))
            }
            let saved = await store.create(value)
            saving = false
            if saved { reset() }
            else { error = store.message.isEmpty ? "暂时无法保存，请按回车重试。" : store.message }
        }
    }
    private func reset() {
        title = ""; notes = ""; error = ""; editing = false
        eventID = UUID().uuidString; requestID = UUID().uuidString
    }
}
