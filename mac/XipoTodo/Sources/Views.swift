import SwiftUI
import AppKit

let orange = Color(red: 231/255, green: 133/255, blue: 85/255)
let ink = Color(red: 45/255, green: 45/255, blue: 49/255)

struct TinyButton: View {
    let title: String
    let symbol: String
    let action: () -> Void
    var body: some View {
        Button(action: action) { Image(systemName: symbol).font(.system(size: 12)).frame(width: 25, height: 25).contentShape(Rectangle()) }
            .buttonStyle(.plain).foregroundStyle(.secondary).help(title).accessibilityLabel(title)
    }
}

struct EventRow: View {
    @ObservedObject var store: TodoStore
    let event: ScheduleEvent
    var compact = false
    var body: some View {
        HStack(spacing: compact ? 10 : 12) {
            StatusCircle(store: store, event: event, size: compact ? 20 : 23)
            Button { AppController.shared.showDetails(event) } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text(event.title).font(.system(size: compact ? 14 : 15, weight: .medium))
                        .foregroundStyle(event.taskStatus != "pending" ? Color.secondary : ink).lineLimit(1).strikethrough(event.completed)
                    Text(event.timeLabel).font(.system(size: 12)).monospacedDigit().foregroundStyle(.secondary)
                }.frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
            }.buttonStyle(.plain).help("查看日程详情")
        }.padding(.vertical, compact ? 6 : 10)
    }
}
struct EmptyDay: View {
    @ObservedObject var store: TodoStore
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(store.connected ? (store.busy ? "正在读取…" : "今天还没有日程") : "登录你的账号")
                .font(.system(size: 14, weight: .medium)).foregroundStyle(ink)
            Button(store.connected ? "新建日程" : "登录账号") {
                if store.connected { AppController.shared.showNewSchedule() }
                else { AppController.shared.showSettings() }
            }.buttonStyle(.plain).foregroundStyle(orange).font(.system(size: 12))
        }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    }
}
struct MainView: View {
    @ObservedObject var store: TodoStore
    @StateObject private var updater = LocalUpdater()
    @StateObject private var composer = InlineScheduleComposer()
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Text(Beijing.format(Date(), "M月d日 EEEE")).font(.system(size: 13)).foregroundStyle(.secondary)
                Spacer()
                TinyButton(title: "刷新日程", symbol: "arrow.clockwise") { Task { await store.refresh(forceWidgetReload: true) } }.disabled(store.busy)
                TinyButton(title: "设置", symbol: "gearshape") { AppController.shared.showSettings() }
            }.padding(.horizontal, 22).padding(.top, 22).padding(.bottom, 17)
            HStack(alignment: .firstTextBaseline, spacing: 5) {
                Text("今天").font(.system(size: 22, weight: .semibold)).foregroundStyle(ink)
                Text("\(store.day?.pending ?? 0) 项待办").font(.system(size: 12)).foregroundStyle(.secondary)
                Spacer()
                Text(store.day.map { "已完成 \($0.completed)/\($0.total)" } ?? "")
                    .font(.system(size: 11)).foregroundStyle(.secondary)
            }.padding(.horizontal, 22)
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule().fill(orange.opacity(0.16))
                    Capsule().fill(orange).frame(width: geometry.size.width * progress)
                }
            }.frame(height: 5).padding(.horizontal, 22).padding(.top, 11).padding(.bottom, 13)
            Divider().padding(.horizontal, 22)
            if store.connected {
                ScrollViewReader { reader in
                ScrollView {
                    VStack(spacing: 0) {
                        ForEach(store.events) { event in
                            EventRow(store: store, event: event)
                            Divider().opacity(0.65)
                        }
                        InlineScheduleRow(store: store, composer: composer).id("inline-new-schedule")
                    }.padding(.horizontal, 22).padding(.vertical, 6)
                    .frame(maxWidth: .infinity, alignment: .topLeading)
                }
                .onReceive(NotificationCenter.default.publisher(for: InlineScheduleComposer.beginNotification)) { _ in
                    composer.activate()
                    withAnimation(.easeOut(duration: 0.2)) { reader.scrollTo("inline-new-schedule", anchor: .bottom) }
                }
                }
            } else {
                EmptyDay(store: store).padding(22)
            }
            if !store.message.isEmpty {
                Text(store.message).font(.system(size: 11)).foregroundStyle(.brown)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 22).padding(.bottom, 8)
            }
            Divider()
            HStack(spacing: 14) {
                Button("AI 助手") { AppController.shared.openWeb("/todo?tab=chat") }
                Spacer()
                Button(updater.busy ? "更新中…" : "更新应用") { updater.update() }
                    .disabled(updater.busy || store.demo)
            }.buttonStyle(.plain).font(.system(size: 12, weight: .medium))
                .foregroundStyle(orange).padding(.horizontal, 22).padding(.vertical, 14)
            if !updater.status.isEmpty {
                Text(updater.status).font(.system(size: 10)).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 22).padding(.bottom, 12)
            }
        }
        .frame(minWidth: 380, minHeight: 440)
        .background(Color(nsColor: .windowBackgroundColor))
    }
    private var progress: CGFloat {
        guard let day = store.day, day.total > 0 else { return 0 }
        return CGFloat(day.completed) / CGFloat(day.total)
    }
}
struct FloatingGlass: NSViewRepresentable {
    var cornerRadius: CGFloat = 29
    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = .hudWindow
        view.blendingMode = .behindWindow
        view.state = .active
        view.appearance = NSAppearance(named: .aqua)
        view.wantsLayer = true
        view.layer?.cornerRadius = cornerRadius
        view.layer?.masksToBounds = true
        return view
    }
    func updateNSView(_ nsView: NSVisualEffectView, context: Context) {}
}

