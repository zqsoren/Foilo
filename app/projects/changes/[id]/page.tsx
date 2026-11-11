import Link from "next/link";
import { ArrowLeft, GitCompareArrows } from "lucide-react";
import { notFound } from "next/navigation";
import { AiChangePreviewActions } from "@/components/projects/ai-change-preview-actions";
import { projectAiOperationsSchema } from "@/lib/ai/change-set";
import { sqlite } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ProjectAiChangePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  const user = await requireUser(Number.isSafeInteger(id) && id > 0 ? `/projects/changes/${id}` : "/projects");
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const row = sqlite.prepare(
    `SELECT c.id, c.project_id AS projectId, c.change_kind AS changeKind,
            c.status, c.title, c.reason, c.operations_json AS operationsJson,
            p.name AS projectName
     FROM project_ai_change_sets c
     JOIN projects p ON p.id = c.project_id
     WHERE c.id = ? AND p.user_id = ?`,
  ).get(id, user.id) as {
    id: number;
    projectId: number;
    changeKind: "ordinary" | "major";
    status: "proposed" | "applied" | "rejected" | "undone" | "superseded";
    title: string;
    reason: string | null;
    operationsJson: string;
    projectName: string;
  } | undefined;
  if (!row) notFound();
  const operations = projectAiOperationsSchema.parse(JSON.parse(row.operationsJson));

  return (
    <main className="subpage-shell ai-change-preview-page">
      <header className="subpage-header">
        <div><Link className="back-link" href="/projects"><ArrowLeft size={17} />返回项目</Link><h1>{row.title}</h1><p>{row.projectName} · 重大修改预览</p></div>
        <GitCompareArrows size={32} />
      </header>

      <section className="ai-change-reason">
        <span>为什么建议调整</span>
        <p>{row.reason || "这次调整会影响项目主线，需要你完整确认。"}</p>
      </section>

      <section className="ai-change-operation-list">
        {operations.map((operation, index) => {
          if (operation.type === "replace_project_plan") return <article className="ai-plan-preview" key={index}>
            <header><span>项目规划</span><strong>{operation.stages.length} 个阶段</strong></header>
            <dl><div><dt>项目目标</dt><dd>{operation.goal || "未填写"}</dd></div><div><dt>完成标准</dt><dd>{operation.completionCriteria || "未填写"}</dd></div></dl>
            <div className="ai-plan-stage-list">{operation.stages.map((stage, stageIndex) => <section key={`${stage.title}-${stageIndex}`}>
              <h2><span>{stageIndex + 1}</span>{stage.title}</h2>
              <div><h3>一次性任务</h3>{stage.tasks.length ? <ul>{stage.tasks.map((task) => <li key={task}>{task}</li>)}</ul> : <p>无</p>}</div>
              <div><h3>阶段周期任务</h3>{stage.recurringTasks.length ? <ul>{stage.recurringTasks.map((task) => <li key={task.title}>{task.title}<small>{task.frequency === "daily" ? "每天" : task.frequency === "weekly" ? "每周" : task.frequencyLabel}</small></li>)}</ul> : <p>无</p>}</div>
            </section>)}</div>
          </article>;
          return <article className="ai-change-operation" key={index}>
            <span>修改 {index + 1}</span>
            <strong>{operation.type === "set_current_stage" ? "切换当前阶段" : operation.type === "update_project_definition" ? "修改项目定义" : operation.type === "update_stage" ? "修改阶段" : operation.type === "create_task" ? "新增任务" : "删除任务"}</strong>
          </article>;
        })}
      </section>

      {row.status === "proposed" ? <AiChangePreviewActions changeSetId={row.id} /> : <p className="ai-change-processed">这次修改已经处理过了。</p>}
    </main>
  );
}
