"use client";

import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { type Widget, widgets } from "@/lib/todo/dashboard";

const motion = { duration: 230, easing: "cubic-bezier(0.23, 1, 0.32, 1)" };
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Keep grid cells stationary for hit testing; animate only their inner faces. */
export function useWidgetSort(layout: Widget[], change: (next: Widget[]) => void, enabled: boolean) {
  const slots = useRef(new Map<Widget, HTMLDivElement>());
  const current = useRef(layout);
  const changeRef = useRef(change);
  const before = useRef(new Map<Widget, DOMRect>());
  const animations = useRef(new Map<Widget, Animation>());
  const stop = useRef<((cancel: boolean) => void) | null>(null);
  const active = useRef<{
    kind: Widget; x: number; y: number; offsetX: number; offsetY: number;
  } | null>(null);
  const [dragging, setDragging] = useState<Widget | null>(null);
  const [announcement, announce] = useState("");
  const suppressClick = useRef(false);
  const face = (slot: HTMLDivElement) => slot.firstElementChild as HTMLDivElement;

  function capture() {
    before.current.clear();
    for (const [kind, slot] of slots.current) {
      before.current.set(kind, face(slot).getBoundingClientRect());
    }
  }
  function positionActive() {
    const drag = active.current;
    if (!drag) return;
    const slot = slots.current.get(drag.kind);
    if (!slot) return;
    const rect = slot.getBoundingClientRect();
    face(slot).style.transform = `translate3d(${drag.x - drag.offsetX - rect.left}px, ${drag.y - drag.offsetY - rect.top}px, 0)`;
  }
  function reorder(kind: Widget, target: Widget, animate = true) {
    const next = [...current.current];
    const from = next.indexOf(kind), to = next.indexOf(target);
    if (from < 0 || to < 0 || from === to) return;
    if (animate) capture();
    next.splice(from, 1);
    next.splice(to, 0, kind);
    current.current = next;
    changeRef.current(next);
    announce(`${widgets[kind][0]}移至第 ${to + 1} 位，共 ${next.length} 个小组件`);
  }

  useLayoutEffect(() => {
    current.current = layout;
    changeRef.current = change;
    for (const [kind, rect] of before.current) {
      const slot = slots.current.get(kind);
      if (!slot || kind === active.current?.kind) continue;
      const element = face(slot), next = slot.getBoundingClientRect();
      animations.current.get(kind)?.cancel();
      if (!reduced() && (Math.abs(rect.left - next.left) > 1 || Math.abs(rect.top - next.top) > 1)) {
        animations.current.set(kind, element.animate([
          { transform: `translate(${rect.left - next.left}px, ${rect.top - next.top}px)` },
          { transform: "translate(0, 0)" },
        ], motion));
      }
    }
    before.current.clear();
    positionActive();
  });

  useLayoutEffect(() => {
    if (!enabled) stop.current?.(true);
    return () => { stop.current?.(true); };
  }, [enabled]);

  function pointerDown(event: ReactPointerEvent<HTMLButtonElement>, kind: Widget) {
    if (!enabled || !event.isPrimary || event.button !== 0 || stop.current) return;
    event.preventDefault();
    const slot = slots.current.get(kind);
    if (!slot) return;
    const handle = event.currentTarget, pointerId = event.pointerId;
    const initial = [...current.current], rect = slot.getBoundingClientRect();
    const origin = { x: event.clientX, y: event.clientY };
    let point = { ...origin }, lastSwap = { x: -Infinity, y: -Infinity };
    let frame = 0, started = false, lastTime = performance.now();
    handle.focus({ preventScroll: true });
    // Global pointer listeners survive React moving this button to a new grid cell.

    const tick = (time: number) => {
      if (!active.current) return;
      const dt = Math.min(time - lastTime, 32);
      lastTime = time;
      const bottom = window.innerHeight - 64;
      const velocity = point.y < 65 ? -Math.min(1, (65 - point.y) / 65)
        : point.y > bottom - 65 ? Math.min(1, (point.y - bottom + 65) / 65) : 0;
      if (velocity) window.scrollBy(0, velocity * dt * .65);
      positionActive();
      // A small travel threshold prevents oscillation when unequal cards swap cells.
      if (Math.hypot(point.x - lastSwap.x, point.y - lastSwap.y) >= 12) {
        for (const [other, cell] of slots.current) {
          if (other === kind) continue;
          const r = cell.getBoundingClientRect();
          if (point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom) {
            reorder(kind, other);
            lastSwap = { ...point };
            break;
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      point = { x: e.clientX, y: e.clientY };
      if (!started && Math.hypot(point.x - origin.x, point.y - origin.y) >= 5) {
        started = true;
        animations.current.get(kind)?.cancel();
        active.current = { kind, ...point, offsetX: origin.x - rect.left, offsetY: origin.y - rect.top };
        setDragging(kind);
        frame = requestAnimationFrame(tick);
      }
      if (active.current) Object.assign(active.current, point);
    };
    const end = (cancel: boolean) => {
      stop.current = null;
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancelled);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", blur);
      window.removeEventListener("resize", blur);
      if (!started) return;
      capture();
      active.current = null;
      face(slot).style.transform = "";
      setDragging(null);
      if (cancel) {
        current.current = initial;
        changeRef.current(initial);
        announce("已取消本次拖动");
      } else {
        announce(`${widgets[kind][0]}已放置；点空白处保存布局`);
      }
      suppressClick.current = true;
      setTimeout(() => { suppressClick.current = false; }, 0);
    };
    const up = (e: PointerEvent) => { if (e.pointerId === pointerId) end(false); };
    const cancelled = (e: PointerEvent) => { if (e.pointerId === pointerId) end(true); };
    const blur = () => end(true);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); end(true); }
    };
    stop.current = end;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancelled);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", blur);
    window.addEventListener("resize", blur);
  }

  function keyboardMove(kind: Widget, key: string) {
    const index = current.current.indexOf(kind);
    const delta = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
    const target = key === "Home" ? 0 : key === "End" ? current.current.length - 1 : index + delta;
    if (target >= 0 && target < current.current.length) reorder(kind, current.current[target], false);
  }

  return { slots, dragging, announcement, pointerDown, keyboardMove, suppressClick,
    isDragging: () => stop.current !== null };
}
