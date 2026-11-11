"use server";

import { revalidatePath } from "next/cache";
import { createBackup } from "@/lib/backup";
import { ensureDailyRecord } from "@/lib/data";
import { sqlite } from "@/lib/db";
import { getLifeDate, localInputToEpoch } from "@/lib/life-date";
import { applyProjectAiChangeSet, createProjectAiChangeSet, undoLatestProjectAiChange } from "@/lib/ai/change-set";
import { buildProjectAgentContext, getStoredAiProviderConfig, maybeSummarizeConversation } from "@/lib/ai/project-agent";
import { createProjectAiProvider } from "@/lib/ai/provider";
import { runPendingProjectWeeklyChecks } from "@/lib/ai/weekly-check";
import { requireActionUser } from "@/lib/auth";
import type { AiProviderSettings, BodyStatus, ProjectAiMessage, ProjectRecurringFrequency, ProjectStatus, SessionKind } from "@/lib/types";

export type ActionResult<T extends object = object> =
  | ({ ok: true; message?: string } & T)
  | { ok: false; message: string; code?: string; activeKind?: SessionKind };

function refreshAll(): void {
  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/settings");
  revalidatePath("/projects");
}

function textValue(value: string, max: number, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label}不能为空`);
  if ([...trimmed].length > max) throw new Error(`${label}不能超过 ${max} 个字`);
  return trimmed;
}

function optionalText(value: string | null | undefined, max: number): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if ([...trimmed].length > max) throw new Error(`内容不能超过 ${max} 个字`);
  return trimmed;
}

function failure(error: unknown): ActionResult {
  const raw = error instanceof Error ? error.message : "操作失败，请重试";
  if (raw.includes("SESSION_OVERLAP")) {
    return { ok: false, code: "SESSION_OVERLAP", message: "这段时间与已有记录重叠" };
  }
  if (raw.includes("time_sessions_single_running")) {
    return { ok: false, code: "ACTIVE_SESSION_EXISTS", message: "已有计时正在进行" };
  }
  return { ok: false, message: raw };
}

function assertOwnedProject(userId: number, projectId: number): void {
  if (!sqlite.prepare("SELECT id FROM projects WHERE id = ? AND user_id = ?").get(projectId, userId)) {
    throw new Error("找不到这个项目");
  }
}

function assertOwnedStage(userId: number, stageId: number): void {
  if (!sqlite.prepare(
    `SELECT s.id FROM project_stages s JOIN projects p ON p.id = s.project_id
     WHERE s.id = ? AND p.user_id = ?`,
  ).get(stageId, userId)) throw new Error("找不到这个阶段");
}

function assertOwnedTask(userId: number, taskId: number, recurring = false): void {
  const table = recurring ? "project_stage_recurring_tasks" : "project_stage_tasks";
  if (!sqlite.prepare(
    `SELECT t.id FROM ${table} t
     JOIN project_stages s ON s.id = t.stage_id
     JOIN projects p ON p.id = s.project_id
     WHERE t.id = ? AND p.user_id = ?`,
  ).get(taskId, userId)) throw new Error("找不到这个任务");
}

function assertOwnedConversation(userId: number, projectId: number, conversationId: number): void {
  if (!sqlite.prepare(
    `SELECT c.id FROM project_ai_conversations c
     JOIN projects p ON p.id = c.project_id
     WHERE c.id = ? AND c.project_id = ? AND p.user_id = ?`,
  ).get(conversationId, projectId, userId)) throw new Error("找不到这段对话");
}

export async function saveSleepAction(
  recordDate: string,
  minutes: number | null,
): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440)) {
      throw new Error("睡眠时长需要在 0 到 24 小时之间");
    }
    ensureDailyRecord(user.id, recordDate);
    sqlite
      .prepare(
        "UPDATE daily_records SET sleep_minutes = ?, updated_at = ? WHERE user_id = ? AND record_date = ?",
      )
      .run(minutes, Date.now(), user.id, recordDate);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function saveDailyStateAction(
  recordDate: string,
  code: string | null,
  custom: string | null = null,
): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    const allowed = new Set([
      "great",
      "steady",
      "happy",
      "relaxed",
      "tired",
      "rest",
      "custom",
    ]);
    if (code && !allowed.has(code)) throw new Error("今日状态不正确");
    const customText = code === "custom" ? optionalText(custom, 12) : null;
    if (code === "custom" && !customText) throw new Error("请输入自定义状态");
    ensureDailyRecord(user.id, recordDate);
    sqlite
      .prepare(
        `UPDATE daily_records SET daily_state_code = ?, daily_state_custom = ?,
         updated_at = ? WHERE user_id = ? AND record_date = ?`,
      )
      .run(code, customText, Date.now(), user.id, recordDate);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function startSessionAction(
  kind: SessionKind,
  note: string | null,
  switchExisting = false,
): Promise<ActionResult<{ sessionId: number }>> {
  try {
    const user = await requireActionUser();
    if (!(["work", "entertainment"] as string[]).includes(kind)) {
      throw new Error("计时类型不正确");
    }
    const active = sqlite
      .prepare(
        "SELECT id, kind FROM time_sessions WHERE user_id = ? AND ended_at IS NULL AND deleted_at IS NULL",
      )
      .get(user.id) as { id: number; kind: SessionKind } | undefined;
    if (active && !switchExisting) {
      return {
        ok: false,
        code: "ACTIVE_SESSION_EXISTS",
        activeKind: active.kind,
        message: active.kind === "work" ? "工作仍在计时" : "娱乐仍在计时",
      };
    }
    const now = Date.now();
    const cleanNote = kind === "work" ? optionalText(note, 200) : null;
    const result = sqlite.transaction(() => {
      if (active) {
        sqlite
          .prepare("UPDATE time_sessions SET ended_at = ?, updated_at = ? WHERE id = ?")
          .run(now, now, active.id);
      }
      return sqlite
        .prepare(
          `INSERT INTO time_sessions
           (user_id, kind, record_date, started_at, note, source, is_manually_edited,
            created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'timer', 0, ?, ?)`,
        )
        .run(user.id, kind, getLifeDate(now), now, cleanNote, now, now);
    })();
    refreshAll();
    return { ok: true, sessionId: Number(result.lastInsertRowid) };
  } catch (error) {
    return failure(error) as ActionResult<{ sessionId: number }>;
  }
}

export async function stopSessionAction(
  id: number,
  manualEndAt?: number,
): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    const row = sqlite
      .prepare(
        "SELECT started_at AS startedAt, ended_at AS endedAt FROM time_sessions WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
      )
      .get(id, user.id) as { startedAt: number; endedAt: number | null } | undefined;
    if (!row) throw new Error("找不到这条计时记录");
    if (row.endedAt !== null) throw new Error("这条计时已经结束");
    const endedAt = manualEndAt ?? Date.now();
    if (endedAt < row.startedAt) throw new Error("结束时间不能早于开始时间");
    sqlite
      .prepare(
        `UPDATE time_sessions SET ended_at = ?, is_manually_edited = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .run(endedAt, manualEndAt ? 1 : 0, Date.now(), id, user.id);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function createManualSessionAction(input: {
  kind: SessionKind;
  startedAt: string;
  endedAt: string;
  note?: string | null;
}): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    const startedAt = localInputToEpoch(input.startedAt);
    const endedAt = localInputToEpoch(input.endedAt);
    if (endedAt <= startedAt) throw new Error("结束时间必须晚于开始时间");
    if (endedAt > Date.now() + 60_000) throw new Error("不能补录未来的时间");
    const now = Date.now();
    sqlite
      .prepare(
        `INSERT INTO time_sessions
         (user_id, kind, record_date, started_at, ended_at, note, source,
          is_manually_edited, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'manual', 1, ?, ?)`,
      )
      .run(
        user.id,
        input.kind,
        getLifeDate(startedAt),
        startedAt,
        endedAt,
        input.kind === "work" ? optionalText(input.note, 200) : null,
        now,
        now,
      );
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function updateSessionAction(input: {
  id: number;
  startedAt: string;
  endedAt: string;
  note?: string | null;
}): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    const startedAt = localInputToEpoch(input.startedAt);
    const endedAt = localInputToEpoch(input.endedAt);
    if (endedAt <= startedAt) throw new Error("结束时间必须晚于开始时间");
    const row = sqlite
      .prepare("SELECT kind FROM time_sessions WHERE id = ? AND user_id = ? AND deleted_at IS NULL")
      .get(input.id, user.id) as { kind: SessionKind } | undefined;
    if (!row) throw new Error("找不到这条记录");
    sqlite
      .prepare(
        `UPDATE time_sessions SET record_date = ?, started_at = ?, ended_at = ?,
         note = ?, is_manually_edited = 1, updated_at = ? WHERE id = ? AND user_id = ?`,
      )
      .run(
        getLifeDate(startedAt),
        startedAt,
        endedAt,
        row.kind === "work" ? optionalText(input.note, 200) : null,
        Date.now(),
        input.id,
        user.id,
      );
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteSessionAction(id: number): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    const now = Date.now();
    const result = sqlite
      .prepare("UPDATE time_sessions SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .run(now, now, id, user.id);
    if (!result.changes) throw new Error("找不到这条记录");
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function saveBodyAction(
  recordDate: string,
  status: BodyStatus,
  note: string | null,
): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    const allowed: BodyStatus[] = ["workout", "light_activity", "no_activity"];
    if (!allowed.includes(status)) throw new Error("身体状态不正确");
    const now = Date.now();
    sqlite
      .prepare(
        `INSERT INTO body_records(user_id, record_date, status, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, record_date) DO UPDATE SET
           status = excluded.status, note = excluded.note, updated_at = excluded.updated_at`,
      )
      .run(user.id, recordDate, status, optionalText(note, 100), now, now);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function toggleWorkoutAction(recordDate: string): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    const current = sqlite
      .prepare("SELECT status FROM body_records WHERE user_id = ? AND record_date = ?")
      .get(user.id, recordDate) as { status: BodyStatus } | undefined;

    if (current?.status === "workout") {
      sqlite.prepare("DELETE FROM body_records WHERE user_id = ? AND record_date = ?").run(user.id, recordDate);
    } else {
      const now = Date.now();
      sqlite
        .prepare(
          `INSERT INTO body_records(user_id, record_date, status, note, created_at, updated_at)
           VALUES (?, ?, 'workout', NULL, ?, ?)
           ON CONFLICT(user_id, record_date) DO UPDATE SET
             status = 'workout', note = NULL, updated_at = excluded.updated_at`,
        )
        .run(user.id, recordDate, now, now);
    }

    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function createProjectAction(
  input: string | { name: string; goal?: string; completionCriteria?: string },
): Promise<ActionResult<{ projectId: number }>> {
  try {
    const user = await requireActionUser();
    const values = typeof input === "string"
      ? { name: input, goal: null, completionCriteria: null }
      : {
          name: input.name,
          goal: optionalText(input.goal, 500),
          completionCriteria: optionalText(input.completionCriteria, 500),
        };
    const now = Date.now();
    const result = sqlite.transaction(() => {
      const inserted = sqlite
        .prepare(
          `INSERT INTO projects(
            user_id, name, status, workflow_status, goal, completion_criteria, created_at, updated_at
          ) VALUES (?, ?, 'active', 'planning', ?, ?, ?, ?)`,
        )
        .run(
          user.id,
          textValue(values.name, 80, "项目名称"),
          values.goal,
          values.completionCriteria,
          now,
          now,
        );
      const projectId = Number(inserted.lastInsertRowid);
      sqlite.prepare(
        `INSERT INTO project_ai_conversations(project_id, title, created_at, updated_at)
         VALUES (?, '对话 1', ?, ?)`,
      ).run(projectId, now, now);
      return projectId;
    })();
    refreshAll();
    return { ok: true, projectId: result };
  } catch (error) {
    return failure(error) as ActionResult<{ projectId: number }>;
  }
}

export async function updateProjectAction(input: {
  id: number;
  name: string;
  goal: string;
  completionCriteria: string;
}): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    const result = sqlite
      .prepare(
        `UPDATE projects SET name = ?, goal = ?, completion_criteria = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .run(
        textValue(input.name, 80, "项目名称"),
        optionalText(input.goal, 500),
        optionalText(input.completionCriteria, 500),
        Date.now(),
        input.id,
        user.id,
      );
    if (!result.changes) throw new Error("找不到这个项目");
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function archiveProjectAction(id: number, archived: boolean): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    const result = sqlite
      .prepare("UPDATE projects SET archived_at = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .run(archived ? Date.now() : null, Date.now(), id, user.id);
    if (!result.changes) throw new Error("找不到这个项目");
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function updateProjectStatusAction(
  id: number,
  status: ProjectStatus,
): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    const allowed: ProjectStatus[] = ["planning", "active", "completed"];
    if (!allowed.includes(status)) throw new Error("项目状态不正确");
    const now = Date.now();
    const result = sqlite.prepare(
      `UPDATE projects SET workflow_status = ?, status = ?, completed_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    ).run(
      status,
      status === "completed" ? "completed" : "active",
      status === "completed" ? now : null,
      now,
      id,
      user.id,
    );
    if (!result.changes) throw new Error("找不到这个项目");
    if (status !== "active") {
      sqlite.prepare(
        `UPDATE project_weekly_checks SET status = 'skipped'
         WHERE project_id = ? AND status = 'pending'`,
      ).run(id);
    }
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function createProjectStageAction(
  projectId: number,
  title: string,
): Promise<ActionResult<{ stageId: number }>> {
  try {
    const user = await requireActionUser();
    assertOwnedProject(user.id, projectId);
    const now = Date.now();
    const result = sqlite.transaction(() => {
      const position = (
        sqlite
          .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS position FROM project_stages WHERE project_id = ?")
          .get(projectId) as { position: number }
      ).position;
      const inserted = sqlite
        .prepare(
          `INSERT INTO project_stages(project_id, title, position, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(projectId, textValue(title, 80, "阶段名称"), position, now, now);
      const stageId = Number(inserted.lastInsertRowid);
      sqlite
        .prepare(
          `UPDATE projects SET current_stage_id = COALESCE(current_stage_id, ?),
             updated_at = ? WHERE id = ?`,
        )
        .run(stageId, now, projectId);
      return stageId;
    })();
    refreshAll();
    return { ok: true, stageId: result };
  } catch (error) {
    return failure(error) as ActionResult<{ stageId: number }>;
  }
}

export async function updateProjectStageAction(id: number, title: string): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    assertOwnedStage(user.id, id);
    const result = sqlite
      .prepare("UPDATE project_stages SET title = ?, updated_at = ? WHERE id = ?")
      .run(textValue(title, 80, "阶段名称"), Date.now(), id);
    if (!result.changes) throw new Error("找不到这个阶段");
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function createProjectStageTaskAction(
  stageId: number,
  title: string,
): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    assertOwnedStage(user.id, stageId);
    const position = (
      sqlite
        .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS position FROM project_stage_tasks WHERE stage_id = ?")
        .get(stageId) as { position: number }
    ).position;
    const now = Date.now();
    sqlite
      .prepare(
        `INSERT INTO project_stage_tasks(stage_id, title, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(stageId, textValue(title, 120, "任务名称"), position, now, now);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function updateProjectTaskTitleAction(input: {
  id: number;
  title: string;
  kind: "once" | "recurring";
}): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    if (input.kind !== "once" && input.kind !== "recurring") throw new Error("任务类型不正确");
    const recurring = input.kind === "recurring";
    assertOwnedTask(user.id, input.id, recurring);
    const title = textValue(input.title, 120, "任务名称");
    const table = recurring ? "project_stage_recurring_tasks" : "project_stage_tasks";
    const result = sqlite.prepare(`UPDATE ${table} SET title = ?, updated_at = ? WHERE id = ?`)
      .run(title, Date.now(), input.id);
    if (!result.changes) throw new Error("找不到这个任务");
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function toggleProjectStageTaskAction(id: number): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    assertOwnedTask(user.id, id);
    const row = sqlite
      .prepare("SELECT completed_at AS completedAt FROM project_stage_tasks WHERE id = ?")
      .get(id) as { completedAt: number | null } | undefined;
    if (!row) throw new Error("找不到这个任务");
    sqlite
      .prepare("UPDATE project_stage_tasks SET completed_at = ?, updated_at = ? WHERE id = ?")
      .run(row.completedAt ? null : Date.now(), Date.now(), id);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteProjectStageTaskAction(id: number): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    assertOwnedTask(user.id, id);
    const result = sqlite.prepare("DELETE FROM project_stage_tasks WHERE id = ?").run(id);
    if (!result.changes) throw new Error("找不到这个任务");
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function createProjectStageRecurringTaskAction(input: {
  stageId: number;
  title: string;
  frequency: ProjectRecurringFrequency;
  frequencyLabel?: string | null;
}): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    assertOwnedStage(user.id, input.stageId);
    const allowed: ProjectRecurringFrequency[] = ["daily", "weekly", "custom"];
    if (!allowed.includes(input.frequency)) throw new Error("周期设置不正确");
    const label = input.frequency === "custom"
      ? textValue(input.frequencyLabel ?? "", 30, "自定义周期")
      : null;
    const position = (
      sqlite
        .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS position FROM project_stage_recurring_tasks WHERE stage_id = ?")
        .get(input.stageId) as { position: number }
    ).position;
    const now = Date.now();
    sqlite
      .prepare(
        `INSERT INTO project_stage_recurring_tasks(
          stage_id, title, frequency, frequency_label, position, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.stageId,
        textValue(input.title, 120, "周期任务名称"),
        input.frequency,
        label,
        position,
        now,
        now,
      );
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function toggleProjectRecurringCheckinAction(
  id: number,
  recordDate: string,
): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    assertOwnedTask(user.id, id, true);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(recordDate)) throw new Error("日期不正确");
    const existing = sqlite
      .prepare(
        `SELECT id FROM project_stage_recurring_checkins
         WHERE recurring_task_id = ? AND record_date = ?`,
      )
      .get(id, recordDate) as { id: number } | undefined;
    if (existing) {
      sqlite.prepare("DELETE FROM project_stage_recurring_checkins WHERE id = ?").run(existing.id);
    } else {
      const now = Date.now();
      sqlite
        .prepare(
          `INSERT INTO project_stage_recurring_checkins(
            recurring_task_id, record_date, completed_at, created_at
          ) VALUES (?, ?, ?, ?)`,
        )
        .run(id, recordDate, now, now);
    }
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteProjectStageRecurringTaskAction(id: number): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    assertOwnedTask(user.id, id, true);
    const result = sqlite.prepare("DELETE FROM project_stage_recurring_tasks WHERE id = ?").run(id);
    if (!result.changes) throw new Error("找不到这个周期任务");
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function completeCurrentProjectStageAction(
  projectId: number,
  stageId: number,
): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    assertOwnedProject(user.id, projectId);
    const now = Date.now();
    sqlite.transaction(() => {
      const project = sqlite
        .prepare("SELECT current_stage_id AS currentStageId FROM projects WHERE id = ?")
        .get(projectId) as { currentStageId: number | null } | undefined;
      if (!project) throw new Error("找不到这个项目");
      if (project.currentStageId !== stageId) throw new Error("只能完成当前阶段");
      const stage = sqlite
        .prepare("SELECT position FROM project_stages WHERE id = ? AND project_id = ?")
        .get(stageId, projectId) as { position: number } | undefined;
      if (!stage) throw new Error("找不到这个阶段");
      sqlite
        .prepare("UPDATE project_stages SET completed_at = ?, updated_at = ? WHERE id = ?")
        .run(now, now, stageId);
      const next = sqlite
        .prepare(
          `SELECT id FROM project_stages
           WHERE project_id = ? AND position > ? ORDER BY position LIMIT 1`,
        )
        .get(projectId, stage.position) as { id: number } | undefined;
      sqlite
        .prepare("UPDATE projects SET current_stage_id = ?, updated_at = ? WHERE id = ?")
        .run(next?.id ?? null, now, projectId);
    })();
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function setCurrentProjectStageAction(
  projectId: number,
  stageId: number,
): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    assertOwnedProject(user.id, projectId);
    const stage = sqlite.prepare(
      "SELECT id FROM project_stages WHERE id = ? AND project_id = ?",
    ).get(stageId, projectId);
    if (!stage) throw new Error("找不到这个阶段");
    sqlite.prepare(
      "UPDATE projects SET current_stage_id = ?, updated_at = ? WHERE id = ?",
    ).run(stageId, Date.now(), projectId);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function createProjectConversationAction(
  projectId: number,
): Promise<ActionResult<{ conversationId: number }>> {
  try {
    const user = await requireActionUser();
    assertOwnedProject(user.id, projectId);
    const count = (sqlite.prepare(
      "SELECT count(*) AS count FROM project_ai_conversations WHERE project_id = ?",
    ).get(projectId) as { count: number }).count;
    const now = Date.now();
    const result = sqlite.prepare(
      `INSERT INTO project_ai_conversations(project_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    ).run(projectId, `对话 ${count + 1}`, now, now);
    refreshAll();
    return { ok: true, conversationId: Number(result.lastInsertRowid) };
  } catch (error) {
    return failure(error) as ActionResult<{ conversationId: number }>;
  }
}

export async function getProjectConversationMessagesAction(
  projectId: number,
  conversationId: number,
): Promise<ActionResult<{ messages: Array<{
  id: number;
  conversationId: number;
  role: "user" | "assistant";
  messageType: "chat" | "weekly_report";
  content: string;
  createdAt: number;
}> }>> {
  try {
    const user = await requireActionUser();
    assertOwnedConversation(user.id, projectId, conversationId);
    const messages = sqlite.prepare(
      `SELECT id, conversation_id AS conversationId, role,
              message_type AS messageType, content, created_at AS createdAt
       FROM project_ai_messages WHERE conversation_id = ? ORDER BY id`,
    ).all(conversationId) as Array<{
      id: number;
      conversationId: number;
      role: "user" | "assistant";
      messageType: "chat" | "weekly_report";
      content: string;
      createdAt: number;
    }>;
    return { ok: true, messages };
  } catch (error) {
    return failure(error) as ActionResult<{ messages: [] }>;
  }
}

export async function sendProjectAiMessageAction(input: {
  projectId: number;
  conversationId: number;
  content: string;
}): Promise<ActionResult<{ messages: ProjectAiMessage[]; changeSetId: number | null }>> {
  try {
    const user = await requireActionUser();
    const content = textValue(input.content, 6000, "消息");
    assertOwnedConversation(user.id, input.projectId, input.conversationId);
    const provider = createProjectAiProvider(getStoredAiProviderConfig(user.id));
    if (!provider) throw new Error("请先在设置中完整配置 AI 服务商、模型、API 地址和密钥");

    const context = buildProjectAgentContext(user.id, input.projectId, input.conversationId);
    context.recentMessages.push({ role: "user", content });
    const response = await provider.send(context);
    const now = Date.now();
    const saved = sqlite.transaction(() => {
      const userResult = sqlite.prepare(
        `INSERT INTO project_ai_messages(conversation_id, role, message_type, content, created_at)
         VALUES (?, 'user', 'chat', ?, ?)`,
      ).run(input.conversationId, content, now);

      let assistantContent: string;
      let changeSetId: number | null = null;
      if (response.type === "conversation") {
        assistantContent = response.content;
      } else {
        changeSetId = createProjectAiChangeSet({
          projectId: input.projectId,
          conversationId: input.conversationId,
          changeKind: response.changeKind,
          title: response.title,
          reason: response.reason,
          operations: response.operations,
        });
        assistantContent = response.changeKind === "major"
          ? `我整理了“${response.title}”，这会影响项目主线，请先查看完整预览再决定。`
          : `我整理了“${response.title}”，确认前不会修改项目。`;
      }
      const assistantResult = sqlite.prepare(
        `INSERT INTO project_ai_messages(conversation_id, role, message_type, content, created_at)
         VALUES (?, 'assistant', 'chat', ?, ?)`,
      ).run(input.conversationId, assistantContent, now + 1);
      sqlite.prepare(
        "UPDATE project_ai_conversations SET updated_at = ? WHERE id = ?",
      ).run(now + 1, input.conversationId);
      return {
        changeSetId,
        messages: [
          { id: Number(userResult.lastInsertRowid), conversationId: input.conversationId, role: "user" as const, messageType: "chat" as const, content, createdAt: now },
          { id: Number(assistantResult.lastInsertRowid), conversationId: input.conversationId, role: "assistant" as const, messageType: "chat" as const, content: assistantContent, createdAt: now + 1 },
        ],
      };
    })();

    try {
      await maybeSummarizeConversation(input.conversationId, provider);
    } catch {}
    refreshAll();
    return { ok: true, ...saved };
  } catch (error) {
    return failure(error) as ActionResult<{ messages: ProjectAiMessage[]; changeSetId: number | null }>;
  }
}

export async function testAiConnectionAction(): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    const provider = createProjectAiProvider(getStoredAiProviderConfig(user.id));
    if (!provider) throw new Error("请先完整填写 AI 配置并保存");
    await provider.testConnection();
    return { ok: true, message: "AI 连接成功" };
  } catch (error) {
    return failure(error);
  }
}

export async function runPendingProjectWeeklyChecksAction(): Promise<ActionResult<{ completed: number }>> {
  try {
    const user = await requireActionUser();
    const { completed } = await runPendingProjectWeeklyChecks(user.id);
    refreshAll();
    return { ok: true, completed };
  } catch (error) {
    return failure(error) as ActionResult<{ completed: number }>;
  }
}

export async function saveAiSettingsAction(input: {
  provider: AiProviderSettings["provider"];
  model: string;
  baseUrl: string;
  apiKey?: string;
}): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    const providers: AiProviderSettings["provider"][] = ["none", "openai", "openai-compatible"];
    if (!providers.includes(input.provider)) throw new Error("AI 服务商不正确");
    const model = optionalText(input.model, 100);
    const baseUrl = optionalText(input.baseUrl, 300);
    const apiKey = optionalText(input.apiKey, 500);
    sqlite.prepare(
      `UPDATE app_settings SET ai_provider = ?, ai_model = ?, ai_base_url = ?,
       ai_api_key = COALESCE(?, ai_api_key), updated_at = ? WHERE user_id = ?`,
    ).run(input.provider, model, baseUrl, apiKey, Date.now(), user.id);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function clearAiApiKeyAction(): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    sqlite.prepare(
      "UPDATE app_settings SET ai_api_key = NULL, updated_at = ? WHERE user_id = ?",
    ).run(Date.now(), user.id);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function confirmProjectAiChangeSetAction(id: number): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    const owned = sqlite.prepare(
      `SELECT c.id FROM project_ai_change_sets c
       JOIN projects p ON p.id = c.project_id
       WHERE c.id = ? AND p.user_id = ?`,
    ).get(id, user.id);
    if (!owned) throw new Error("找不到这次修改");
    applyProjectAiChangeSet(id);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function rejectProjectAiChangeSetAction(id: number): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    const result = sqlite.prepare(
      `UPDATE project_ai_change_sets SET status = 'rejected'
       WHERE id = ? AND status = 'proposed'
         AND project_id IN (SELECT id FROM projects WHERE user_id = ?)`,
    ).run(id, user.id);
    if (!result.changes) throw new Error("这次修改已经处理过了");
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function undoLatestProjectAiChangeAction(projectId: number): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    assertOwnedProject(user.id, projectId);
    undoLatestProjectAiChange(projectId);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function toggleProjectAction(id: number): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    const row = sqlite.prepare("SELECT status FROM projects WHERE id = ? AND user_id = ?").get(id, user.id) as
      | { status: "active" | "completed" }
      | undefined;
    if (!row) return { ok: false, message: "找不到这个项目" };
    const active = row.status === "active";
    sqlite.prepare(
      "UPDATE projects SET status = ?, completed_at = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    ).run(active ? "completed" : "active", active ? Date.now() : null, Date.now(), id, user.id);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteProjectAction(id: number): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    sqlite.prepare("DELETE FROM projects WHERE id = ? AND user_id = ?").run(id, user.id);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function createWishAction(title: string): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    const now = Date.now();
    sqlite
      .prepare(
        "INSERT INTO wishes(user_id, title, status, created_at, updated_at) VALUES (?, ?, 'active', ?, ?)",
      )
      .run(user.id, textValue(title, 120, "愿望"), now, now);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function toggleWishAction(id: number): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    const row = sqlite.prepare("SELECT status FROM wishes WHERE id = ? AND user_id = ?").get(id, user.id) as
      | { status: "active" | "fulfilled" }
      | undefined;
    if (!row) return { ok: false, message: "找不到这个愿望" };
    const active = row.status === "active";
    sqlite.prepare(
      "UPDATE wishes SET status = ?, fulfilled_at = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    ).run(active ? "fulfilled" : "active", active ? Date.now() : null, Date.now(), id, user.id);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteWishAction(id: number): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    sqlite.prepare("DELETE FROM wishes WHERE id = ? AND user_id = ?").run(id, user.id);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function createTimelineAction(input: {
  name: string;
  startDate: string;
  endDate: string | null;
}): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(input.startDate)) throw new Error("开始日期不正确");
    if (input.endDate && !datePattern.test(input.endDate)) throw new Error("结束日期不正确");
    if (input.endDate && input.endDate < input.startDate) {
      throw new Error("结束日期不能早于开始日期");
    }
    const now = Date.now();
    sqlite
      .prepare(
        `INSERT INTO life_timelines(user_id, name, start_date, end_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(user.id, textValue(input.name, 80, "时间线名称"), input.startDate, input.endDate, now, now);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteTimelineAction(id: number): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    sqlite.prepare("DELETE FROM life_timelines WHERE id = ? AND user_id = ?").run(id, user.id);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function saveSettingsAction(
  workTargetMinutes: number,
  weeklyWorkoutTarget: number,
): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    if (!Number.isInteger(workTargetMinutes) || workTargetMinutes < 0 || workTargetMinutes > 1439) {
      throw new Error("每日工作目标不正确");
    }
    if (!Number.isInteger(weeklyWorkoutTarget) || weeklyWorkoutTarget < 0 || weeklyWorkoutTarget > 7) {
      throw new Error("每周健身目标需要在 0 到 7 次之间");
    }
    const now = Date.now();
    const today = getLifeDate(now);
    ensureDailyRecord(user.id, today);
    sqlite.transaction(() => {
      sqlite
        .prepare(
          `UPDATE app_settings SET daily_work_target_minutes = ?,
           weekly_workout_target = ?, updated_at = ? WHERE user_id = ?`,
        )
        .run(workTargetMinutes, weeklyWorkoutTarget, now, user.id);
      sqlite
        .prepare(
          `UPDATE daily_records SET work_target_minutes = ?, weekly_workout_target = ?,
           updated_at = ? WHERE user_id = ? AND record_date = ?`,
        )
        .run(workTargetMinutes, weeklyWorkoutTarget, now, user.id, today);
    })();
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function closeDayAction(input: {
  recordDate: string;
  stateCode: string | null;
  stateCustom: string | null;
  summary: string | null;
}): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    const active = sqlite
      .prepare(
        "SELECT id FROM time_sessions WHERE user_id = ? AND ended_at IS NULL AND deleted_at IS NULL",
      )
      .get(user.id);
    if (active) return { ok: false, code: "ACTIVE_SESSION_EXISTS", message: "请先结束正在运行的计时" };
    const stateResult = await saveDailyStateAction(
      input.recordDate,
      input.stateCode,
      input.stateCustom,
    );
    if (!stateResult.ok) return stateResult;
    const summary = optionalText(input.summary, 1000);
    ensureDailyRecord(user.id, input.recordDate);
    sqlite
      .prepare(
        `UPDATE daily_records SET day_summary = ?, closed_at = ?, updated_at = ?
         WHERE user_id = ? AND record_date = ?`,
      )
      .run(summary, Date.now(), Date.now(), user.id, input.recordDate);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function createBackupAction(): Promise<ActionResult<{ path: string }>> {
  try {
    const user = await requireActionUser();
    if (user.id !== 1) throw new Error("只有站点所有者可以创建整站备份");
    const path = await createBackup("manual");
    refreshAll();
    return { ok: true, path };
  } catch (error) {
    return failure(error) as ActionResult<{ path: string }>;
  }
}
