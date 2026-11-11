import SwiftUI

struct StatusCircle: View {
    @ObservedObject var store: TodoStore
    let event: ScheduleEvent
    var size: CGFloat = 23
    private func change(_ count: Int) {
        let desired = count == 3 ? (event.taskStatus == "cancelled" ? "pending" : "cancelled") : count == 2 ? (event.taskStatus == "deferred" ? "pending" : "deferred") : event.taskStatus == "deferred" ? "deferred" : event.completed ? "pending" : "completed"
        Task { await store.setStatus(event, status: desired) }
    }
    var body: some View {
        Image(systemName: event.statusSymbol)
            .font(.system(size: size, weight: .light))
            .foregroundStyle(event.taskStatus == "pending" || event.completed ? orange : Color.gray.opacity(event.taskStatus == "cancelled" ? 0.35 : 0.6))
            .frame(width: size + 8, height: 34).contentShape(Rectangle())
            .overlay(TaskClickSurface { change($0) })
            .allowsHitTesting(event.editable && store.canChange)
            .help("单击完成，双击推迟到明天，三击取消")
            .accessibilityElement(children: .ignore).accessibilityAddTraits(.isButton)
            .accessibilityLabel("\(event.title)，\(event.taskStatus)")
            .accessibilityAction { change(1) }
            .accessibilityAction(named: Text("推迟到明天")) { change(2) }
            .accessibilityAction(named: Text("取消任务")) { change(3) }
            .contextMenu {
                Button(event.completed ? "恢复待办" : "完成") { change(1) }
                Button(event.taskStatus == "deferred" ? "取消推迟" : "推迟到明天") { change(2) }
                Button(event.taskStatus == "cancelled" ? "恢复待办" : "取消任务") { change(3) }
            }
    }
}
