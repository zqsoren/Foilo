import Foundation

@main struct FloatingRailTests {
    @MainActor static func main() async throws {
        // In-memory demo data only; never signs in or writes a real task.
        let store = TodoStore(demo: true)
        let rail = FloatingRailState()
        let originalIDs = store.timelineEvents.map(\.id)
        let event = store.timelineEvents.first { !$0.completed }!
        var expanded = false
        rail.onSelectionChange = { expanded = $0 }
        rail.tap(event, store: store)
        assert(expanded && rail.selectedID == event.id)
        assert(store.day?.completed == 1, "First click must only show details")
        rail.tap(event, store: store)
        assert(!expanded && rail.selectedID == nil && store.day?.completed == 1, "Second single click must only hide details")
        rail.tap(event, store: store)
        rail.doubleTap(event, store: store)
        for _ in 0..<100 where rail.completingID != nil { try await Task.sleep(for: .milliseconds(5)) }
        assert(rail.completingID == nil)
        assert(store.day?.completed == 2 && store.day?.pending == 1)
        assert(store.timelineEvents.map(\.id) == originalIDs, "Completed circles must stay in place")
        let completed = store.timelineEvents.first { $0.id == event.id }!
        assert(completed.completed)
        assert(rail.selectedID == event.id, "Double click must not toggle details")
        rail.doubleTap(completed, store: store)
        for _ in 0..<100 where rail.completingID != nil { try await Task.sleep(for: .milliseconds(5)) }
        assert(store.day?.completed == 1 && store.day?.pending == 2, "Double click completed circle must cancel completion")
        assert(store.timelineEvents.map(\.id) == originalIDs)
        rail.dismissDetail()
        assert(!expanded && rail.selectedID == nil)
        let next = store.timelineEvents.first { !$0.completed }!
        rail.tap(next, store: store)
        store.busy = true
        rail.doubleTap(next, store: store)
        assert(rail.completingID == nil && store.day?.completed == 1, "Do not write during another sync")
        store.busy = false
        store.message = "网络连接失败"
        rail.doubleTap(next, store: store)
        assert(rail.completingID == nil && store.day?.completed == 1, "Do not falsely complete stale data")
        print("PASS: single-click reveal/hide, double-click complete/restore, stable order, retained tasks, busy/error protection.")
    }
}
