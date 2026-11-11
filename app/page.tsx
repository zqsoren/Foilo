import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { maybeAutoBackup } from "@/lib/backup";
import { getDashboard } from "@/lib/data";
import { getLifeDate } from "@/lib/life-date";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "")
    ? params.date!
    : getLifeDate();
  await maybeAutoBackup().catch(() => undefined);
  const data = getDashboard(user.id, date);
  return <DashboardShell data={data} userName={user.name} />;
}
