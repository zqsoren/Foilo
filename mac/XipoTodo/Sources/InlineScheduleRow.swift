import SwiftUI
import AppKit

struct InlineScheduleRow: View {
    @ObservedObject var store: TodoStore
    @ObservedObject var composer: InlineScheduleComposer
    @FocusState private var titleFocused: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "circle")
                .font(.system(size: 23, weight: .light))
                .foregroundStyle(composer.editing ? orange.opacity(0.8) : Color.gray.opacity(0.4))
                .frame(width: 30, height: 34)
                .allowsHitTesting(false)
            if composer.editing {
                VStack(alignment: .leading, spacing: 5) {
                    TextField("", text: $composer.title)
                        .font(.system(size: 15, weight: .medium))
                        .focused($titleFocused).frame(height: 34)
                        .accessibilityLabel("新日程标题")
                        .onSubmit { composer.commit(store: store) }
                    TextField("备注", text: $composer.notes)
                        .font(.system(size: 11)).foregroundStyle(.secondary)
                        .accessibilityLabel("新日程备注")
                        .onSubmit { composer.commit(store: store) }
                    HStack(spacing: 7) {
                        HStack(spacing: 2) {
                            Text("日期")
                            DatePicker("日期", selection: $composer.date,
                                       in: InlineScheduleComposer.calendar.startOfDay(for: Date())..., displayedComponents: .date)
                                .labelsHidden().fixedSize()
                        }
                        HStack(spacing: 2) {
                            Text("开始")
                            DatePicker("开始", selection: $composer.start, displayedComponents: .hourAndMinute)
                                .labelsHidden().fixedSize()
                        }
                        HStack(spacing: 2) {
                            Text("结束")
                            DatePicker("结束", selection: $composer.end, displayedComponents: .hourAndMinute)
                                .labelsHidden().fixedSize()
                        }
                    }
                    .font(.system(size: 9)).foregroundStyle(.secondary).controlSize(.mini)
                    .environment(\.timeZone, InlineScheduleComposer.calendar.timeZone)
                    .environment(\.locale, Locale(identifier: "zh_CN"))
                    .padding(.top, 3)
                    if !composer.error.isEmpty {
                        Text(composer.error).font(.system(size: 11)).foregroundStyle(.red)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if composer.saving { ProgressView().controlSize(.mini).accessibilityLabel("正在保存日程") }
                }.textFieldStyle(.plain).disabled(composer.saving)
            } else {
                Color.clear.frame(height: 34)
            }
        }
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .onTapGesture {
            if store.connected && !composer.editing { composer.activate() }
        }
        .accessibilityElement(children: composer.editing ? .contain : .ignore)
        .accessibilityLabel(composer.editing ? "新日程" : "添加日程")
        .accessibilityAction { if store.connected { composer.activate() } }
        .background(InlineCommitMonitor(active: composer.editing && !composer.saving) { composer.commit(store: store) })
        .onChange(of: composer.editing) { _, editing in
            if editing { DispatchQueue.main.async { titleFocused = true } }
        }
        .onChange(of: composer.title) { _, _ in composer.changed() }
        .onChange(of: composer.notes) { _, _ in composer.changed() }
        .onChange(of: composer.date) { _, _ in composer.changed() }
        .onChange(of: composer.start) { _, _ in composer.changed() }
        .onChange(of: composer.end) { _, _ in composer.changed() }
    }
}

// Observe local clicks without swallowing them. Date picker popovers have a
// separate window, so interacting with them never triggers a click-away save.
private struct InlineCommitMonitor: NSViewRepresentable {
    let active: Bool
    let commit: () -> Void
    func makeNSView(context: Context) -> MonitorView { MonitorView() }
    func updateNSView(_ view: MonitorView, context: Context) { view.active = active; view.commit = commit }
    static func dismantleNSView(_ view: MonitorView, coordinator: ()) { view.stop() }
    final class MonitorView: NSView {
        var active = false
        var commit: (() -> Void)?
        private var monitor: Any?
        override func hitTest(_ point: NSPoint) -> NSView? { nil }
        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            stop()
            guard window != nil else { return }
            monitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .keyDown]) { [weak self] event in
                guard let self, self.active, event.window === self.window else { return event }
                if event.type == .leftMouseDown {
                    let point = self.convert(event.locationInWindow, from: nil)
                    if !self.bounds.contains(point) { self.commit?() }
                } else if [36, 76].contains(Int(event.keyCode)),
                          !((self.window?.firstResponder as? NSTextView)?.hasMarkedText() ?? false) {
                    DispatchQueue.main.async { [weak self] in if self?.active == true { self?.commit?() } }
                }
                return event
            }
        }
        func stop() { if let monitor { NSEvent.removeMonitor(monitor); self.monitor = nil } }
    }
}
