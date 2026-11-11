import { EditorialHeader } from "@/components/dashboard/editorial-header";
import { ProjectWorkspace } from "@/components/projects/project-workspace";
import { getDashboard } from "@/lib/data";
import { getLifeDate } from "@/lib/life-date";
import { getProjectWorkspace } from "@/lib/project-data";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = await requireUser("/projects");
  const lifeDate = getLifeDate();
  const dashboard = getDashboard(user.id, lifeDate);
  const workspace = getProjectWorkspace(user.id);

  return (
    <main className="app-shell project-page-shell">
      <EditorialHeader data={dashboard} activeTab="projects" userName={user.name} />
      <ProjectWorkspace data={workspace} />
    </main>
  );
}
