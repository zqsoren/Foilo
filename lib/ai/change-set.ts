import { z } from "zod";
import { sqlite } from "../db";

const stagePlanSchema = z.object({
  title: z.string().trim().min(1).max(80),
  tasks: z.array(z.string().trim().min(1).max(120)).max(80).default([]),
  recurringTasks: z.array(z.object({
    title: z.string().trim().min(1).max(120),
    frequency: z.enum(["daily", "weekly", "custom"]),
    frequencyLabel: z.string().trim().min(1).max(30).nullable().default(null),
  })).max(30).default([]),
});

export const projectAiOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("replace_project_plan"),
    goal: z.string().trim().max(500),
    completionCriteria: z.string().trim().max(500),
    stages: z.array(stagePlanSchema).min(1).max(30),
  }),
  z.object({
    type: z.literal("update_project_definition"),
    goal: z.string().trim().max(500).optional(),
    completionCriteria: z.string().trim().max(500).optional(),
  }),
  z.object({
    type: z.literal("create_task"),
    stageId: z.number().int().positive(),
    title: z.string().trim().min(1).max(120),
    recurring: z.boolean().default(false),
    frequency: z.enum(["daily", "weekly", "custom"]).optional(),
    frequencyLabel: z.string().trim().min(1).max(30).nullable().optional(),
  }),
  z.object({
    type: z.literal("update_stage"),
    stageId: z.number().int().positive(),
    title: z.string().trim().min(1).max(80),
  }),
  z.object({
    type: z.literal("delete_task"),
    taskId: z.number().int().positive(),
    recurring: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("set_current_stage"),
    stageId: z.number().int().positive(),
  }),
]);

export const projectAiOperationsSchema = z.array(projectAiOperationSchema).min(1).max(100);
export type ProjectAiOperation = z.infer<typeof projectAiOperationSchema>;

type ProjectSnapshot = {
  project: {
    name: string;
    goal: string | null;
    completionCriteria: string | null;
    workflowStatus: "planning" | "active" | "completed";
    completedAt: number | null;
    currentStageId: number | null;
  };
  stages: Array<{
    id: number;
    title: string;
    position: number;
    completedAt: number | null;
    tasks: Array<{ id: number; title: string; position: number; completedAt: number | null }>;
    recurringTasks: Array<{
      id: number;
      title: string;
      frequency: "daily" | "weekly" | "custom";
      frequencyLabel: string | null;
      position: number;
      checkins: Array<{ id: number; recordDate: string; completedAt: number; createdAt: number }>;
    }>;
  }>;
};

function snapshotProject(projectId: number): ProjectSnapshot {
  const project = sqlite.prepare(
    `SELECT name, goal, completion_criteria AS completionCriteria,
            workflow_status AS workflowStatus, completed_at AS completedAt,
            current_stage_id AS currentStageId
     FROM projects WHERE id = ?`,
  ).get(projectId) as ProjectSnapshot["project"] | undefined;
  if (!project) throw new Error("找不到这个项目");
  const stages = sqlite.prepare(
    `SELECT id, title, position, completed_at AS completedAt
     FROM project_stages WHERE project_id = ? ORDER BY position`,
  ).all(projectId) as Array<Omit<ProjectSnapshot["stages"][number], "tasks" | "recurringTasks">>;
  const tasks = sqlite.prepare(
    `SELECT id, title, position, completed_at AS completedAt
     FROM project_stage_tasks WHERE stage_id = ? ORDER BY position`,
  );
  const recurring = sqlite.prepare(
    `SELECT id, title, frequency, frequency_label AS frequencyLabel, position
     FROM project_stage_recurring_tasks WHERE stage_id = ? ORDER BY position`,
  );
  const checkins = sqlite.prepare(
    `SELECT id, record_date AS recordDate, completed_at AS completedAt, created_at AS createdAt
     FROM project_stage_recurring_checkins WHERE recurring_task_id = ? ORDER BY record_date`,
  );
  return {
    project,
    stages: stages.map((stage) => ({
      ...stage,
      tasks: tasks.all(stage.id) as ProjectSnapshot["stages"][number]["tasks"],
      recurringTasks: (recurring.all(stage.id) as Array<Omit<ProjectSnapshot["stages"][number]["recurringTasks"][number], "checkins">>).map((task) => ({
        ...task,
        checkins: checkins.all(task.id) as ProjectSnapshot["stages"][number]["recurringTasks"][number]["checkins"],
      })),
    })),
  };
}

