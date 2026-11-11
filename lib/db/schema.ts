import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
};

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: integer("locked_until"),
  ...timestamps,
});

export const authSessions = sqliteTable("auth_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(),
});

export const appSettings = sqliteTable("app_settings", {
  id: integer("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  timezone: text("timezone").notNull(),
  dayBoundaryHour: integer("day_boundary_hour").notNull(),
  dailyWorkTargetMinutes: integer("daily_work_target_minutes").notNull(),
  weeklyWorkoutTarget: integer("weekly_workout_target").notNull(),
  lastBackupAt: integer("last_backup_at"),
  aiProvider: text("ai_provider").notNull().default("none"),
  aiModel: text("ai_model"),
  aiBaseUrl: text("ai_base_url"),
  aiApiKey: text("ai_api_key"),
  weeklyCheckDay: integer("weekly_check_day").notNull().default(1),
  weeklyCheckHour: integer("weekly_check_hour").notNull().default(13),
  ...timestamps,
});

export const dailyRecords = sqliteTable(
  "daily_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    recordDate: text("record_date").notNull(),
    sleepMinutes: integer("sleep_minutes"),
    workTargetMinutes: integer("work_target_minutes").notNull(),
    weeklyWorkoutTarget: integer("weekly_workout_target").notNull(),
    dailyStateCode: text("daily_state_code"),
    dailyStateCustom: text("daily_state_custom"),
    daySummary: text("day_summary"),
    closedAt: integer("closed_at"),
    ...timestamps,
  },
  (table) => [uniqueIndex("daily_records_user_date_unique").on(table.userId, table.recordDate)],
);

export const timeSessions = sqliteTable("time_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  kind: text("kind", { enum: ["work", "entertainment"] }).notNull(),
  recordDate: text("record_date").notNull(),
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at"),
  note: text("note"),
  source: text("source", { enum: ["timer", "manual"] }).notNull(),
  isManuallyEdited: integer("is_manually_edited", { mode: "boolean" })
    .notNull()
    .default(false),
  deletedAt: integer("deleted_at"),
  ...timestamps,
});

export const bodyRecords = sqliteTable(
  "body_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    recordDate: text("record_date").notNull(),
    status: text("status", {
      enum: ["workout", "light_activity", "no_activity"],
    }).notNull(),
    note: text("note"),
    ...timestamps,
  },
  (table) => [uniqueIndex("body_records_user_date_unique").on(table.userId, table.recordDate)],
);

export const realLifeSuggestions = sqliteTable("real_life_suggestions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  category: text("category").notNull(),
  domainKey: text("domain_key").notNull(),
  iconKey: text("icon_key"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const realLifeBatches = sqliteTable("real_life_batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  recordDate: text("record_date").notNull(),
  replacedAt: integer("replaced_at"),
  createdAt: integer("created_at").notNull(),
});

export const realLifeBatchItems = sqliteTable("real_life_batch_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  batchId: integer("batch_id").notNull(),
  suggestionId: integer("suggestion_id").notNull(),
  position: integer("position").notNull(),
  completedAt: integer("completed_at"),
  createdAt: integer("created_at").notNull(),
});

export const todos = sqliteTable("todos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id"),
  title: text("title").notNull(),
  completedAt: integer("completed_at"),
  ...timestamps,
});

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id"),
  name: text("name").notNull(),
  status: text("status", { enum: ["active", "completed"] }).notNull(),
  workflowStatus: text("workflow_status", {
    enum: ["planning", "active", "completed"],
  }).notNull().default("planning"),
  goal: text("goal"),
  completionCriteria: text("completion_criteria"),
  currentStageId: integer("current_stage_id"),
  archivedAt: integer("archived_at"),
  completedAt: integer("completed_at"),
  ...timestamps,
});

export const projectAiConversations = sqliteTable("project_ai_conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  title: text("title").notNull(),
  summary: text("summary"),
  summarizedThroughMessageId: integer("summarized_through_message_id"),
  ...timestamps,
});

export const projectAiMessages = sqliteTable("project_ai_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: integer("conversation_id").notNull(),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  messageType: text("message_type", {
    enum: ["chat", "weekly_report"],
  }).notNull().default("chat"),
  content: text("content").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const projectAiChangeSets = sqliteTable("project_ai_change_sets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  conversationId: integer("conversation_id"),
  changeKind: text("change_kind", { enum: ["ordinary", "major"] }).notNull(),
  status: text("status", {
    enum: ["proposed", "applied", "rejected", "undone", "superseded"],
  }).notNull(),
  title: text("title").notNull(),
  reason: text("reason"),
  operationsJson: text("operations_json").notNull(),
  beforeSnapshotJson: text("before_snapshot_json"),
  afterSnapshotJson: text("after_snapshot_json"),
  createdAt: integer("created_at").notNull(),
  appliedAt: integer("applied_at"),
  undoneAt: integer("undone_at"),
});

export const projectAiDomainSkills = sqliteTable("project_ai_domain_skills", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  version: integer("version").notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const projectWeeklyChecks = sqliteTable("project_weekly_checks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  weekKey: text("week_key").notNull(),
  scheduledAt: integer("scheduled_at").notNull(),
  status: text("status", { enum: ["pending", "completed", "skipped"] }).notNull(),
  reportMessageId: integer("report_message_id"),
  createdAt: integer("created_at").notNull(),
  attemptedAt: integer("attempted_at"),
  completedAt: integer("completed_at"),
});

export const projectStages = sqliteTable(
  "project_stages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: integer("project_id").notNull(),
    title: text("title").notNull(),
    position: integer("position").notNull(),
    completedAt: integer("completed_at"),
    ...timestamps,
  },
  (table) => [uniqueIndex("project_stages_project_position_unique").on(table.projectId, table.position)],
);

export const projectStageTasks = sqliteTable(
  "project_stage_tasks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    stageId: integer("stage_id").notNull(),
    title: text("title").notNull(),
    position: integer("position").notNull(),
    completedAt: integer("completed_at"),
    ...timestamps,
  },
  (table) => [uniqueIndex("project_stage_tasks_stage_position_unique").on(table.stageId, table.position)],
);

export const projectStageRecurringTasks = sqliteTable(
  "project_stage_recurring_tasks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    stageId: integer("stage_id").notNull(),
    title: text("title").notNull(),
    frequency: text("frequency", { enum: ["daily", "weekly", "custom"] }).notNull(),
    frequencyLabel: text("frequency_label"),
    position: integer("position").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("project_stage_recurring_tasks_stage_position_unique").on(table.stageId, table.position)],
);

export const projectStageRecurringCheckins = sqliteTable(
  "project_stage_recurring_checkins",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recurringTaskId: integer("recurring_task_id").notNull(),
    recordDate: text("record_date").notNull(),
    completedAt: integer("completed_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [uniqueIndex("project_stage_recurring_checkins_task_date_unique").on(table.recurringTaskId, table.recordDate)],
);

export const wishes = sqliteTable("wishes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id"),
  title: text("title").notNull(),
  status: text("status", { enum: ["active", "fulfilled"] }).notNull(),
  fulfilledAt: integer("fulfilled_at"),
  ...timestamps,
});

export const lifeTimelines = sqliteTable("life_timelines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id"),
  name: text("name").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  ...timestamps,
});

export const starKeywords = sqliteTable("star_keywords", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  keyword: text("keyword").notNull().unique(),
  normalizedLabel: text("normalized_label").notNull(),
  domainKey: text("domain_key").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});
