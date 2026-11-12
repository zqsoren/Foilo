"use client";

import { CalendarDays, Dumbbell, LayoutGrid } from "lucide-react";

const tabs = [
  { view: "home", label: "训练", Icon: Dumbbell },
  { view: "diary", label: "日历", Icon: CalendarDays },
  { view: "browse", label: "动作库", Icon: LayoutGrid },
] as const;
type Tab = typeof tabs[number]["view"];

export function GymNavigation({ current, compact = false, navigate }: {
  current: Tab;
  compact?: boolean;
  navigate: (tab: Tab) => void;
}) {
  return <nav className={"gym-tabs" + (compact ? " gym-tabs-compact" : "")} aria-label="健身导航">
    {(compact ? tabs.slice(0, 1) : tabs).map(({ view, label, Icon }) => (
      <button key={view} type="button" className={compact || view === current ? "highlighted" : ""}
        aria-current={!compact && current === view ? "page" : undefined}
        aria-label={compact ? "返回训练首页" : label} onClick={() => navigate(view)}>
        <Icon size={24} strokeWidth={2.25} aria-hidden="true" />
        <span>{label}</span>
      </button>
    ))}
  </nav>;
}
