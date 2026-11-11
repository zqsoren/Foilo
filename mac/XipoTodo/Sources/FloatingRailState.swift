import SwiftUI

@MainActor final class FloatingRailState: ObservableObject {
    @Published var selectedID: String?
    @Published var completingID: String?
    @Published var extendsLeft = true
    @Published var revealed = false
    @Published var height: CGFloat = 440
    var onSelectionChange: ((Bool) -> Void)?

    func reset() {
        selectedID = nil
        revealed = false
    }

    func tap(_ event: ScheduleEvent, store: TodoStore) {
        if selectedID == event.id { dismissDetail() }
        else { selectedID = event.id; onSelectionChange?(true) }
    }

    func doubleTap(_ event: ScheduleEvent, store: TodoStore) {
        guard completingID == nil, store.canChange,
              let current = store.timelineEvents.first(where: { $0.id == event.id && $0.occurrence_date == event.occurrence_date }),
              current.editable else { return }
        completingID = current.id
        Task {
            await store.setCompletion(current, completed: !current.completed)
            completingID = nil
        }
    }

    func statusTap(_ event: ScheduleEvent, count: Int, store: TodoStore) {
        guard completingID == nil, store.canChange, event.editable else { return }
        completingID = event.id
        let status = count == 3 ? (event.taskStatus == "cancelled" ? "pending" : "cancelled") : count == 2 ? (event.taskStatus == "deferred" ? "pending" : "deferred") : event.taskStatus == "deferred" ? "deferred" : event.completed ? "pending" : "completed"
        Task { await store.setStatus(event, status: status); completingID = nil }
    }
    func dismissDetail() {
        selectedID = nil
        onSelectionChange?(false)
    }
}

