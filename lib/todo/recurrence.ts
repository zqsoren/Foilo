import { addDays } from "../life-date";
import { type TodoEvent } from "./model";

export function weekday(date: string): number { return new Date(`${date}T12:00:00Z`).getUTCDay(); }
export function repeatLabel(event: TodoEvent): string {
  if (!event.repeat) return "不重复";
  if (event.repeat.frequency === "daily") return "每天";
  const days = event.repeat.frequency === "weekly" ? [weekday(event.date)] : event.repeat.days;
  return `每周${[1, 2, 3, 4, 5, 6, 0].filter((day) => days.includes(day)).map((day) => "日一二三四五六"[day]).join("、")}`;
}

export function occurrenceOn(event: TodoEvent, date: string): TodoEvent | null {
  if (!event.repeat) return event.date === date ? event : null;
  if (date < event.date) return null;
  const rule = event.repeat;
  if (rule.frequency === "weekly" && weekday(date) !== weekday(event.date)) return null;
  if (rule.frequency === "custom" && !rule.days.includes(weekday(date))) return null;
  const exception = event.exceptions?.[date];
  if (exception === null) return null;
  return { ...event, exceptions: undefined, date, occurrenceDate: date, completed: false, status: "pending", deferredTo: undefined, ...exception };
}

export function eventsForDate(events: TodoEvent[], date: string): TodoEvent[] {
  return events.flatMap((event) => { const occurrence = occurrenceOn(event, date); return occurrence ? [occurrence] : []; })
    .sort((a, b) => (a.start ?? "99:99").localeCompare(b.start ?? "99:99"));
}

// Daily and weekly patterns repeat every seven days. Test each exceptional date,
// the first shared week, and a full week after all exceptions: no arbitrary
// generation horizon, and no missed collisions with distant one-off events.
export function collisionDates(a: TodoEvent, b: TodoEvent): string[] {
  if (!a.repeat) return [a.date];
  if (!b.repeat) return [b.date];
  const start = a.date > b.date ? a.date : b.date;
  const exceptions = [...Object.keys(a.exceptions ?? {}), ...Object.keys(b.exceptions ?? {})];
  const latest = exceptions.reduce((last, date) => date > last ? date : last, start);
  return [...new Set([...exceptions, ...Array.from({ length: 7 }, (_, i) => addDays(start, i)), ...Array.from({ length: 7 }, (_, i) => addDays(latest, i + 1))])];
}
