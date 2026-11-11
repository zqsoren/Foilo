import { sqlite } from "./db";
import { getLifeDate } from "./life-date";
import { seedSampleProject } from "./user-bootstrap";
import type {
  AiProviderSettings,
  ProjectAiConversation,
  ProjectAiChangeSummary,
  ProjectAiMessage,
  ProjectStage,
  ProjectStageRecurringTask,
  ProjectStageTask,
  ProjectWorkspaceData,
  ProjectWorkspaceItem,
} from "./types";

type ProjectRow = Omit<ProjectWorkspaceItem, "stages" | "conversations" | "pendingWeeklyCheck" | "pendingAiChange" | "canUndoAiChange">;

function loadPendingChange(projectId: number): ProjectAiChangeSummary | null {
  const row = sqlite.prepare(
    `SELECT id, change_kind AS changeKind, title, reason,
            operations_json AS operationsJson, created_at AS createdAt
     FROM project_ai_change_sets
     WHERE project_id = ? AND status = 'proposed'
     ORDER BY created_at DESC LIMIT 1`,
  ).get(projectId) as (Omit<ProjectAiChangeSummary, "operations"> & { operationsJson: string }) | undefined;
  if (!row) return null;
  return { ...row, operations: JSON.parse(row.operationsJson) as unknown[] };
}

function getAiSettings(userId: number): AiProviderSettings {
  const row = sqlite.prepare(
    `SELECT ai_provider AS provider, COALESCE(ai_model, '') AS model,
            COALESCE(ai_base_url, '') AS baseUrl, ai_api_key AS apiKey
     FROM app_settings WHERE user_id = ?`,
  ).get(userId) as { provider: AiProviderSettings["provider"]; model: string; baseUrl: string; apiKey: string | null };
  return {
    provider: row.provider,
    model: row.model,
    baseUrl: row.baseUrl,
    hasApiKey: Boolean(row.apiKey),
    apiKeyHint: row.apiKey ? `•••• ${row.apiKey.slice(-4)}` : null,
  };
}

function ensureConversation(projectId: number): void {
  const exists = sqlite.prepare(
    "SELECT id FROM project_ai_conversations WHERE project_id = ? LIMIT 1",
  ).get(projectId);
  if (exists) return;
  const now = Date.now();
  sqlite.prepare(
    `INSERT INTO project_ai_conversations(project_id, title, created_at, updated_at)
     VALUES (?, '对话 1', ?, ?)`,
  ).run(projectId, now, now);
}

function loadConversations(projectId: number): ProjectAiConversation[] {
  const rows = sqlite.prepare(
    `SELECT id, project_id AS projectId, title, summary,
            created_at AS createdAt, updated_at AS updatedAt
     FROM project_ai_conversations WHERE project_id = ?
     ORDER BY created_at DESC`,
  ).all(projectId) as Array<Omit<ProjectAiConversation, "messages">>;
  const newestId = rows[0]?.id;
  const loadMessages = sqlite.prepare(
    `SELECT id, conversation_id AS conversationId, role, message_type AS messageType,
            content, created_at AS createdAt
     FROM project_ai_messages WHERE conversation_id = ? ORDER BY id`,
  );
  return rows.map((row) => ({
    ...row,
    messages: row.id === newestId ? loadMessages.all(row.id) as ProjectAiMessage[] : [],
  }));
}

