import SwiftUI
import AppKit

struct FloatingTaskRail: View {
    @ObservedObject var store: TodoStore
    @ObservedObject var rail: FloatingRailState
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private let accent = Color(red: 0.64, green: 0.30, blue: 0.13)
    private var alignment: Alignment { rail.extendsLeft ? .trailing : .leading }
    private var motion: Animation? { reduceMotion ? nil : .spring(response: 0.38, dampingFraction: 0.86) }

    var body: some View {
        ZStack(alignment: alignment) {
            FloatingGlass(cornerRadius: 32)
                .overlay(RoundedRectangle(cornerRadius: 32).fill(orange.opacity(0.10)))
                .overlay(RoundedRectangle(cornerRadius: 32).strokeBorder(.white.opacity(0.6), lineWidth: 0.75))
                .frame(width: 64)
                .padding(.horizontal, 6)
                .allowsHitTesting(false)
            VStack(spacing: 0) {
                HStack(spacing: 0) {
                    if rail.extendsLeft { Spacer(minLength: 0) }
                    Button { AppController.shared.collapse() } label: {
                        VStack(spacing: 2) {
                            Image(systemName: "chevron.up").font(.system(size: 10, weight: .semibold))
                            Text("\(store.day?.pending ?? 0) 待办").font(.system(size: 10, weight: .medium))
                        }.frame(width: 64, height: 50).contentShape(Capsule())
                    }.buttonStyle(.plain).foregroundStyle(accent).accessibilityLabel("收起任务列")
                    if !rail.extendsLeft { Spacer(minLength: 0) }
                }.padding(.horizontal, 6)
                ScrollView(.vertical) {
                    VStack(spacing: 0) {
                        if store.timelineEvents.isEmpty {
                            Button { AppController.shared.showMainWindow() } label: {
                                Image(systemName: store.connected ? "plus" : "person.crop.circle")
                                    .font(.system(size: 18, weight: .light))
                                    .frame(width: 44, height: 56)
                            }.buttonStyle(.plain).foregroundStyle(accent)
                                .frame(maxWidth: .infinity, alignment: alignment)
                                .padding(.horizontal, 16)
                                .help(store.connected ? "打开日程，安排今天" : "打开主界面登录")
                        } else {
                            ForEach(Array(store.timelineEvents.enumerated()), id: \.element.id) { index, event in
                                taskRow(event, number: index + 1)
                            }
                        }
                    }
                }
                .scrollIndicators(.hidden)
                HStack(spacing: 0) {
                    if rail.extendsLeft { Spacer(minLength: 0) }
                    Button { AppController.shared.showMainWindow() } label: {
                        Image(systemName: store.message.isEmpty ? "ellipsis" : "exclamationmark.circle")
                            .font(.system(size: 15, weight: .medium))
                            .frame(width: 64, height: 36).contentShape(Capsule())
                    }.buttonStyle(.plain).foregroundStyle(accent.opacity(0.8))
                        .help(store.message.isEmpty ? "打开完整日程" : store.message)
                        .accessibilityLabel(store.message.isEmpty ? "打开完整日程" : "同步异常，打开主界面查看")
                    if !rail.extendsLeft { Spacer(minLength: 0) }
                }.padding(.horizontal, 6)
            }
        }
        .padding(.vertical, 4)
        .opacity(rail.revealed ? 1 : 0)
        .scaleEffect(x: 1, y: rail.revealed || reduceMotion ? 1 : 0.16,
                     anchor: rail.extendsLeft ? .topTrailing : .topLeading)
        .animation(motion, value: rail.revealed)
        .animation(motion, value: rail.selectedID)
        .animation(motion, value: store.day?.completed)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
        .onChange(of: store.timelineEvents.map(\.id)) { _, ids in
            if let id = rail.selectedID, !ids.contains(id) { rail.dismissDetail() }
        }
        .onExitCommand {
            if rail.selectedID != nil { rail.dismissDetail() } else { AppController.shared.collapse() }
        }
    }

    private func taskRow(_ event: ScheduleEvent, number: Int) -> some View {
        let selected = rail.selectedID == event.id
        return HStack(spacing: 0) {
            if rail.extendsLeft { Spacer(minLength: 0) }
            Group {
                ZStack {
                    Circle().fill(event.taskStatus != "pending" ? Color.gray.opacity(0.12) : orange.opacity(selected ? 0.32 : 0.13))
                    Circle().strokeBorder(event.taskStatus != "pending" ? Color.gray.opacity(0.15) : orange.opacity(selected ? 0.75 : 0.24), lineWidth: selected ? 1.3 : 0.75)
                    if rail.completingID == event.id {
                        ProgressView().controlSize(.small)
                    } else if event.taskStatus != "pending" {
                        Image(systemName: event.taskStatus == "completed" ? "checkmark" : event.taskStatus == "cancelled" ? "minus" : "chevron.right").font(.system(size: 15, weight: .medium))
                    } else {
                        Text(String(format: "%02d", number))
                            .font(.system(size: 15, weight: .medium, design: .rounded)).monospacedDigit()
                    }
                }.frame(width: 42, height: 42).contentShape(Circle())
                    .foregroundStyle(event.taskStatus != "pending" ? Color.gray : accent)
            }
            .overlay(TaskClickSurface { rail.statusTap(event, count: $0, store: store) })
            .contextMenu { Button("查看详情") { rail.tap(event, store: store) } }
            .help(event.title)
            .accessibilityElement(children: .ignore)
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel("\(event.completed ? "已完成" : "未完成")：\(event.title)")
            .accessibilityAction { rail.tap(event, store: store) }
            .accessibilityAction(named: Text(event.completed ? "取消完成" : "标记完成")) { rail.doubleTap(event, store: store) }
            .overlay(alignment: rail.extendsLeft ? .trailing : .leading) {
                if selected {
                    detail(event)
                        .offset(x: rail.extendsLeft ? -54 : 54)
                        .transition(.opacity.combined(with: .scale(scale: 0.90, anchor: rail.extendsLeft ? .trailing : .leading)))
                }
            }
            if !rail.extendsLeft { Spacer(minLength: 0) }
        }
        .padding(.horizontal, 17)
        .frame(height: 56)
    }

    private func detail(_ event: ScheduleEvent) -> some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 3) {
                Text(event.title).font(.system(size: 12, weight: .medium))
                    .lineLimit(1).strikethrough(event.completed)
                    .foregroundStyle(event.taskStatus != "pending" ? Color.secondary : ink)
                Text(event.timeLabel).font(.system(size: 10)).monospacedDigit().foregroundStyle(.secondary)
                if !store.message.isEmpty {
                    Text(store.message).font(.system(size: 9)).foregroundStyle(accent).lineLimit(1)
                }
            }.frame(maxWidth: .infinity, alignment: .leading)
            Button { rail.dismissDetail() } label: {
                Image(systemName: "xmark").font(.system(size: 9, weight: .medium))
                    .frame(width: 22, height: 30).contentShape(Rectangle())
            }.buttonStyle(.plain).foregroundStyle(.secondary).accessibilityLabel("收起任务详情")
        }
        .padding(.horizontal, 13)
        .frame(width: 232, height: 54)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(.white.opacity(0.65), lineWidth: 0.75))
    }
}
