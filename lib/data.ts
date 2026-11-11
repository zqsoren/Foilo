import { addDays, daysBetween, getLifeDate, weekBounds } from "./life-date";
import { sqlite } from "./db";
import type {
  BodyStatus,
  DashboardData,
  HistoryDay,
  SessionItem,
  TimelineItem,
} from "./types";

type SettingsRow = {
  dailyWorkTargetMinutes: number;
  weeklyWorkoutTarget: number;
  lastBackupAt: number | null;
  aiProvider: "none" | "openai" | "openai-compatible";
  aiModel: string;
  aiBaseUrl: string;
  hasAiApiKey: boolean;
  aiApiKeyHint: string | null;
};

export function getSettings(userId: number): SettingsRow {
  const row = sqlite
    .prepare(
      `SELECT daily_work_target_minutes AS dailyWorkTargetMinutes,
              weekly_workout_target AS weeklyWorkoutTarget,
              last_backup_at AS lastBackupAt,
              ai_provider AS aiProvider,
              COALESCE(ai_model, '') AS aiModel,
              COALESCE(ai_base_url, '') AS aiBaseUrl,
              ai_api_key AS aiApiKey
       FROM app_settings WHERE user_id = ?`,
    )
    .get(userId) as Omit<SettingsRow, "hasAiApiKey" | "aiApiKeyHint"> & { aiApiKey: string | null };
  return {
    ...row,
    hasAiApiKey: Boolean(row.aiApiKey),
    aiApiKeyHint: row.aiApiKey ? `•••• ${row.aiApiKey.slice(-4)}` : null,
  };
}

export function ensureDailyRecord(userId: number, recordDate: string): void {
  const settings = getSettings(userId);
  const now = Date.now();
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO daily_records(
        user_id, record_date, work_target_minutes, weekly_workout_target, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      userId,
      recordDate,
      settings.dailyWorkTargetMinutes,
      settings.weeklyWorkoutTarget,
      now,
      now,
    );
}

function sessionRows(userId: number, recordDate: string, now: number): SessionItem[] {
  const rows = sqlite
    .prepare(
      `SELECT id, kind, record_date AS recordDate, started_at AS startedAt,
              ended_at AS endedAt, note, source,
              is_manually_edited AS isManuallyEdited
       FROM time_sessions
       WHERE user_id = ? AND record_date = ? AND deleted_at IS NULL
       ORDER BY started_at ASC`,
    )
    .all(userId, recordDate) as Array<Omit<SessionItem, "durationSeconds">>;
  return rows.map((row) => ({
    ...row,
    isManuallyEdited: Boolean(row.isManuallyEdited),
    durationSeconds: Math.max(0, ((row.endedAt ?? now) - row.startedAt) / 1000),
  }));
}

function timelineDisplay(row: {
  startDate: string;
  endDate: string | null;
}, today: string): Pick<TimelineItem, "display" | "progress"> {
  if (row.startDate > today) {
    return { display: `还有 ${daysBetween(today, row.startDate)} 天开始`, progress: 0 };
  }
  if (row.endDate) {
    if (row.endDate < today) {
      return { display: `已结束 ${daysBetween(row.endDate, today)} 天`, progress: 100 };
    }
    const total = Math.max(1, daysBetween(row.startDate, row.endDate));
    const elapsed = Math.max(0, daysBetween(row.startDate, today));
    return {
      display: `剩余 ${daysBetween(today, row.endDate)} 天`,
      progress: Math.max(0, Math.min(100, Math.round((elapsed / total) * 100))),
    };
  }
  const days = Math.max(0, daysBetween(row.startDate, today));
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  const restDays = days - years * 365 - months * 30;
  const display = [
    years ? `${years}年` : "",
    months ? `${months}个月` : "",
    !years && !months ? `${restDays}天` : "",
  ].join("");
  return { display: `已持续 ${display}`, progress: null };
}

