import Foundation

@main struct NewScheduleTests {
    @MainActor static func main() async throws {
        func draft(title: String = "新建测试", start: String? = "10:00", end: String? = "11:00", frequency: String? = nil, days: [Int] = []) -> NewSchedule {
            NewSchedule(id: UUID().uuidString, requestID: UUID().uuidString, title: title, date: Beijing.today, start: start, end: end, notes: "备注", frequency: frequency, weekdays: days)
        }
        assert(draft(title: "  ").validationError() != nil)
        assert(draft(start: "12:00", end: "11:00").validationError() != nil)
        assert(draft(start: "25:00").validationError() != nil)
        assert(draft(start: nil).validationError() != nil)
        assert(draft(frequency: "custom").validationError() != nil)
        assert(draft(frequency: "custom", days: [1, 3]).validationError() == nil)
        let allDay = draft(start: nil, end: nil)
        assert(allDay.validationError() == nil)
        let body = allDay.requestBody(revision: 3)
        let event = body["event"] as! [String: Any]
        assert(event["start"] is NSNull && event["end"] is NSNull)
        _ = try JSONSerialization.data(withJSONObject: body)
        let store = TodoStore(demo: true)
        let saved = await store.create(draft())
        assert(saved)
        assert(store.day?.total == 4 && store.day?.pending == 3 && store.timelineEvents.count == 4)
        let invalidSaved = await store.create(draft(title: ""))
        assert(!invalidSaved)
        assert(store.day?.total == 4)
        let composer = InlineScheduleComposer()
        let clickTime = ISO8601DateFormatter().date(from: "\(Beijing.today)T08:38:00Z")!
        composer.activate(now: clickTime)
        assert(composer.draft.date == Beijing.today && composer.draft.start == "16:40" && composer.draft.end == "17:40")
        composer.commit(store: store)
        assert(!composer.editing && store.day?.total == 4, "Blank row must not create an empty event")
        composer.activate(now: clickTime)
        composer.title = "内联创建"
        composer.commit(store: store)
        composer.commit(store: store)
        for _ in 0..<100 where composer.saving { try await Task.sleep(for: .milliseconds(5)) }
        assert(store.day?.total == 5 && !composer.editing && composer.title.isEmpty, "Return plus click-away must only save once and reset blank row")
        composer.activate(now: clickTime)
        composer.title = "错误时间保留输入"
        composer.end = composer.start.addingTimeInterval(-60)
        composer.commit(store: store)
        assert(composer.editing && !composer.error.isEmpty && composer.title == "错误时间保留输入" && store.day?.total == 5)
        composer.end = composer.start.addingTimeInterval(3600)
        store.busy = true
        composer.commit(store: store)
        try await Task.sleep(for: .milliseconds(20))
        store.busy = false
        for _ in 0..<100 where composer.saving { try await Task.sleep(for: .milliseconds(5)) }
        assert(store.day?.total == 6 && !composer.saving && !composer.editing, "Wait for background sync before autosaving")
        print("PASS: ten-minute defaults, one-hour duration, empty-row reset, duplicate-submit protection, sync wait, retained invalid draft and native create validation.")
    }
}
