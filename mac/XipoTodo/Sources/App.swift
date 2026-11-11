import AppKit
import SwiftUI
import QuartzCore

final class FloatingPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

@MainActor final class AppController: NSObject, NSApplicationDelegate, NSWindowDelegate {
    static let shared = AppController()
    let store = TodoStore(demo: CommandLine.arguments.contains("--demo") || Bundle.main.bundleIdentifier == "io.xipo.todo.preview")
    private var ball: FloatingPanel!
    private var expanded: FloatingPanel!
    private var mainWindow: NSWindow?
    private var settings: NSWindow?
    private var details: NSWindow?
    private var statusItem: NSStatusItem!
    private var timer: Timer?
    private var widgetBridge: WidgetBridge?
    private var observers: [NSObjectProtocol] = []
    private var isExpanded = false
    private var transitioning = false
    private let rail = FloatingRailState()
    private var restoring = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        widgetBridge = WidgetBridge(store: store)
        widgetBridge?.start()
        installMenu()
        ball = makePanel(title: "DIGTODO 悬浮球", size: NSSize(width: 64, height: 64), view: BallView(store: store))
        ball.hasShadow = false
        expanded = makePanel(title: "DIGTODO 任务列", size: NSSize(width: 76, height: 440), view: FloatingTaskRail(store: store, rail: rail))
        expanded.hasShadow = false
        rail.onSelectionChange = { [weak self] showDetail in self?.resizeRail(showDetail: showDetail) }
        resetPositions(save: false)
        if !store.demo { restore(ball, key: "ballOrigin") }
        clampWindows()
        store.onVisibilityChange = { [weak self] in self?.updateVisibility() }
        updateVisibility()
        showMainWindow()
        timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in Task { @MainActor in await self?.store.refresh() } }
        observers.append(NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in Task { @MainActor in await self?.store.refresh() } })
        observers.append(NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in Task { @MainActor in self?.clampWindows() } })
        Task {
            await store.restoreSession()
            if !store.connected { showSettings() }
        }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showMainWindow()
        return true
    }
    func application(_ application: NSApplication, open urls: [URL]) {
        guard urls.contains(where: { $0.scheme == "xipo-todo" && $0.host == "today" }) else { return }
        if store.connected { expand() } else { showSettings() }
    }
    private func makePanel<V: View>(title: String, size: NSSize, view: V) -> FloatingPanel {
        let panel = FloatingPanel(contentRect: NSRect(origin: .zero, size: size), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.title = title; panel.isReleasedWhenClosed = false; panel.isOpaque = false; panel.backgroundColor = .clear
        panel.hasShadow = true; panel.hidesOnDeactivate = false; panel.isMovableByWindowBackground = false
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]
        panel.level = .floating
        panel.contentView = NSHostingView(rootView: view.environment(\.colorScheme, .light))
        panel.delegate = self
        return panel
    }
    private func installMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem(); let app = NSMenu()
        app.addItem(withTitle: "打开今日计划", action: #selector(mainAction), keyEquivalent: "1").target = self
        app.addItem(withTitle: "新建日程", action: #selector(newScheduleAction), keyEquivalent: "n").target = self
        app.addItem(withTitle: "设置…", action: #selector(settingsAction), keyEquivalent: ",").target = self
        app.addItem(withTitle: "退出 DIGTODO", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = app; main.addItem(appItem)
        let editItem = NSMenuItem(title: "编辑", action: nil, keyEquivalent: ""); let edit = NSMenu(title: "编辑")
        for (title, action, key) in [("剪切", "cut:", "x"), ("复制", "copy:", "c"), ("粘贴", "paste:", "v"), ("全选", "selectAll:", "a")] { edit.addItem(withTitle: title, action: Selector(action), keyEquivalent: key) }
        editItem.submenu = edit; main.addItem(editItem); NSApp.mainMenu = main
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.image = NSImage(systemSymbolName: "checklist", accessibilityDescription: "DIGTODO")
        statusItem.button?.toolTip = "DIGTODO"
        let menu = NSMenu()
        for (title, selector) in [("打开今日计划", #selector(mainAction)), ("展开今日待办", #selector(expandAction)), ("刷新日程", #selector(refreshAction)), ("添加系统小组件…", #selector(settingsAction)), ("设置…", #selector(settingsAction))] {
            menu.addItem(withTitle: title, action: selector, keyEquivalent: "").target = self
        }
        menu.addItem(.separator())
        menu.addItem(withTitle: "退出 DIGTODO", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        statusItem.menu = menu
    }
    @objc private func settingsAction() { showSettings() }
    @objc private func mainAction() { showMainWindow() }
    @objc private func newScheduleAction() { showNewSchedule() }
    @objc private func expandAction() { expand() }
    @objc private func refreshAction() { Task { await store.refresh(forceWidgetReload: true) } }
    func updateVisibility() {
        guard ball != nil else { return }
        if store.showBall {
            if isExpanded { expanded.orderFrontRegardless(); ball.orderOut(nil) }
            else { ball.orderFrontRegardless(); expanded.orderOut(nil) }
        } else { ball.orderOut(nil); expanded.orderOut(nil); isExpanded = false }
    }
    func expand() {
        guard ball != nil, !isExpanded, !transitioning else { return }
        if !store.showBall { store.showBall = true }
        let screen = NSScreen.screens.max { area($0.visibleFrame.intersection(ball.frame)) < area($1.visibleFrame.intersection(ball.frame)) }?.visibleFrame ?? NSScreen.main!.visibleFrame
        rail.reset()
        rail.extendsLeft = ball.frame.midX >= screen.midX
        rail.height = min(94 + CGFloat(min(7, max(1, store.timelineEvents.count))) * 56, screen.height - 24)
        isExpanded = true
        transitioning = true
        expanded.setFrame(NSRect(x: ball.frame.midX - 38, y: ball.frame.maxY - rail.height, width: 76, height: rail.height), display: false)
        clamp(expanded)
        let target = expanded.frame
        expanded.setFrame(NSRect(x: ball.frame.midX - 38, y: ball.frame.minY, width: 76, height: 64), display: false)
        expanded.alphaValue = 0
        ball.orderOut(nil)
        expanded.makeKeyAndOrderFront(nil)
        rail.revealed = true
        NSAnimationContext.runAnimationGroup { context in
            context.duration = motionDuration
            context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            expanded.animator().setFrame(target, display: true)
            expanded.animator().alphaValue = 1
        } completionHandler: { [weak self] in
            Task { @MainActor in
                guard let self else { return }
                self.transitioning = false
                if self.rail.selectedID != nil { self.resizeRail(showDetail: true) }
            }
        }
        Task { await store.refresh() }
    }
    private var motionDuration: TimeInterval { NSWorkspace.shared.accessibilityDisplayShouldReduceMotion ? 0 : 0.28 }
    private func resizeRail(showDetail: Bool) {
        guard isExpanded, !transitioning else { return }
        var target = expanded.frame
        let width: CGFloat = showDetail ? 320 : 76
        if rail.extendsLeft { target.origin.x = target.maxX - width }
        target.size.width = width
        NSAnimationContext.runAnimationGroup { context in
            context.duration = motionDuration
            context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            expanded.animator().setFrame(target, display: true)
        }
    }
    func collapse() {
        guard isExpanded, !transitioning else { return }
        transitioning = true
        rail.revealed = false
        NSAnimationContext.runAnimationGroup { context in
            context.duration = motionDuration
            context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            expanded.animator().alphaValue = 0
            expanded.animator().setFrame(NSRect(x: ball.frame.midX - 38, y: ball.frame.minY, width: 76, height: 64), display: true)
        } completionHandler: { [weak self] in
            Task { @MainActor in
                guard let self else { return }
                self.expanded.orderOut(nil)
                self.isExpanded = false
                self.transitioning = false
                if self.store.showBall { self.ball.orderFrontRegardless() }
                self.rail.reset()
                self.savePositions()
            }
        }
    }
    func showMainWindow() {
        if mainWindow == nil {
            let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 420, height: 520), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
            window.title = "DIGTODO"; window.isReleasedWhenClosed = false
            window.minSize = NSSize(width: 380, height: 440)
            window.contentView = NSHostingView(rootView: MainView(store: store))
            window.center(); mainWindow = window
        }
        NSApp.activate(ignoringOtherApps: true)
        mainWindow?.makeKeyAndOrderFront(nil)
        Task { await store.refresh() }
    }
    func showSettings() {
        if settings == nil {
            let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 460, height: 580), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
            window.title = "DIGTODO设置"; window.isReleasedWhenClosed = false
            window.contentView = NSHostingView(rootView: SettingsView(store: store))
            window.center(); settings = window
        }
        NSApp.activate(ignoringOtherApps: true)
        settings?.makeKeyAndOrderFront(nil)
    }
    func showDetails(_ event: ScheduleEvent) {
        details?.close()
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 380, height: 300), styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.title = "日程详情"; window.isReleasedWhenClosed = false
        window.contentView = NSHostingView(rootView: DetailsView(event: event))
        window.center(); details = window
        NSApp.activate(ignoringOtherApps: true); window.makeKeyAndOrderFront(nil)
    }
    func showNewSchedule() {
        guard store.connected else { showSettings(); return }
        showMainWindow()
        NotificationCenter.default.post(name: InlineScheduleComposer.beginNotification, object: nil)
    }
    func openWeb(_ path: String) {
        guard let url = URL(string: path, relativeTo: productionSite), url.host == productionSite.host else { return }
        NSWorkspace.shared.open(url)
    }
    func resetPositions(save: Bool = true) {
        guard let screen = NSScreen.main?.visibleFrame, ball != nil else { return }
        restoring = true
        ball.setFrameOrigin(NSPoint(x: screen.maxX - 90, y: screen.minY + 35))
        expanded.setFrameOrigin(NSPoint(x: screen.maxX - 356, y: screen.minY + 35))
        restoring = false
        if save { savePositions() }
    }
    private func restore(_ window: NSWindow, key: String) {
        if let value = UserDefaults.standard.string(forKey: key) { restoring = true; window.setFrameOrigin(NSPointFromString(value)); restoring = false }
    }
    private func clamp(_ window: NSWindow) {
        let screens = NSScreen.screens.map(\.visibleFrame)
        guard let target = screens.max(by: { area($0.intersection(window.frame)) < area($1.intersection(window.frame)) }) else { return }
        let frame = window.frame
        let x = max(target.minX, min(frame.minX, target.maxX - frame.width))
        let y = max(target.minY, min(frame.minY, target.maxY - frame.height))
        window.setFrameOrigin(NSPoint(x: x, y: y))
    }
    private func area(_ rect: NSRect) -> CGFloat { rect.isNull ? 0 : rect.width * rect.height }
    func clampWindows() { guard ball != nil else { return }; clamp(ball); clamp(expanded); savePositions() }
    func windowDidMove(_ notification: Notification) { if !restoring { savePositions() } }
    private func savePositions() {
        guard !store.demo, !restoring, ball != nil else { return }
        UserDefaults.standard.set(NSStringFromPoint(ball.frame.origin), forKey: "ballOrigin")
    }
}

@main struct XipoLauncher {
    @MainActor static func main() {
        let app = NSApplication.shared
        app.delegate = AppController.shared
        app.run()
    }
}