struct BallView: View {
    @ObservedObject var store: TodoStore
    var body: some View {
        ZStack {
            FloatingGlass()
                .overlay(Circle().fill(orange.opacity(0.18)))
                .overlay(Circle().strokeBorder(.white.opacity(0.65), lineWidth: 0.75))
                .clipShape(Circle())
                .frame(width: 58, height: 58)
                .shadow(color: .black.opacity(0.10), radius: 2, y: 1)
                .allowsHitTesting(false)
            VStack(spacing: 1) {
                Text(store.connected && store.day != nil ? "\(store.day?.pending ?? 0)" : "–")
                    .font(.system(size: 22, weight: .medium, design: .rounded))
                    .monospacedDigit()
                Text(store.message.isEmpty ? "待办" : "待同步")
                    .font(.system(size: 9, weight: .medium))
                    .opacity(0.8)
            }.foregroundStyle(Color(red: 0.57, green: 0.27, blue: 0.12)).allowsHitTesting(false)
            BallInteraction().accessibilityLabel("展开今日待办，拖动可移动悬浮球")
        }.frame(width: 64, height: 64)
    }
}
struct SettingsView: View {
    @ObservedObject var store: TodoStore
    @State private var phone = ""
    @State private var password = ""
    @State private var confirmDisconnect = false
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack {
                RoundedRectangle(cornerRadius: 12).fill(orange).frame(width: 42, height: 42).overlay(Image(systemName: "checkmark").font(.title2.bold()).foregroundStyle(.white))
                VStack(alignment: .leading, spacing: 4) {
                    Text("DIGTODO").font(.system(size: 21, weight: .semibold))
                    Text(store.demo ? "设计预览 · 示例数据" : "MAC").foregroundStyle(.secondary).font(.system(size: 12))
                }
                Spacer()
                Text(store.connected ? "已登录" : "未登录").font(.system(size: 12)).foregroundStyle(store.connected ? Color.green : .secondary)
            }
            VStack(alignment: .leading, spacing: 10) {
                Text("登录账号").font(.headline)
                if store.connected {
                    Text(store.demo ? "示例账号" : (store.day?.account?.name ?? "已登录日程账号")).font(.system(size: 15, weight: .medium))
                    if !store.demo { Button("退出登录", role: .destructive) { confirmDisconnect = true }.disabled(store.busy) }
                } else {
                    Text("使用人生工作台的手机号和密码。").font(.system(size: 12)).foregroundStyle(.secondary)
                    TextField("手机号", text: $phone).textFieldStyle(.roundedBorder).textContentType(.username).disabled(store.busy)
                    SecureField("密码", text: $password).textFieldStyle(.roundedBorder).textContentType(.password).disabled(store.busy)
                        .onSubmit { submitLogin() }
                    HStack {
                        Button("注册账号") { AppController.shared.openWeb("/login") }
                        Spacer()
                        Button(store.busy ? "登录中…" : "登录") { submitLogin() }
                            .buttonStyle(.borderedProminent).tint(orange).disabled(phone.isEmpty || password.isEmpty || store.busy || store.demo)
                    }
                    Text("密码不会保存在本机，登录凭证保存在系统钥匙串。").font(.system(size: 10)).foregroundStyle(.secondary)
                }
            }
            Divider()
            HStack(spacing: 24) {
                Toggle("显示悬浮球", isOn: $store.showBall)
                Toggle("登录 Mac 时自动启动", isOn: Binding(get: { store.loginEnabled }, set: { store.setLogin($0) })).disabled(store.demo)
            }.toggleStyle(.switch).tint(orange).controlSize(.small).font(.system(size: 13))
            VStack(alignment: .leading, spacing: 6) {
                DisclosureGroup("Mac 系统小组件") { Text("在桌面空白处点右键 → 编辑小组件 → 搜索“DIGTODO” → 选择大小并添加。放置和排列由 macOS 管理。")
                    .font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true) }
                if !store.widgetBridgeReady && !store.demo {
                    Text("小组件连接尚未就绪，请退出并重新打开 DIGTODO。")
                        .font(.system(size: 11)).foregroundStyle(.brown)
                }
            }
            if !store.message.isEmpty { Text(store.message).font(.system(size: 12)).foregroundStyle(.brown).fixedSize(horizontal: false, vertical: true) }
            HStack {
                Text("1.2 · 本机版").font(.system(size: 10)).foregroundStyle(.tertiary)
                Spacer()
                Button("退出 DIGTODO") { NSApp.terminate(nil) }.buttonStyle(.plain).font(.system(size: 11)).foregroundStyle(.secondary)
            }
        }.padding(26).frame(width: 460).background(Color(nsColor: .windowBackgroundColor))
            .alert("退出这个 Mac 的账号？", isPresented: $confirmDisconnect) {
                Button("取消", role: .cancel) {}
                Button("退出登录", role: .destructive) { Task { await store.logout() } }
            } message: { Text("会清除本机登录状态和日程显示，不影响手机登录，也不会删除任何日程。") }
    }
    private func submitLogin() {
        guard !store.busy, !phone.isEmpty, !password.isEmpty else { return }
        Task { let success = await store.login(phone: phone, password: password); password = ""; if success { phone = "" } }
    }
}
struct DetailsView: View {
    let event: ScheduleEvent
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(event.title).font(.title2.bold()).textSelection(.enabled)
            Text("\(event.date) · \(event.timeLabel) · 北京时间").font(.system(size: 12)).foregroundStyle(.secondary)
            Label(event.completed ? "已完成" : "未完成", systemImage: event.completed ? "checkmark.circle.fill" : "circle").foregroundStyle(orange)
            ScrollView { Text(event.notes.isEmpty ? "暂无备注" : event.notes).font(.system(size: 13)).frame(maxWidth: .infinity, alignment: .leading).textSelection(.enabled) }.frame(maxHeight: 160)
            Divider()
            Button("在完整日程中编辑") { AppController.shared.openWeb("/todo") }
        }.padding(24).frame(width: 380).background(Color(nsColor: .windowBackgroundColor))
    }
}

