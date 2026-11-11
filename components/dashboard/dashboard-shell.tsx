"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ProjectsCard, TimelinesCard, WishesCard } from "./collection-cards";
import { QuickLinksCard } from "./quick-links-card";
import { EditorialHeader } from "./editorial-header";
import { FocusOverviewCard } from "./focus-overview-card";
import { getLifeDate, lifeDayBounds } from "@/lib/life-date";
import type { DashboardData } from "@/lib/types";

export function DashboardShell({ data, userName }: { data: DashboardData; userName: string }) {
  const router = useRouter();
  const isToday = data.lifeDate === getLifeDate();

  useEffect(() => {
    if (!isToday) return;
    const nextBoundary = lifeDayBounds(data.lifeDate).end;
    const delay = Math.max(1_000, nextBoundary - Date.now() + 1_000);
    const timer = window.setTimeout(() => {
      router.replace("/");
      router.refresh();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [data.lifeDate, isToday, router]);
  return (
    <main className="app-shell">
      <EditorialHeader data={data} activeTab="today" userName={userName} />

      <div className="editorial-dashboard">
        <FocusOverviewCard data={data} />
        <section className="dashboard-column editorial-center">
          <QuickLinksCard />
        </section>
        <aside className="dashboard-column editorial-side">
          <ProjectsCard projects={data.projects} />
          <WishesCard wishes={data.wishes} />
          <TimelinesCard timelines={data.timelines} />
        </aside>
      </div>
    </main>
  );
}
