import AppKit
import SwiftUI

// Delay the write until the system multi-click window closes. A double/triple
// click must never send the single-click action first.
struct TaskClickSurface: NSViewRepresentable {
    let action: (Int) -> Void
    func makeNSView(context: Context) -> ClickView { let view = ClickView(); view.action = action; return view }
    func updateNSView(_ view: ClickView, context: Context) { view.action = action }
    final class ClickView: NSView {
        var action: ((Int) -> Void)?
        private var pending: DispatchWorkItem?
        override func mouseDown(with event: NSEvent) {}
        override func mouseUp(with event: NSEvent) {
            pending?.cancel()
            let count = min(3, max(1, event.clickCount))
            let callback = action
            let work = DispatchWorkItem { callback?(count) }
            pending = work
            DispatchQueue.main.asyncAfter(deadline: .now() + NSEvent.doubleClickInterval + 0.04, execute: work)
        }
        deinit { pending?.cancel() }
    }
}