function ensureWeeklyCheckRows(userId: number, now = Date.now()): void {
  const settings = sqlite.prepare(
    `SELECT weekly_check_day AS day, weekly_check_hour AS hour
     FROM app_settings WHERE user_id = ?`,
  ).get(userId) as { day: number; hour: number };
  const shanghaiNow = new Date(now + 8 * 60 * 60 * 1000);
  const currentDay = shanghaiNow.getUTCDay();
  const date = new Date(Date.UTC(
    shanghaiNow.getUTCFullYear(),
    shanghaiNow.getUTCMonth(),
    shanghaiNow.getUTCDate() - ((currentDay - settings.day + 7) % 7),
  ));
  const weekKey = date.toISOString().slice(0, 10);
  const scheduledAt = Date.UTC(
    date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), settings.hour,
  ) - 8 * 60 * 60 * 1000;
  if (now < scheduledAt) return;
  const projects = sqlite.prepare(
    `SELECT id FROM projects
     WHERE user_id = ? AND workflow_status = 'active' AND archived_at IS NULL`,
  ).all(userId) as Array<{ id: number }>;
  const insert = sqlite.prepare(
    `INSERT OR IGNORE INTO project_weekly_checks(
       project_id, week_key, scheduled_at, status, created_at
     ) VALUES (?, ?, ?, 'pending', ?)`,
  );
  sqlite.transaction(() => {
    for (const project of projects) insert.run(project.id, weekKey, scheduledAt, now);
  })();
}

function seedProjectWorkspace(userId: number): void {
  seedSampleProject(userId);
}

function loadStages(projectId: number, lifeDate: string): ProjectStage[] {
  const stages = sqlite
    .prepare(
      `SELECT id, project_id AS projectId, title, position, completed_at AS completedAt
       FROM project_stages WHERE project_id = ? ORDER BY position`,
    )
    .all(projectId) as Array<Omit<ProjectStage, "tasks" | "recurringTasks">>;

  const loadTasks = sqlite.prepare(
    `SELECT id, title, position, completed_at AS completedAt
     FROM project_stage_tasks WHERE stage_id = ? ORDER BY position`,
  );
  const loadRecurring = sqlite.prepare(
    `SELECT r.id, r.title, r.frequency, r.frequency_label AS frequencyLabel, r.position,
            EXISTS(
              SELECT 1 FROM project_stage_recurring_checkins c
              WHERE c.recurring_task_id = r.id AND c.record_date = ?
            ) AS completedToday
     FROM project_stage_recurring_tasks r
     WHERE r.stage_id = ? ORDER BY r.position`,
  );

  return stages.map((stage) => ({
    ...stage,
    tasks: loadTasks.all(stage.id) as ProjectStageTask[],
    recurringTasks: (loadRecurring.all(lifeDate, stage.id) as Array<Omit<ProjectStageRecurringTask, "completedToday"> & { completedToday: number }>).map(
      (task) => ({ ...task, completedToday: Boolean(task.completedToday) }),
    ),
  }));
}

export function getProjectWorkspace(userId: number): ProjectWorkspaceData {
  seedProjectWorkspace(userId);
  ensureWeeklyCheckRows(userId);
  const lifeDate = getLifeDate();
  const rows = sqlite
    .prepare(
      `SELECT id, name, COALESCE(goal, '') AS goal,
              COALESCE(completion_criteria, '') AS completionCriteria,
              workflow_status AS status, current_stage_id AS currentStageId,
              completed_at AS completedAt, archived_at AS archivedAt
       FROM projects WHERE user_id = ? ORDER BY archived_at IS NOT NULL, created_at`,
    )
    .all(userId) as ProjectRow[];
  const projects = rows.map((project) => {
    ensureConversation(project.id);
    return {
      ...project,
      stages: loadStages(project.id, lifeDate),
      conversations: loadConversations(project.id),
      pendingWeeklyCheck: Boolean(sqlite.prepare(
        "SELECT id FROM project_weekly_checks WHERE project_id = ? AND status = 'pending' LIMIT 1",
      ).get(project.id)),
      pendingAiChange: loadPendingChange(project.id),
      canUndoAiChange: Boolean(sqlite.prepare(
        "SELECT id FROM project_ai_change_sets WHERE project_id = ? AND status = 'applied' LIMIT 1",
      ).get(project.id)),
    };
  });
  return {
    projects: projects.filter((project) => project.archivedAt === null),
    archivedProjects: projects.filter((project) => project.archivedAt !== null),
    lifeDate,
    aiSettings: getAiSettings(userId),
  };
}
