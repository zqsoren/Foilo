import SwiftUI
import ServiceManagement
import WidgetKit

@MainActor final class TodoStore: ObservableObject {
    @Published var day: DaySchedule?
    @Published var connected = false
    @Published var busy = false
    @Published var message = ""
    @Published var updatedAt: Date?
    @Published var showBall: Bool { didSet { persist("showBall", showBall); onVisibilityChange?() } }
    @Published var loginEnabled = false
    @Published var widgetBridgeReady = false
    @Published var sessionRestoring: Bool
    let demo: Bool
    var onVisibilityChange: (() -> Void)?
    private var api: TodoAPI?
    private var generation = UUID()
    private var publishedWidgetThisLaunch = false
    var widgetActionContext: String { generation.uuidString }
    init(demo: Bool = false) {
        self.demo = demo
        sessionRestoring = !demo
        let defaults = UserDefaults.standard
        showBall = demo || (defaults.object(forKey: "showBall") as? Bool ?? true)
        if demo {
            let date = Beijing.today
            day = DaySchedule(date: date, today: date, revision: 0, total: 3, completed: 1, pending: 2, next_offset: nil, events: [
                ScheduleEvent(id: "demo-1", title: "整理资料", date: date, start: "09:00", end: "09:30", notes: "整理研究资料和写作提纲。", completed: true, occurrence_date: nil, editable: false),
                ScheduleEvent(id: "demo-2", title: "写论文", date: date, start: "14:00", end: "16:00", notes: "完成论文的一个小节。", completed: false, occurrence_date: nil, editable: true),
                ScheduleEvent(id: "demo-3", title: "健身", date: date, start: "16:05", end: "17:05", notes: "", completed: false, occurrence_date: nil, editable: true)
            ])
            connected = true; updatedAt = Date()
        }
        loginEnabled = SMAppService.mainApp.status == .enabled
    }
    func restoreSession() async {
        guard !demo else { return }
        let id = generation
        let token = await Task.detached(priority: .userInitiated) { Credentials.read() }.value
        guard id == generation, api == nil else { sessionRestoring = false; return }
        sessionRestoring = false
        if let token { api = TodoAPI(token: token); connected = true; await refresh() }
        else { connected = false; clearWidget() }
    }
    private func persist(_ key: String, _ value: Bool) { if !demo { UserDefaults.standard.set(value, forKey: key) } }
    var events: [ScheduleEvent] {
        guard day?.date == Beijing.today else { return [] }
        return day?.events.sorted { a, b in
            if a.completed != b.completed { return !a.completed }
            if a.start != b.start { return (a.start ?? "99:99") < (b.start ?? "99:99") }
            return a.id < b.id
        } ?? []
    }
    // The floating rail must not move or remove a task when it is completed.
    var timelineEvents: [ScheduleEvent] {
        guard day?.date == Beijing.today else { return [] }
        return day?.events.sorted { a, b in
            if a.start != b.start { return (a.start ?? "99:99") < (b.start ?? "99:99") }
            return a.id < b.id
        } ?? []
    }
    var canChange: Bool { connected && !busy && message.isEmpty && day?.date == Beijing.today }
    var date: Date { day.map { Beijing.date($0.date) } ?? Date() }
    var freshness: String {
        if demo { return "示例预览 · 未登录" }
        if !message.isEmpty { return message }
        if busy { return "正在同步…" }
        if let date = updatedAt { return "\(Beijing.format(date, "HH:mm")) 更新 · 北京时间" }
        return connected ? "正在读取日程…" : "登录后显示日程"
    }
    func login(phone: String, password: String) async -> Bool {
        guard !demo, !busy else { return false }
        let number = phone.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: "-", with: "")
        guard number.range(of: "^1[3-9][0-9]{9}$", options: .regularExpression) != nil, !password.isEmpty else { message = "请输入手机号和密码。"; return false }
        busy = true; message = ""
        let id = generation
        defer { if id == generation { busy = false } }
        do {
            let token = try await TodoAPI.login(phone: number, password: password)
            let client = TodoAPI(token: token)
            do {
                let snapshot = try await client.readToday()
                guard id == generation else { try? await client.logout(); return false }
                try Credentials.save(token)
                api = client; day = snapshot; connected = true; sessionRestoring = false; updatedAt = Date(); updateWidget()
                return true
            } catch { try? await client.logout(); throw error }
        } catch { if id == generation { message = readable(error) }; return false }
    }
    func refresh(forceWidgetReload: Bool = false) async {
        guard !demo, !busy, let api else { return }
        if day?.date != Beijing.today { day = nil; updatedAt = nil; clearWidget() }
        busy = true
        let id = generation
        defer { if id == generation { busy = false } }
        do {
            let snapshot = try await api.readToday()
            guard id == generation else { return }
            day = snapshot; updatedAt = Date(); message = ""; updateWidget(forceReload: forceWidgetReload)
        } catch {
            guard id == generation else { return }
            message = readable(error)
            if case APIError.unauthorized = error { day = nil; updatedAt = nil; connected = false; self.api = nil; clearWidget() }
        }
    }
    func complete(_ event: ScheduleEvent) async {
        await setStatus(event, status: event.completed ? "pending" : "completed")
    }
    func create(_ draft: NewSchedule) async -> Bool {
        guard connected, !busy else { message = "请先登录，并等待当前同步完成。"; return false }
        if let reason = draft.validationError() { message = reason; return false }
        if demo {
            message = ""
            if draft.date == Beijing.today {
                day?.events.append(ScheduleEvent(id: draft.id, title: draft.title, date: draft.date, start: draft.start, end: draft.end, notes: draft.notes, completed: false, occurrence_date: nil, editable: true))
                if let day { self.day = DaySchedule(account: day.account, date: day.date, today: day.today, revision: day.revision + 1, total: day.events.count, completed: day.completed, pending: day.pending + 1, next_offset: nil, events: day.events) }
            }
            return true
        }
        guard let api else { message = "登录已过期，请重新登录。"; return false }
        busy = true; message = ""
        let id = generation
        defer { if id == generation { busy = false } }
        do {
            let before = try await api.readToday()
            guard id == generation else { return false }
            try await api.create(draft, revision: before.revision)
            guard id == generation else { return false }
            do {
                day = try await api.readToday()
                guard id == generation else { return false }
                updatedAt = Date(); updateWidget()
            } catch {
                message = "日程已保存，暂时无法刷新列表，请稍后点击刷新。"
            }
            return true
        } catch {
            guard id == generation else { return false }
            message = readable(error)
            if case APIError.unauthorized = error { day = nil; connected = false; self.api = nil; clearWidget() }
            return false
        }
    }
    func setCompletion(_ event: ScheduleEvent, completed: Bool) async {
        await setStatus(event, status: completed ? "completed" : "pending")
    }
    func setStatus(_ event: ScheduleEvent, status: String) async {
        let completed = status == "completed"
        guard canChange, event.editable, event.date == Beijing.today, let snapshot = day,
              let current = snapshot.events.first(where: { $0.id == event.id && $0.occurrence_date == event.occurrence_date }),
              current.taskStatus != status else { return }
        if demo {
            if let i = day?.events.firstIndex(where: { $0.id == event.id }) {
                day?.events[i].completed = completed
                day?.events[i].status = status
                if let events = day?.events { day?.completed = events.filter { $0.completed }.count; day?.pending = events.filter { $0.taskStatus == "pending" }.count }
            }
            return
        }
        guard let api else { return }
        busy = true; let id = generation
        defer { if id == generation { busy = false } }
        do {
            try await api.complete(current, revision: snapshot.revision, completed: completed, status: status)
            let fresh = try await api.readToday()
            guard id == generation else { return }
            day = fresh; updatedAt = Date(); message = ""; updateWidget()
        } catch {
            guard id == generation else { return }
            // Do not retry a write with a new request ID after a timeout: read its actual result.
            let reason = readable(error)
            if case APIError.unauthorized = error { day = nil; connected = false; self.api = nil; message = reason; clearWidget(); return }
            if let fresh = try? await api.readToday(), id == generation { day = fresh; updatedAt = Date(); updateWidget() }
            if id == generation { message = reason }
        }
    }
    func logout() async {
        guard !demo, !busy else { return }
        busy = true
        var revoked = true
        do { try await api?.logout() } catch { revoked = false }
        do {
            try Credentials.remove()
            generation = UUID(); api = nil; day = nil; updatedAt = nil; connected = false; sessionRestoring = false; busy = false; clearWidget()
            message = revoked ? "" : "已退出本机。网络未连接，服务器会话将在有效期结束后失效。"
        } catch { busy = false; message = readable(error) }
    }
    func completeFromWidget(_ action: WidgetCompletionRequest) async throws {
        let originalContext = widgetActionContext
        guard action.context == originalContext, action.date == Beijing.today, connected else {
            throw APIError.message("小组件内容已更新，请刷新后重试。")
        }
        for _ in 0..<250 where busy && connected { try await Task.sleep(for: .milliseconds(100)) }
        guard !busy, connected, widgetActionContext == originalContext else { throw APIError.message("正在同步，请稍后重试。") }
        await refresh()
        guard connected, widgetActionContext == originalContext, message.isEmpty,
              let event = timelineEvents.first(where: { $0.id == action.id && $0.occurrence_date == action.occurrenceDate && $0.date == action.date }) else {
            throw APIError.message(message.isEmpty ? "这项日程已变化，请刷新小组件。" : message)
        }
        let desired = action.status ?? "completed"
        guard ["pending", "completed", "cancelled", "deferred"].contains(desired) else { throw APIError.message("不支持的状态") }
        if event.taskStatus == desired { return }
        guard event.editable else { throw APIError.message("这项日程暂时无法修改。") }
        await setStatus(event, status: desired)
        guard connected, widgetActionContext == originalContext, message.isEmpty,
              timelineEvents.contains(where: { $0.id == action.id && $0.occurrence_date == action.occurrenceDate && $0.taskStatus == desired }) else {
            throw APIError.message(message.isEmpty ? "完成状态未保存，请稍后重试。" : message)
        }
    }
    func setLogin(_ enabled: Bool) {
        do {
            if enabled { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
            loginEnabled = SMAppService.mainApp.status == .enabled
            message = SMAppService.mainApp.status == .requiresApproval ? "请在系统设置 → 登录项中允许 DIGTODO。" : ""
        } catch { message = "自动启动设置未成功。请先把应用放入「应用程序」，再重试。" }
    }
    var widgetSnapshot: WidgetSnapshot? {
        guard connected, let day, day.date == Beijing.today else { return nil }
        let tasks = timelineEvents.map { WidgetTask(title: $0.title, start: $0.start, end: $0.end, completed: $0.completed, id: $0.id, occurrenceDate: $0.occurrence_date, editable: $0.editable, status: $0.taskStatus) }
        return WidgetSnapshot(date: day.date, updatedAt: updatedAt ?? Date(), total: day.total, completed: day.completed, pending: day.pending, tasks: tasks, actionContext: widgetActionContext)
    }
    private func updateWidget(forceReload: Bool = false) {
        guard !demo, let next = widgetSnapshot else { return }
        let previous = WidgetSnapshotStore.read()
        let changed = previous?.date != next.date || previous?.total != next.total ||
            previous?.completed != next.completed || previous?.pending != next.pending || previous?.tasks != next.tasks
        WidgetSnapshotStore.save(next)
        // A new app build can change the widget view without changing any tasks.
        if changed || forceReload || !publishedWidgetThisLaunch {
            WidgetCenter.shared.reloadTimelines(ofKind: WidgetSnapshotStore.kind)
        }
        publishedWidgetThisLaunch = true
    }
    private func clearWidget() {
        guard !demo else { return }
        WidgetSnapshotStore.clear()
        WidgetCenter.shared.reloadTimelines(ofKind: WidgetSnapshotStore.kind)
    }
    private func readable(_ error: Error) -> String {
        if let error = error as? APIError { return error.localizedDescription }
        return "网络连接失败，显示的是上次同步的内容；请刷新后再操作。"
    }
}