export function getDashboard(userId: number, recordDate = getLifeDate()): DashboardData {
  ensureDailyRecord(userId, recordDate);
  const now = Date.now();
  const settings = getSettings(userId);
  const daily = sqlite
    .prepare(
      `SELECT sleep_minutes AS sleepMinutes,
              work_target_minutes AS workTargetMinutes,
              weekly_workout_target AS weeklyWorkoutTarget,
              daily_state_code AS dailyStateCode,
              daily_state_custom AS dailyStateCustom,
              day_summary AS daySummary,
              closed_at AS closedAt
       FROM daily_records WHERE user_id = ? AND record_date = ?`,
    )
    .get(userId, recordDate) as {
    sleepMinutes: number | null;
    workTargetMinutes: number;
    weeklyWorkoutTarget: number;
    dailyStateCode: string | null;
    dailyStateCustom: string | null;
    daySummary: string | null;
    closedAt: number | null;
  };
  const sessions = sessionRows(userId, recordDate, now);
  const activeRaw = sqlite
    .prepare(
      `SELECT id, kind, record_date AS recordDate, started_at AS startedAt,
              ended_at AS endedAt, note, source,
              is_manually_edited AS isManuallyEdited
       FROM time_sessions WHERE user_id = ? AND ended_at IS NULL AND deleted_at IS NULL`,
    )
    .get(userId) as Omit<SessionItem, "durationSeconds"> | undefined;
  const activeSession = activeRaw
    ? {
        ...activeRaw,
        isManuallyEdited: Boolean(activeRaw.isManuallyEdited),
        durationSeconds: Math.max(0, (now - activeRaw.startedAt) / 1000),
      }
    : null;
  const body = sqlite
    .prepare(
      "SELECT status, note FROM body_records WHERE user_id = ? AND record_date = ?",
    )
    .get(userId, recordDate) as { status: BodyStatus; note: string | null } | undefined;
  const week = weekBounds(recordDate);
  const workoutCount = (
    sqlite
      .prepare(
        `SELECT count(*) AS count FROM body_records
         WHERE user_id = ? AND status = 'workout' AND record_date >= ? AND record_date < ?`,
      )
      .get(userId, week.start, week.end) as { count: number }
  ).count;

  // The project workspace is intentionally kept separate from Today's compact
  // overview until its summary behavior is designed and approved.
  const projectRows: DashboardData["projects"] = [];
  const wishRows = sqlite
    .prepare(
      `SELECT id, title, status, fulfilled_at AS fulfilledAt FROM wishes
       WHERE user_id = ?
       ORDER BY status = 'fulfilled', created_at DESC`,
    )
    .all(userId) as DashboardData["wishes"];
  const rawTimelines = sqlite
    .prepare(
      `SELECT id, name, start_date AS startDate, end_date AS endDate
       FROM life_timelines WHERE user_id = ? ORDER BY created_at DESC`,
    )
    .all(userId) as Array<Omit<TimelineItem, "display" | "progress">>;
  const timelines = rawTimelines.map((row) => ({
    ...row,
    ...timelineDisplay(row, recordDate),
  }));

  const total = (kind: "work" | "entertainment") =>
    sessions
      .filter((session) => session.kind === kind)
      .reduce((sum, session) => sum + session.durationSeconds, 0);

  return {
    lifeDate: recordDate,
    now,
    settings,
    daily: {
      ...daily,
      workSeconds: total("work"),
      entertainmentSeconds: total("entertainment"),
      bodyStatus: body?.status ?? null,
      bodyNote: body?.note ?? null,
      weeklyWorkoutCount: workoutCount,
    },
    activeSession,
    workSessions: sessions.filter((session) => session.kind === "work"),
    entertainmentSessions: sessions.filter(
      (session) => session.kind === "entertainment",
    ),
    projects: projectRows,
    wishes: wishRows,
    timelines,
  };
}

export function getHistory(userId: number, limit = 60): HistoryDay[] {
  const dates = sqlite
    .prepare(
      `SELECT record_date AS recordDate FROM daily_records WHERE user_id = ?
       UNION SELECT record_date FROM time_sessions WHERE user_id = ? AND deleted_at IS NULL
       UNION SELECT record_date FROM body_records WHERE user_id = ?
       ORDER BY recordDate DESC LIMIT ?`,
    )
    .all(userId, userId, userId, limit) as Array<{ recordDate: string }>;
  return dates.map(({ recordDate }) => {
    ensureDailyRecord(userId, recordDate);
    const day = sqlite
      .prepare(
        `SELECT sleep_minutes AS sleepMinutes, daily_state_code AS dailyStateCode,
                daily_state_custom AS dailyStateCustom, day_summary AS daySummary,
                closed_at AS closedAt
         FROM daily_records WHERE user_id = ? AND record_date = ?`,
      )
      .get(userId, recordDate) as Omit<HistoryDay, "recordDate" | "workSeconds" | "entertainmentSeconds" | "bodyStatus">;
    const sessions = sessionRows(userId, recordDate, Date.now());
    const body = sqlite
      .prepare("SELECT status FROM body_records WHERE user_id = ? AND record_date = ?")
      .get(userId, recordDate) as { status: BodyStatus } | undefined;
    return {
      recordDate,
      ...day,
      workSeconds: sessions
        .filter((item) => item.kind === "work")
        .reduce((sum, item) => sum + item.durationSeconds, 0),
      entertainmentSeconds: sessions
        .filter((item) => item.kind === "entertainment")
        .reduce((sum, item) => sum + item.durationSeconds, 0),
      bodyStatus: body?.status ?? null,
    };
  });
}

export function getAvailableHistoryDates(): string[] {
  const latest = getLifeDate();
  return Array.from({ length: 30 }, (_, index) => addDays(latest, -index));
}
