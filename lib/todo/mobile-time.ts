import { addDays } from "../life-date";
import { minutes, shanghaiNow, statusOf, type TodoEvent } from "./model";

export const lastMinute = 24 * 60 - 1;
export type DragPart = "start" | "range" | "end";

export function clockText(value: number) {
  return [Math.floor(value / 60), value % 60].map(n => String(n).padStart(2, "0")).join(":");
}

export function initialSlot(date: string, events: TodoEvent[], now = shanghaiNow()) {
  let latest = -1;
  for (const event of events) {
    const status = statusOf(event);
    if (event.end && status !== "cancelled" && status !== "deferred") {
      latest = Math.max(latest, minutes(event.end));
    }
  }
  let start = latest >= 0 ? latest + 10 : date === now.date ? Math.ceil(minutes(now.clock) / 10) * 10 : 540;
  // A stored occurrence has one date, so a full hour must fit on that date.
  if (start + 60 > lastMinute) {
    date = addDays(date, 1);
    start = Math.max(0, start - 1440);
  }
  return { date, start: clockText(start), end: clockText(start + 60) };
}

export function dragInterval(start: number, end: number, part: DragPart, delta: number) {
  if (part === "start") return [Math.max(0, Math.min(end - 1, start + delta)), end] as const;
  if (part === "end") return [start, Math.min(lastMinute, Math.max(start + 1, end + delta))] as const;
  const shift = Math.max(-start, Math.min(lastMinute - end, delta));
  return [start + shift, end + shift] as const;
}
