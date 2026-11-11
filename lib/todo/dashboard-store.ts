import { sqlite } from "@/lib/db";
import {
  defaultLayout,
  type ActivityCount,
  type BoardData,
  type Widget,
} from "./dashboard";
import { readTodo } from "./store";

export function dashboardData(userId: number): BoardData {
  return sqlite.transaction(() => {
    const { revision, events } = readTodo(userId);
    const layout = sqlite
      .prepare(
        "SELECT layout, revision FROM todo_dashboard_layouts WHERE user_id=?",
      )
      .get(userId) as { layout: string; revision: number } | undefined;
    const activity = sqlite
      .prepare(
        `SELECT date(occurred_at / 1000, 'unixepoch', '+8 hours') AS day,
      task_id AS task, occurrence_date AS occurrence, root_task_id AS root, action, count(*) AS count
      FROM todo_activity WHERE user_id=? AND action IN ('completed','cancelled','deferred')
      GROUP BY day, task_id, occurrence_date, root_task_id, action ORDER BY day`,
      )
      .all(userId) as ActivityCount[];
    return {
      revision,
      events,
      layout: layout
        ? (JSON.parse(layout.layout) as Widget[])
        : [...defaultLayout],
      layoutRevision: layout?.revision ?? 0,
      activity,
    };
  })();
}
