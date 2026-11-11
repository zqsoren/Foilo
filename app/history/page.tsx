import Link from "next/link";
import { ArrowLeft, CalendarDays, Dumbbell, Gamepad2 } from "lucide-react";
import { getHistory } from "@/lib/data";
import { displayDate, formatDuration } from "@/lib/life-date";
import { requireUser } from "@/lib/auth";
import { UserMenu } from "@/components/auth/user-menu";

export const dynamic = "force-dynamic";

const statusLabels = {
  workout: "健身",
  light_activity: "轻运动",
  no_activity: "不运动",
};

export default async function HistoryPage() {
  const user = await requireUser("/history");
  const history = getHistory(user.id);
  return (
    <main className="subpage-shell">
      <header className="subpage-header"><div><Link className="back-link" href="/"><ArrowLeft size={17} />返回今天</Link><h1>历史</h1><p>按生活日回看真正发生过的时间和行动。</p></div><div className="subpage-user-actions"><UserMenu name={user.name} /><CalendarDays size={32} /></div></header>
      <div className="history-list">
        {history.map((day) => {
          const date = displayDate(day.recordDate);
          return (
            <Link className="history-day" href={`/?date=${day.recordDate}`} key={day.recordDate}>
              <div className="history-date"><strong>{date.monthDay}</strong><span>{date.weekday}</span>{day.closedAt ? <em>已收下</em> : null}</div>
              <div className="history-metrics">
                <span><b>{formatDuration(day.workSeconds)}</b>工作</span>
                <span><Gamepad2 size={16} /><b>{formatDuration(day.entertainmentSeconds)}</b>娱乐</span>
                <span><Dumbbell size={16} /><b>{day.bodyStatus ? statusLabels[day.bodyStatus] : "未记录"}</b>身体</span>
              </div>
              <div className="history-note">{day.daySummary || "没有留下文字总结"}</div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
