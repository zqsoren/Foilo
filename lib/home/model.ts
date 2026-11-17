import { addDays } from "../life-date";

export const homeModules = ["gym", "todo", "wealth"] as const;
export type HomeModule = (typeof homeModules)[number];
export const moduleInfo = {
  gym: { name: "健身", href: "/gym", icon: "/folio/home/15-9413.svg", description: "训练，日积月累。" },
  todo: { name: "日程", href: "/todo/dashboard", icon: "/folio/home/15-9419.svg", description: "安排今天，也留意明天。" },
  wealth: { name: "资产", href: "/wealth", icon: "/folio/home/15-9430.svg", description: "看见自己的资产变化。" },
} as const;
export type HeatDay = { date: string; count: number; future: boolean };
export type HomeData = {
  date: string; modules: HomeModule[]; life: HeatDay[]; gym: HeatDay[];
  completed: number; trend: { date: string; value: number | null }[];
};
// Calendar days use Shanghai midnight, matching the three existing modules.
export function calendarDays(start: string, end: string, today: string, counts: Map<string, number>): HeatDay[] {
  const result: HeatDay[] = [];
  for (let date = start; date < end; date = addDays(date, 1)) {
    result.push({ date, count: date > today ? 0 : counts.get(date) ?? 0, future: date > today });
  }
  return result;
}
export function monthHeatmap(today: string, counts: Map<string, number>) {
  const start = today.slice(0, 7) + "-01";
  const next = new Date(start + "T12:00:00Z");
  next.setUTCMonth(next.getUTCMonth() + 1);
  return calendarDays(start, next.toISOString().slice(0, 10), today, counts);
}
export function mondayOffset(date: string) {
  return (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7;
}
