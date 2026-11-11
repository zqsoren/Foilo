import SwiftUI
import WidgetKit
import AppIntents

private let widgetOrange = Color(red: 0.91, green: 0.39, blue: 0.16)
private let widgetInk = Color(red: 0.18, green: 0.17, blue: 0.17)
private let widgetDivider = Color(red: 0.91, green: 0.89, blue: 0.88)

private enum WidgetCache {
    static let key = "cached-today-v1"
    static func read() -> WidgetSnapshot? {
        guard let data = UserDefaults.standard.data(forKey: key),
              let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data),
              snapshot.date == WidgetSnapshotStore.today else { return nil }
        return snapshot
    }
    static func save(_ snapshot: WidgetSnapshot) {
        UserDefaults.standard.set(try? JSONEncoder().encode(snapshot), forKey: key)
    }
    static func clear() { UserDefaults.standard.removeObject(forKey: key) }
}

private enum WidgetBridgeClient {
    static func complete(_ action: WidgetCompletionRequest) async throws {
        defer { WidgetCenter.shared.reloadTimelines(ofKind: WidgetSnapshotStore.kind) }
        guard let token = Bundle.main.object(forInfoDictionaryKey: "XipoWidgetBridgeToken") as? String,
              let url = URL(string: "http://127.0.0.1:\(WidgetSnapshotStore.port)/complete") else {
            throw WidgetActionError(message: "请打开 DIGTODO后重试。")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 55
        request.setValue(token, forHTTPHeaderField: "X-Xipo-Widget-Token")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(action)
        let data: Data, response: URLResponse
        do { (data, response) = try await URLSession.shared.data(for: request) }
        catch { throw WidgetActionError(message: "暂时无法连接，请确认 DIGTODO正在运行。") }
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            let body = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            throw WidgetActionError(message: body?["error"] as? String ?? "未能保存，请稍后重试。")
        }
        _ = await fetch()
    }
    static func fetch() async -> WidgetSnapshot? {
        guard let token = Bundle.main.object(forInfoDictionaryKey: "XipoWidgetBridgeToken") as? String,
              let url = URL(string: "http://127.0.0.1:\(WidgetSnapshotStore.port)/snapshot") else { return WidgetCache.read() }
        var request = URLRequest(url: url)
        request.timeoutInterval = 3
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue(token, forHTTPHeaderField: "X-Xipo-Widget-Token")
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200,
                  let payload = try? JSONDecoder().decode(WidgetBridgePayload.self, from: data) else { return WidgetCache.read() }
            if payload.status == "pending" { return WidgetCache.read() }
            guard payload.status == "connected", let snapshot = payload.snapshot,
                  snapshot.date == WidgetSnapshotStore.today else { WidgetCache.clear(); return nil }
            WidgetCache.save(snapshot)
            return snapshot
        } catch { return WidgetCache.read() }
    }
}

private struct WidgetActionError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

struct CompleteWidgetTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "完成日程"
    static var openAppWhenRun: Bool = false
    static var isDiscoverable: Bool = false
    @Parameter(title: "日程标识") var eventID: String
    @Parameter(title: "重复日期") var occurrenceDate: String
    @Parameter(title: "日程日期") var date: String
    @Parameter(title: "当前账号会话") var context: String
    @Parameter(title: "目标状态") var status: String
    init() {}
    init(eventID: String, occurrenceDate: String?, date: String, context: String, status: String = "completed") {
        self.eventID = eventID; self.occurrenceDate = occurrenceDate ?? "-"
        self.date = date; self.context = context; self.status = status
    }
    func perform() async throws -> some IntentResult {
        try await WidgetBridgeClient.complete(WidgetCompletionRequest(id: eventID, occurrenceDate: occurrenceDate == "-" ? nil : occurrenceDate, date: date, context: context, status: status))
        return .result()
    }
}

struct TodayEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
}

struct TodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry {
        TodayEntry(date: Date(), snapshot: WidgetSnapshot(date: WidgetSnapshotStore.today, updatedAt: Date(), total: 3, completed: 1, pending: 2, tasks: [
            WidgetTask(title: "整理资料", start: "09:00", end: "09:30", completed: true),
            WidgetTask(title: "写论文", start: "14:00", end: "16:00", completed: false),
            WidgetTask(title: "健身", start: "16:05", end: "17:05", completed: false)
        ]))
    }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        if context.isPreview { completion(placeholder(in: context)); return }
        Task { completion(TodayEntry(date: Date(), snapshot: await WidgetBridgeClient.fetch())) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        Task {
            let entry = TodayEntry(date: Date(), snapshot: await WidgetBridgeClient.fetch())
            completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(15 * 60))))
        }
    }
}

