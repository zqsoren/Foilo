import { requireUser } from "@/lib/auth";
import { todoDashboardPath, todoTasksPath } from "@/lib/login-routing";
import { dashboardData } from "@/lib/todo/dashboard-store";
import { shanghaiNow } from "@/lib/todo/model";
import { ScheduleBoard } from "@/components/todo/dashboard/board";
import "./dashboard.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "在侧 Folio · 数据概览" };
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const taskView = (await searchParams).view === "tasks";
  const user = await requireUser(taskView ? todoTasksPath : todoDashboardPath);
  return (
    <ScheduleBoard
      name={user.name}
      initial={dashboardData(user.id)}
      initialDay={shanghaiNow().date}
      initialView={taskView ? "tasks" : "board"}
    />
  );
}