function replacePlan(projectId: number, operation: Extract<ProjectAiOperation, { type: "replace_project_plan" }>, now: number): void {
  sqlite.prepare("UPDATE projects SET current_stage_id = NULL WHERE id = ?").run(projectId);
  sqlite.prepare("DELETE FROM project_stages WHERE project_id = ?").run(projectId);
  sqlite.prepare(
    `UPDATE projects SET goal = ?, completion_criteria = ?, updated_at = ? WHERE id = ?`,
  ).run(operation.goal || null, operation.completionCriteria || null, now, projectId);
  const addStage = sqlite.prepare(
    `INSERT INTO project_stages(project_id, title, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const addTask = sqlite.prepare(
    `INSERT INTO project_stage_tasks(stage_id, title, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const addRecurring = sqlite.prepare(
    `INSERT INTO project_stage_recurring_tasks(
       stage_id, title, frequency, frequency_label, position, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  let firstStageId: number | null = null;
  operation.stages.forEach((stage, stagePosition) => {
    const stageResult = addStage.run(projectId, stage.title, stagePosition, now, now);
    const stageId = Number(stageResult.lastInsertRowid);
    firstStageId ??= stageId;
    stage.tasks.forEach((title, position) => addTask.run(stageId, title, position, now, now));
    stage.recurringTasks.forEach((task, position) => addRecurring.run(
      stageId, task.title, task.frequency,
      task.frequency === "custom" ? task.frequencyLabel : null,
      position, now, now,
    ));
  });
  sqlite.prepare(
    "UPDATE projects SET current_stage_id = ?, updated_at = ? WHERE id = ?",
  ).run(firstStageId, now, projectId);
}

function applyOperation(projectId: number, operation: ProjectAiOperation, now: number): void {
  if (operation.type === "replace_project_plan") return replacePlan(projectId, operation, now);
  if (operation.type === "update_project_definition") {
    const current = sqlite.prepare(
      "SELECT goal, completion_criteria AS completionCriteria FROM projects WHERE id = ?",
    ).get(projectId) as { goal: string | null; completionCriteria: string | null };
    sqlite.prepare(
      `UPDATE projects SET goal = ?, completion_criteria = ?, updated_at = ? WHERE id = ?`,
    ).run(operation.goal ?? current.goal, operation.completionCriteria ?? current.completionCriteria, now, projectId);
    return;
  }
  if (operation.type === "update_stage") {
    const result = sqlite.prepare(
      `UPDATE project_stages SET title = ?, updated_at = ? WHERE id = ? AND project_id = ?`,
    ).run(operation.title, now, operation.stageId, projectId);
    if (!result.changes) throw new Error("AI 修改引用了不存在的阶段");
    return;
  }
  if (operation.type === "set_current_stage") {
    const stage = sqlite.prepare(
      "SELECT id FROM project_stages WHERE id = ? AND project_id = ?",
    ).get(operation.stageId, projectId);
    if (!stage) throw new Error("AI 修改引用了不存在的阶段");
    sqlite.prepare("UPDATE projects SET current_stage_id = ?, updated_at = ? WHERE id = ?")
      .run(operation.stageId, now, projectId);
    return;
  }
  if (operation.type === "create_task") {
    const stage = sqlite.prepare(
      "SELECT id FROM project_stages WHERE id = ? AND project_id = ?",
    ).get(operation.stageId, projectId);
    if (!stage) throw new Error("AI 修改引用了不存在的阶段");
    const table = operation.recurring ? "project_stage_recurring_tasks" : "project_stage_tasks";
    const position = (sqlite.prepare(
      `SELECT COALESCE(MAX(position), -1) + 1 AS position FROM ${table} WHERE stage_id = ?`,
    ).get(operation.stageId) as { position: number }).position;
    if (operation.recurring) {
      const frequency = operation.frequency ?? "daily";
      if (frequency === "custom" && !operation.frequencyLabel) throw new Error("自定义周期缺少说明");
      sqlite.prepare(
        `INSERT INTO project_stage_recurring_tasks(
           stage_id, title, frequency, frequency_label, position, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(operation.stageId, operation.title, frequency, operation.frequencyLabel ?? null, position, now, now);
    } else {
      sqlite.prepare(
        `INSERT INTO project_stage_tasks(stage_id, title, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(operation.stageId, operation.title, position, now, now);
    }
    return;
  }
  const table = operation.recurring ? "project_stage_recurring_tasks" : "project_stage_tasks";
  const result = sqlite.prepare(
    `DELETE FROM ${table} WHERE id = ? AND stage_id IN (
       SELECT id FROM project_stages WHERE project_id = ?
     )`,
  ).run(operation.taskId, projectId);
  if (!result.changes) throw new Error("AI 修改引用了不存在的任务");
}

function restoreSnapshot(projectId: number, snapshot: ProjectSnapshot, now: number): void {
  sqlite.prepare("UPDATE projects SET current_stage_id = NULL WHERE id = ?").run(projectId);
  sqlite.prepare("DELETE FROM project_stages WHERE project_id = ?").run(projectId);
  const addStage = sqlite.prepare(
    `INSERT INTO project_stages(id, project_id, title, position, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const addTask = sqlite.prepare(
    `INSERT INTO project_stage_tasks(id, stage_id, title, position, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const addRecurring = sqlite.prepare(
    `INSERT INTO project_stage_recurring_tasks(
       id, stage_id, title, frequency, frequency_label, position, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const addCheckin = sqlite.prepare(
    `INSERT INTO project_stage_recurring_checkins(
       id, recurring_task_id, record_date, completed_at, created_at
     ) VALUES (?, ?, ?, ?, ?)`,
  );
  for (const stage of snapshot.stages) {
    addStage.run(stage.id, projectId, stage.title, stage.position, stage.completedAt, now, now);
    for (const task of stage.tasks) addTask.run(task.id, stage.id, task.title, task.position, task.completedAt, now, now);
    for (const task of stage.recurringTasks) {
      addRecurring.run(task.id, stage.id, task.title, task.frequency, task.frequencyLabel, task.position, now, now);
      for (const checkin of task.checkins) addCheckin.run(checkin.id, task.id, checkin.recordDate, checkin.completedAt, checkin.createdAt);
    }
  }
  sqlite.prepare(
    `UPDATE projects SET name = ?, goal = ?, completion_criteria = ?, workflow_status = ?,
       status = ?, completed_at = ?, current_stage_id = ?, updated_at = ? WHERE id = ?`,
  ).run(
    snapshot.project.name,
    snapshot.project.goal,
    snapshot.project.completionCriteria,
    snapshot.project.workflowStatus,
    snapshot.project.workflowStatus === "completed" ? "completed" : "active",
    snapshot.project.completedAt,
    snapshot.project.currentStageId,
    now,
    projectId,
  );
}

export function createProjectAiChangeSet(input: {
  projectId: number;
  conversationId?: number | null;
  changeKind: "ordinary" | "major";
  title: string;
  reason?: string | null;
  operations: unknown;
}): number {
  const operations = projectAiOperationsSchema.parse(input.operations);
  const mustBeMajor = operations.length > 8 || operations.some(
    (operation) => operation.type === "replace_project_plan" || operation.type === "set_current_stage",
  );
  const changeKind = mustBeMajor ? "major" : input.changeKind;
  if (changeKind === "major" && !input.reason?.trim()) throw new Error("重大修改必须说明原因");
  const now = Date.now();
  sqlite.prepare(
    `UPDATE project_ai_change_sets SET status = 'superseded'
     WHERE project_id = ? AND status = 'proposed'`,
  ).run(input.projectId);
  const result = sqlite.prepare(
    `INSERT INTO project_ai_change_sets(
       project_id, conversation_id, change_kind, status, title, reason,
       operations_json, created_at
     ) VALUES (?, ?, ?, 'proposed', ?, ?, ?, ?)`,
  ).run(
    input.projectId,
    input.conversationId ?? null,
    changeKind,
    input.title.trim(),
    changeKind === "major" ? input.reason?.trim() : null,
    JSON.stringify(operations),
    now,
  );
  return Number(result.lastInsertRowid);
}

export function applyProjectAiChangeSet(changeSetId: number): void {
  sqlite.transaction(() => {
    const row = sqlite.prepare(
      `SELECT project_id AS projectId, status, operations_json AS operationsJson
       FROM project_ai_change_sets WHERE id = ?`,
    ).get(changeSetId) as { projectId: number; status: string; operationsJson: string } | undefined;
    if (!row) throw new Error("找不到这次 AI 修改");
    if (row.status !== "proposed") throw new Error("这次修改已经处理过了");
    const operations = projectAiOperationsSchema.parse(JSON.parse(row.operationsJson));
    const before = snapshotProject(row.projectId);
    const now = Date.now();
    for (const operation of operations) applyOperation(row.projectId, operation, now);
    const after = snapshotProject(row.projectId);
    sqlite.prepare(
      `UPDATE project_ai_change_sets SET status = 'superseded'
       WHERE project_id = ? AND status = 'applied'`,
    ).run(row.projectId);
    sqlite.prepare(
      `UPDATE project_ai_change_sets SET status = 'applied', before_snapshot_json = ?,
       after_snapshot_json = ?, applied_at = ? WHERE id = ?`,
    ).run(JSON.stringify(before), JSON.stringify(after), now, changeSetId);
  })();
}

export function undoLatestProjectAiChange(projectId: number): void {
  sqlite.transaction(() => {
    const row = sqlite.prepare(
      `SELECT id, before_snapshot_json AS beforeSnapshotJson
       FROM project_ai_change_sets
       WHERE project_id = ? AND status = 'applied'
       ORDER BY applied_at DESC LIMIT 1`,
    ).get(projectId) as { id: number; beforeSnapshotJson: string | null } | undefined;
    if (!row?.beforeSnapshotJson) throw new Error("没有可以撤销的 AI 修改");
    const snapshot = JSON.parse(row.beforeSnapshotJson) as ProjectSnapshot;
    const now = Date.now();
    restoreSnapshot(projectId, snapshot, now);
    sqlite.prepare(
      `UPDATE project_ai_change_sets SET status = 'undone', undone_at = ? WHERE id = ?`,
    ).run(now, row.id);
  })();
}