private struct TaskLine: View {
    let task: WidgetTask
    let snapshot: WidgetSnapshot?
    var body: some View {
        HStack(spacing: 7) {
            if task.taskStatus == "pending", task.editable == true, let id = task.id, let snapshot, let context = snapshot.actionContext {
                Button(intent: CompleteWidgetTaskIntent(eventID: id, occurrenceDate: task.occurrenceDate, date: snapshot.date, context: context, status: task.taskStatus == "pending" ? "completed" : "pending")) {
                    Image(systemName: task.statusSymbol).font(.system(size: 13))
                        .foregroundStyle(widgetOrange.opacity(0.75))
                        .frame(width: 22, height: 24).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(task.taskStatus == "pending" ? "完成" : "恢复待办")：\(task.title)")
                .invalidatableContent()
            } else {
                Image(systemName: task.statusSymbol)
                    .font(.system(size: 13))
                    .foregroundStyle(task.completed ? widgetOrange : widgetOrange.opacity(0.75))
                    .frame(width: 22, height: 24)
                    .accessibilityLabel(task.completed ? "已完成" : "未完成")
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(task.title)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(task.taskStatus != "pending" ? Color.secondary : widgetInk)
                    .lineLimit(1)
                    .strikethrough(task.completed)
                if let start = task.start {
                    Text("\(start)–\(task.end ?? "")")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
            }
            Spacer(minLength: 0)
            if task.taskStatus == "pending", task.editable == true, let id = task.id, let snapshot, let context = snapshot.actionContext {
                Button(intent: CompleteWidgetTaskIntent(eventID: id, occurrenceDate: task.occurrenceDate, date: snapshot.date, context: context, status: task.taskStatus == "deferred" ? "pending" : "deferred")) { Image(systemName: "chevron.right").frame(width: 18, height: 24) }.buttonStyle(.plain).accessibilityLabel("\(task.taskStatus == "deferred" ? "取消推迟" : "推迟到明天")：\(task.title)")
                Button(intent: CompleteWidgetTaskIntent(eventID: id, occurrenceDate: task.occurrenceDate, date: snapshot.date, context: context, status: task.taskStatus == "cancelled" ? "pending" : "cancelled")) { Image(systemName: "minus").frame(width: 18, height: 24) }.buttonStyle(.plain).accessibilityLabel("\(task.taskStatus == "cancelled" ? "恢复待办" : "取消")：\(task.title)")
            }
        }
        .font(.system(size: 11)).foregroundStyle(.secondary)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
    }
}

private struct TodayWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TodayEntry

    private var pendingTasks: [WidgetTask] {
        entry.snapshot?.tasks ?? []
    }

    private var dayNumber: String {
        let formatter = DateFormatter()
        formatter.timeZone = TimeZone(identifier: "Asia/Shanghai")
        formatter.dateFormat = "d"
        return formatter.string(from: entry.date)
    }

    private var monthWeekday: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.timeZone = TimeZone(identifier: "Asia/Shanghai")
        formatter.dateFormat = "M月 EEE"
        return formatter.string(from: entry.date)
    }

    var body: some View {
        Group {
            if family == .systemSmall { smallBody }
            else { splitBody }
        }
        .containerBackground(.white, for: .widget)
        .widgetURL(URL(string: "xipo-todo://today"))
    }

    private var smallBody: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .firstTextBaseline) {
                Text(dayNumber).font(.system(size: 29, weight: .bold, design: .rounded))
                Text(monthWeekday).font(.system(size: 10, weight: .medium))
                Spacer(minLength: 0)
            }
            .foregroundStyle(widgetOrange)
            Text("\(entry.snapshot?.completed ?? 0)/\(entry.snapshot?.total ?? 0) 已完成")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.secondary)
            Spacer(minLength: 1)
            if let first = pendingTasks.first { TaskLine(task: first, snapshot: entry.snapshot) }
            else { emptyMessage }
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var splitBody: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                Text(dayNumber)
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                Text(monthWeekday)
                    .font(.system(size: 10, weight: .medium))
                    .padding(.top, 2)
                Spacer(minLength: 12)
                Rectangle()
                    .fill(widgetDivider)
                    .frame(height: 1)
                    .padding(.bottom, 10)
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text("\(entry.snapshot?.completed ?? 0)")
                        .font(.system(size: 17, weight: .semibold, design: .rounded))
                        .foregroundStyle(widgetOrange)
                    Text("已完成")
                        .font(.system(size: 9))
                        .foregroundStyle(.secondary)
                }
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text("\(entry.snapshot?.pending ?? 0)")
                        .font(.system(size: 17, weight: .semibold, design: .rounded))
                        .foregroundStyle(widgetInk)
                    Text("未完成")
                        .font(.system(size: 9))
                        .foregroundStyle(.secondary)
                }
                .padding(.top, 5)
            }
            .foregroundStyle(widgetOrange)
            .padding(.leading, 12)
            .padding(.trailing, 10)
            .padding(.vertical, 13)
            .frame(width: 94)
            .frame(maxHeight: .infinity)
            .overlay(alignment: .trailing) {
                Rectangle().fill(widgetDivider).frame(width: 1).padding(.vertical, 12)
            }
            VStack(alignment: .leading, spacing: family == .systemLarge ? 13 : 10) {
                if pendingTasks.isEmpty { emptyMessage }
                else {
                    ForEach(Array(pendingTasks.prefix(family == .systemLarge ? 6 : 3).enumerated()), id: \.offset) { _, task in
                        TaskLine(task: task, snapshot: entry.snapshot)
                    }
                }
                Spacer(minLength: 0)
                if let snapshot = entry.snapshot {
                    HStack {
                        if snapshot.tasks.count > (family == .systemLarge ? 6 : 3) {
                            Text("还有 \(snapshot.tasks.count - (family == .systemLarge ? 6 : 3)) 项")
                        }
                        Spacer(minLength: 0)
                        Text("\(Self.time(snapshot.updatedAt)) 更新")
                    }
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 13)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }

    private var emptyMessage: some View {
        Text(entry.snapshot == nil ? "打开 DIGTODO同步今天的安排" : "今天还没有日程")
            .font(.system(size: 12))
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private static func time(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.timeZone = TimeZone(identifier: "Asia/Shanghai")
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }
}

@main struct XipoTodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetSnapshotStore.kind, provider: TodayProvider()) { entry in
            TodayWidgetView(entry: entry)
        }
        .configurationDisplayName("DIGTODO")
        .description("查看今天的安排和完成情况。")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
