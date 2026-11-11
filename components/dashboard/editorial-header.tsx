"use client";

import Link from "next/link";
import { History, Settings } from "lucide-react";
import { EndDayExperience } from "./end-day";
import { StatePicker } from "./state-picker";
import { displayDate, getLifeDate } from "@/lib/life-date";
import type { DashboardData } from "@/lib/types";
import { UserMenu } from "@/components/auth/user-menu";

type ActiveTab = "today" | "projects";

const tabs: Array<{ key: ActiveTab; label: string; href: string }> = [
  { key: "today", label: "今日", href: "/" },
  { key: "projects", label: "项目", href: "/projects" },
];

export function EditorialHeader({
  data,
  activeTab,
  userName,
}: {
  data: DashboardData;
  activeTab: ActiveTab;
  userName: string;
}) {
  const date = displayDate(data.lifeDate);
  const isToday = data.lifeDate === getLifeDate();

  return (
    <>
      <header className="topbar editorial-topbar">
        <Link className="topbar-date topbar-home" href="/" aria-label="返回今天">
          <strong>{date.monthDay}</strong>
          <div>
            <p>{date.full}<span>{date.weekday}</span></p>
            <em>{isToday ? "今天，从凌晨 4 点开始" : "历史生活日"}</em>
          </div>
        </Link>

        <div className="topbar-actions">
          <StatePicker recordDate={data.lifeDate} code={data.daily.dailyStateCode} custom={data.daily.dailyStateCustom} />
          <Link className="icon-button nav-icon" href="/history" aria-label="历史"><History size={19} /></Link>
          <Link className="icon-button nav-icon" href="/settings" aria-label="设置"><Settings size={19} /></Link>
          <UserMenu name={userName} />
          {isToday ? <EndDayExperience data={data} /> : <Link className="primary-button" href="/">返回今天</Link>}
        </div>
      </header>

      <nav className="workspace-tabs" aria-label="工作台主导航">
        {tabs.map((tab) => (
          <Link key={tab.key} className={activeTab === tab.key ? "active" : ""} href={tab.href}>
            {tab.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
