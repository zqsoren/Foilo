import type { Plan, Workout } from "./model";

export const widgets = {
  phase: ["阶段训练目标", 1215, 200],
  heat: ["活跃热力图", 600, 200],
  plans: ["按计划看容量", 600, 420],
  exercise: ["关注动作的容量", 600, 420],
  calendar: ["月历", 600, 420],
  month: ["本月训练目标", 600, 200],
  week: ["本周训练目标", 600, 200],
  planGoals: ["各计划本月目标", 600, 420],
  recent: ["最近一次训练", 600, 640],
  comparison: ["同计划上次对照", 600, 420],
  body: ["身体训练分布", 600, 420],
  focus: ["训练重心，怎样变化", 600, 420],
  summary: ["训练汇总", 600, 200],
  rhythm: ["训练节奏", 600, 200],
} as const;
export type Widget = keyof typeof widgets;
export const widgetKeys = Object.keys(widgets) as Widget[];
export const defaultLayout: Widget[] = [
  "phase",
  "heat",
  "plans",
  "exercise",
  "calendar",
];
export const regions = [
  "臀腿",
  "背部",
  "胸部",
  "肩部",
  "手臂",
  "腰腹／核心",
] as const;
export type DesktopSettings = {
  layout: Widget[];
  planIds: number[] | null;
  focus: { exerciseId: number; planId: number | null } | null;
  monthGoals: Record<string, number>;
  weekGoals: Record<string, number>;
  planGoals: Record<string, number>;
  phase: { start: string; end: string; target: number } | null;
};
export const defaultSettings = (): DesktopSettings => ({
  layout: [...defaultLayout],
  planIds: null,
  focus: null,
  monthGoals: {},
  weekGoals: {},
  planGoals: {},
  phase: null,
});
export type SessionStat = {
  id: number;
  planId: number;
  name: string;
  day: string;
  started: number;
  finished: number;
  volume: number;
  sets: number;
  planRevision: number | null;
};
export type ItemStat = {
  id: number;
  workoutId: number;
  exerciseId: number;
  name: string;
  region: string;
  volume: number;
  sets: number;
  note: string;
};
export type MuscleStat = { month: string; muscle: string; sets: number };
export type DesktopData = {
  today: string;
  plans: (Plan & { archived: number })[];
  sessions: SessionStat[];
  items: ItemStat[];
  muscles: MuscleStat[];
  latest: Workout | null;
  settings: DesktopSettings;
  revision: number;
};
export function shiftMonth(month: string, amount: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + amount, 1)).toISOString().slice(0, 7);
}
export function shiftDay(day: string, amount: number) {
  return new Date(Date.parse(day + "T00:00:00Z") + amount * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function weekStart(day: string) {
  return shiftDay(day, -((new Date(day + "T00:00:00Z").getUTCDay() + 6) % 7));
}
export function calendarDays(month: string) {
  const first = weekStart(month + "-01");
  return Array.from({ length: 42 }, (_, i) => shiftDay(first, i));
}
export function number(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(
    value,
  );
}
export function dateLabel(day: string) {
  return day.slice(5).replace("-", ".");
}
export function exerciseSeries(
  data: DesktopData,
  exerciseId: number,
  planId: number | null,
) {
  const sessions = new Map(
    data.sessions
      .filter((w) => planId === null || w.planId === planId)
      .map((w) => [w.id, w]),
  );
  const grouped = new Map<
    number,
    { session: SessionStat; volume: number; sets: number; items: ItemStat[] }
  >();
  for (const item of data.items) {
    const session = sessions.get(item.workoutId);
    if (item.exerciseId !== exerciseId || !session) continue;
    const row = grouped.get(session.id) ?? {
      session,
      volume: 0,
      sets: 0,
      items: [],
    };
    row.volume += item.volume;
    row.sets += item.sets;
    row.items.push(item);
    grouped.set(session.id, row);
  }
  return [...grouped.values()].sort(
    (a, b) =>
      a.session.started - b.session.started || a.session.id - b.session.id,
  );
}