struct WindowDragHandle: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView { DragView() }
    func updateNSView(_ nsView: NSView, context: Context) {}
    final class DragView: NSView {
        override func mouseDown(with event: NSEvent) { window?.performDrag(with: event) }
        override var mouseDownCanMoveWindow: Bool { true }
    }
}
struct BallInteraction: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView { BallMouseView() }
    func updateNSView(_ nsView: NSView, context: Context) {}
    final class BallMouseView: NSView {
        private var down: NSPoint?
        private var original: NSPoint?
        private var moved = false
        override func mouseDown(with event: NSEvent) { down = NSEvent.mouseLocation; original = window?.frame.origin; moved = false }
        override func mouseDragged(with event: NSEvent) {
            guard let down, let original else { return }
            let now = NSEvent.mouseLocation
            if hypot(now.x - down.x, now.y - down.y) > 3 { moved = true }
            if moved { window?.setFrameOrigin(NSPoint(x: original.x + now.x - down.x, y: original.y + now.y - down.y)) }
        }
        override func mouseUp(with event: NSEvent) {
            if !moved { AppController.shared.expand() } else { AppController.shared.clampWindows() }
            down = nil; original = nil
        }
        override func rightMouseDown(with event: NSEvent) { AppController.shared.showSettings() }
        override func accessibilityPerformPress() -> Bool { AppController.shared.expand(); return true }
        override func isAccessibilityElement() -> Bool { true }
        override func accessibilityRole() -> NSAccessibility.Role? { .button }
        override func accessibilityLabel() -> String? { "展开今日待办" }
    }
}
