import Foundation

@main struct WidgetCompletionTests {
    @MainActor static func main() async throws {
        // Only this in-memory store and a separate local test port are used.
        let store = TodoStore(demo: true)
        let bridge = WidgetBridge(store: store)!
        bridge.start()
        let token = Bundle.main.object(forInfoDictionaryKey: "XipoWidgetBridgeToken") as! String
        let event = store.timelineEvents.first { !$0.completed }!
        let action = WidgetCompletionRequest(id: event.id, occurrenceDate: event.occurrence_date, date: Beijing.today, context: store.widgetActionContext)
        func post(_ data: Data, authorized: Bool = true) async throws -> Int {
            var request = URLRequest(url: URL(string: "http://127.0.0.1:\(WidgetSnapshotStore.port)/complete")!)
            request.httpMethod = "POST"; request.httpBody = data
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            if authorized { request.setValue(token, forHTTPHeaderField: "X-Xipo-Widget-Token") }
            let (_, response) = try await URLSession.shared.data(for: request)
            return (response as! HTTPURLResponse).statusCode
        }
        let body = try JSONEncoder().encode(action)
        let denied = try await post(body, authorized: false)
        assert(denied == 403 && store.day?.completed == 1)
        let malformed = try await post(Data("{}".utf8))
        assert(malformed == 400)
        for wrong in [WidgetCompletionRequest(id: event.id, occurrenceDate: nil, date: Beijing.today, context: "old-account"),
                      WidgetCompletionRequest(id: event.id, occurrenceDate: nil, date: "2020-01-01", context: store.widgetActionContext),
                      WidgetCompletionRequest(id: "another-account-event", occurrenceDate: nil, date: Beijing.today, context: store.widgetActionContext)] {
            let status = try await post(JSONEncoder().encode(wrong))
            assert(status == 409 && store.day?.completed == 1)
        }
        let success = try await post(body)
        assert(success == 200 && store.day?.completed == 2 && store.day?.pending == 1)
        let repeated = try await post(body)
        assert(repeated == 200 && store.day?.completed == 2)
        assert(store.widgetSnapshot?.tasks.first(where: { $0.id == event.id })?.completed == true)
        let cancelled = WidgetCompletionRequest(id: event.id, occurrenceDate: event.occurrence_date, date: Beijing.today, context: store.widgetActionContext, status: "cancelled")
        let cancelledStatus = try await post(JSONEncoder().encode(cancelled))
        assert(cancelledStatus == 200 && store.timelineEvents.first(where: { $0.id == event.id })?.taskStatus == "cancelled")
        let deferred = WidgetCompletionRequest(id: event.id, occurrenceDate: event.occurrence_date, date: Beijing.today, context: store.widgetActionContext, status: "deferred")
        let deferredStatus = try await post(JSONEncoder().encode(deferred))
        assert(deferredStatus == 200 && store.widgetSnapshot?.tasks.first(where: { $0.id == event.id })?.taskStatus == "deferred")
        let repeatedDefer = try await post(JSONEncoder().encode(deferred))
        assert(repeatedDefer == 200)
        let legacy = Data("{\"title\":\"旧版缓存\",\"start\":null,\"end\":null,\"completed\":false}".utf8)
        let decodedLegacy = try JSONDecoder().decode(WidgetTask.self, from: legacy)
        assert(decodedLegacy.id == nil)
        print("PASS: real local widget HTTP completion, token checks, invalid body, stale account/date, ownership, repeat-click idempotence, snapshot refresh and legacy cache.")
        withExtendedLifetime(bridge) {}
    }
}
