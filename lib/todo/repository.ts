import type Database from "better-sqlite3";
import { emptyState, statusOf, type TodoEvent, type TodoState } from "./model";
import { occurrenceOn } from "./recurrence";

export class TodoConflict extends Error {
  constructor() { super("日程刚刚发生了变化，已为你刷新，请重新操作"); }
}

export type TodoActivity = {
  id: number;
  userId: number;
  taskId: string;
  occurrenceDate: string | null;
  rootTaskId: string;
  parentTaskId: string | null;
  action: string;
  occurredAt: number;
  scheduledDate: string | null;
  title: string;
  previousStatus: string | null;
  nextStatus: string | null;
  changedFields: string[];
  source: string;
  requestId: string;
};

type WriteSource = "web" | "widget" | "desktop" | "mcp" | "unknown";

function activitySnapshot(events: TodoEvent[]) {
  const result = new Map<string, { event: TodoEvent; occurrenceDate: string | null } | null>();
  for (const event of events) {
    result.set(event.id, { event: { ...event, exceptions: undefined }, occurrenceDate: null });
    if (event.repeat) for (const [date, override] of Object.entries(event.exceptions ?? {})) {
      result.set(`${event.id}:${date}`, override === null
        ? null
        : { event: { ...event, ...override, date, occurrenceDate: date, exceptions: undefined }, occurrenceDate: date });
    }
  }
  return result;
}

function snapshotValue(snapshot: Map<string, { event: TodoEvent; occurrenceDate: string | null } | null>, key: string) {
  if (snapshot.has(key)) return snapshot.get(key) ?? null;
  const split = key.lastIndexOf(":");
  if (split < 0) return null;
  const taskId = key.slice(0, split), date = key.slice(split + 1);
  const root = snapshot.get(taskId);
  if (!root?.event.repeat) return null;
  const occurrence = occurrenceOn(root.event, date);
  return occurrence ? { event: { ...occurrence, occurrenceDate: date }, occurrenceDate: date } : null;
}

