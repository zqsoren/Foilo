import { addDays, weekBounds } from "../life-date";
import { statusOf, type TodoEvent, type TaskStatus } from "./model";
import { occurrenceOn, weekday } from "./recurrence";

export const widgets = {
  today: ["今日概览", 600, 200],
  todo: ["每日 TODO", 600, 200],
  heat: ["活跃热力图", 600, 200],
  calendar: ["月历", 600, 420],
  week: ["周日程", 1215, 200],
  rates: ["推迟与取消", 600, 200],
  trend: ["完成趋势", 600, 420],
  delays: ["反复推迟的任务", 600, 200],
} as const;
export type Widget = keyof typeof widgets;
export const defaultLayout: Widget[] = ["today", "todo", "heat", "calendar"];
export type ActivityCount = {
  day: string;
  task: string;
  occurrence: string | null;
  root: string;
  action: string;
  count: number;
};
export type BoardData = {
  revision: number;
  events: TodoEvent[];
  activity: ActivityCount[];
  layout: Widget[];
  layoutRevision: number;
};
export type Period = "年" | "月" | "周";
export const taskKey = (e: TodoEvent) => e.id + "/" + (e.occurrenceDate ?? "");
export function monthStart(day: string, offset = 0) {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 10);
}
export function monthCells(day: string) {
  const first = monthStart(day),
    last = addDays(monthStart(day, 1), -1);
  const lead = (weekday(first) + 6) % 7;
  return Array.from(
    { length: Math.ceil((Number(last.slice(-2)) + lead) / 7) * 7 },
    (_, i) => addDays(first, i - lead),
  );
}
export const shortDate = (d: string) =>
  Number(d.slice(5, 7)) + "月" + Number(d.slice(-2)) + "日";
export const monthLabel = (d: string) =>
  d.slice(0, 4) + " 年 " + Number(d.slice(5, 7)) + " 月";
export const weekName = (d: string) => "星期" + "日一二三四五六"[weekday(d)];
export function periodBounds(today: string, period: Period) {
  if (period === "周") return weekBounds(today);
  if (period === "月")
    return { start: monthStart(today), end: monthStart(today, 1) };
  return {
    start: today.slice(0, 4) + "-01-01",
    end: String(Number(today.slice(0, 4)) + 1) + "-01-01",
  };
}
export function completedByScheduledDay(events: TodoEvent[]) {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.repeat) {
      // A recurring task starts pending on each date until that occurrence is edited.
      for (const date of Object.keys(event.exceptions ?? {})) {
        const occurrence = occurrenceOn(event, date);
        if (occurrence && statusOf(occurrence) === "completed")
          counts.set(date, (counts.get(date) ?? 0) + 1);
      }
    } else if (statusOf(event) === "completed") {
      counts.set(event.date, (counts.get(event.date) ?? 0) + 1);
    }
  }
  return counts;
}
export function plannedCount(events: TodoEvent[], start: string, end: string) {
  let total = 0;
  for (const e of events) {
    if (!e.repeat) {
      if (e.date >= start && e.date < end) total++;
      continue;
    }
    const first = start > e.date ? start : e.date;
    if (first >= end) continue;
    const days = (Date.parse(end) - Date.parse(first)) / 86400000;
    const allowed =
      e.repeat.frequency === "daily"
        ? [0, 1, 2, 3, 4, 5, 6]
        : e.repeat.frequency === "weekly"
          ? [weekday(e.date)]
          : [...new Set(e.repeat.days)];
    total += Math.floor(days / 7) * allowed.length;
    for (let i = 0; i < days % 7; i++)
      if (allowed.includes((weekday(first) + i) % 7)) total++;
    for (const [d, value] of Object.entries(e.exceptions ?? {})) {
      if (
        value === null &&
        d >= first &&
        d < end &&
        allowed.includes(weekday(d))
      )
        total--;
    }
  }
  return total;
}
export function metrics(
  events: TodoEvent[],
  rows: ActivityCount[],
  start: string,
  end: string,
) {
  const completed = new Set<string>(),
    cancelled = new Set<string>(),
    delays = new Map<string, number>();
  let deferred = 0;
  for (const row of rows) {
    if (row.day < start || row.day >= end || row.action === "deleted") continue;
    const key = row.task + "/" + (row.occurrence ?? "");
    if (row.action === "completed") completed.add(key);
    if (row.action === "cancelled") cancelled.add(key);
    if (row.action === "deferred") {
      deferred += row.count;
      delays.set(row.root, (delays.get(row.root) ?? 0) + row.count);
    }
  }
  return {
    total: plannedCount(events, start, end),
    completed: completed.size,
    cancelled: cancelled.size,
    deferred,
    delays,
  };
}

// Count generated occurrences arithmetically so a long-running daily series stays cheap.
export function taskTotals(events: TodoEvent[], today: string) {
  const counts: Record<TaskStatus, number> = {
    pending: 0,
    completed: 0,
    deferred: 0,
    cancelled: 0,
  };
  for (const e of events) {
    if (!e.repeat) {
      counts[statusOf(e)]++;
      continue;
    }
    const days = Math.max(
      0,
      Math.round((Date.parse(today) - Date.parse(e.date)) / 86400000) + 1,
    );
    const allowed =
      e.repeat.frequency === "daily"
        ? [0, 1, 2, 3, 4, 5, 6]
        : e.repeat.frequency === "weekly"
          ? [weekday(e.date)]
          : [...new Set(e.repeat.days)];
    let count = Math.floor(days / 7) * allowed.length;
    for (let i = 0; i < days % 7; i++)
      if (allowed.includes((weekday(e.date) + i) % 7)) count++;
    counts.pending += count;
    for (const [d, value] of Object.entries(e.exceptions ?? {})) {
      if (d < e.date || !allowed.includes(weekday(d))) continue;
      if (d <= today) counts.pending--;
      if (value) counts[statusOf(value)]++;
    }
    if (
      e.date > today &&
      e.exceptions?.[e.date] === undefined &&
      allowed.includes(weekday(e.date))
    )
      counts.pending++;
  }
  return counts;
}

export function searchTasks(
  events: TodoEvent[],
  query: string,
  anchor: string,
  limit = 30,
) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const matches = (e: Pick<TodoEvent, "title" | "notes">) =>
    (e.title + "\n" + e.notes).toLocaleLowerCase().includes(needle);
  const results = new Map<string, TodoEvent>();
  const add = (e: TodoEvent | null) => {
    if (e && matches(e)) results.set(taskKey(e), e);
  };
  for (const e of events) {
    if (!e.repeat) {
      add(e);
      continue;
    }
    for (const d of Object.keys(e.exceptions ?? {})) add(occurrenceOn(e, d));
    if (!matches(e)) continue;
    let d = anchor < e.date ? e.date : anchor;
    let found = 0;
    for (; d >= e.date && found < limit; d = addDays(d, -1)) {
      const item = occurrenceOn(e, d);
      if (item && matches(item)) {
        add(item);
        found++;
      }
    }
    if (e.date > anchor)
      for (let i = 0; i < 7; i++) add(occurrenceOn(e, addDays(e.date, i)));
  }
  return [...results.values()]
    .sort(
      (a, b) =>
        Math.abs(Date.parse(a.date) - Date.parse(anchor)) -
          Math.abs(Date.parse(b.date) - Date.parse(anchor)) ||
        a.title.localeCompare(b.title),
    )
    .slice(0, limit);
}