function changedFields(before: TodoEvent, after: TodoEvent): string[] {
  const keys = ["title", "date", "start", "end", "notes", "repeat", "fixed"] as const;
  return keys.filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

function activityAction(before: TodoEvent | null, after: TodoEvent | null): string {
  if (!before && after) return after.origin?.kind === "deferred" ? "deferred_created" : "created";
  if (before && !after) return "deleted";
  const previous = statusOf(before!);
  const next = statusOf(after!);
  if (previous !== next) {
    if (next === "completed") return "completed";
    if (next === "cancelled") return "cancelled";
    if (next === "deferred") return "deferred";
    if (previous === "completed" || previous === "cancelled" || previous === "deferred") return "reopened";
    return "status_changed";
  }
  return "edited";
}

export function todoRepository(sqlite: Database.Database) {
  // An additive, isolated table keeps this module independent of workbench edits.
  sqlite.exec(`CREATE TABLE IF NOT EXISTS todo_workspaces (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL DEFAULT 0,
    payload TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  // Migrations own the production schema; IF NOT EXISTS also supports isolated
  // in-memory repository users such as import and integration tests.
  sqlite.exec(`CREATE TABLE IF NOT EXISTS todo_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL, occurrence_date TEXT, root_task_id TEXT NOT NULL, parent_task_id TEXT,
    action TEXT NOT NULL CHECK (action IN ('created','deferred_created','edited','completed','cancelled','deferred','deleted','reopened','status_changed')),
    occurred_at INTEGER NOT NULL, scheduled_date TEXT, title TEXT NOT NULL,
    previous_status TEXT, next_status TEXT, changed_fields TEXT NOT NULL DEFAULT '[]',
    source TEXT NOT NULL CHECK (source IN ('web','widget','desktop','mcp','unknown')),
    request_id TEXT NOT NULL, sequence INTEGER NOT NULL,
    UNIQUE(user_id, request_id, sequence)
  );
  CREATE INDEX IF NOT EXISTS todo_activity_user_time_idx ON todo_activity(user_id, occurred_at, id);
  CREATE INDEX IF NOT EXISTS todo_activity_user_task_idx ON todo_activity(user_id, task_id, occurred_at);
  CREATE INDEX IF NOT EXISTS todo_activity_user_root_idx ON todo_activity(user_id, root_task_id, occurred_at);
  CREATE INDEX IF NOT EXISTS todo_activity_user_schedule_idx ON todo_activity(user_id, scheduled_date, action);`);
  function readTodo(userId: number): TodoState {
    const row = sqlite.prepare("SELECT payload FROM todo_workspaces WHERE user_id = ?").get(userId) as { payload: string } | undefined;
    return row ? JSON.parse(row.payload) as TodoState : emptyState();
  }
  function writeTodo(userId: number, expectedRevision: number, requestId: string, state: TodoState, source: WriteSource = "unknown"): TodoState {
    return sqlite.transaction(() => {
      const current = readTodo(userId);
      if (current.requestIds.includes(requestId)) return current;
      if (current.revision !== expectedRevision) throw new TodoConflict();
      const next = { ...state, revision: current.revision + 1, messages: state.messages.slice(-200), requestIds: [...current.requestIds, requestId].slice(-100) };
      sqlite.prepare(`INSERT INTO todo_workspaces (user_id, revision, payload, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET revision = excluded.revision, payload = excluded.payload, updated_at = excluded.updated_at`)
        .run(userId, next.revision, JSON.stringify(next), Date.now());
      const before = activitySnapshot(current.events);
      const after = activitySnapshot(next.events);
      const keys = [...new Set([...before.keys(), ...after.keys()])];
      const insertActivity = sqlite.prepare(`INSERT INTO todo_activity (
        user_id, task_id, occurrence_date, root_task_id, parent_task_id, action, occurred_at,
        scheduled_date, title, previous_status, next_status, changed_fields, source, request_id, sequence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      let sequence = 0;
      for (const key of keys) {
        const oldEntry = snapshotValue(before, key);
        const newEntry = snapshotValue(after, key);
        const oldEvent = oldEntry?.event ?? null;
        const newEvent = newEntry?.event ?? null;
        if (JSON.stringify(oldEvent) === JSON.stringify(newEvent)) continue;
        const action = activityAction(oldEvent, newEvent);
        const event = newEvent ?? oldEvent!;
        const fields = oldEvent && newEvent ? changedFields(oldEvent, newEvent) : [];
        if (oldEvent && newEvent && statusOf(oldEvent) !== statusOf(newEvent)) fields.push("status");
        insertActivity.run(
          userId, event.id, newEntry?.occurrenceDate ?? oldEntry?.occurrenceDate ?? null,
          event.origin?.rootTaskId ?? event.id, event.origin?.parentTaskId ?? null,
          action, Date.now(), newEvent?.date ?? oldEvent?.date ?? null, event.title,
          oldEvent ? statusOf(oldEvent) : null, newEvent ? statusOf(newEvent) : null,
          JSON.stringify(fields), source, requestId, sequence++,
        );
      }
      return next;
    })();
  }

  function readActivity(userId: number, from: number, to: number, limit = 1000): TodoActivity[] {
    return sqlite.prepare(`SELECT id, user_id AS userId, task_id AS taskId, occurrence_date AS occurrenceDate,
      root_task_id AS rootTaskId, parent_task_id AS parentTaskId, action, occurred_at AS occurredAt,
      scheduled_date AS scheduledDate, title, previous_status AS previousStatus, next_status AS nextStatus,
      changed_fields AS changedFields, source, request_id AS requestId
      FROM todo_activity WHERE user_id = ? AND occurred_at >= ? AND occurred_at < ? ORDER BY occurred_at, id LIMIT ?`)
      .all(userId, from, to, Math.max(1, Math.min(limit, 5000)))
      .map((row) => ({ ...row as Omit<TodoActivity, "changedFields"> & { changedFields: string }, changedFields: JSON.parse((row as { changedFields: string }).changedFields) as string[] }));
  }

  return { readTodo, writeTodo, readActivity };
}
