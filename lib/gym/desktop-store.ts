import type Database from "better-sqlite3";
import { z } from "zod";
import { epochToLocalInput } from "../life-date";
import { workout } from "./store";
import {
  defaultSettings,
  widgetKeys,
  type DesktopData,
  type DesktopSettings,
  type SessionStat,
  type ItemStat,
  type MuscleStat,
} from "./desktop";
import type { PlanItem } from "./model";

const id = z.number().int().positive();
const goal = z.number().int().min(1).max(10000);
const date = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
  .refine((d) => {
    const dt = new Date(d + "T00:00:00Z");
    return !isNaN(+dt) && dt.toISOString().slice(0, 10) === d;
  });
const unique = <T>(a: T[]) => new Set(a).size === a.length;
const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const settingsSchema = z.object({
  layout: z
    .array(
      z.enum(
        widgetKeys as [
          (typeof widgetKeys)[number],
          ...(typeof widgetKeys)[number][],
        ],
      ),
    )
    .max(14)
    .refine(unique),
  planIds: z.array(id).max(3).refine(unique).nullable(),
  focus: z.object({ exerciseId: id, planId: id.nullable() }).nullable(),
  monthGoals: z.record(monthKey, goal),
  weekGoals: z.record(date, goal),
  planGoals: z.record(
    z.string().regex(/^\d{4}-(0[1-9]|1[0-2]):[1-9]\d*$/),
    goal,
  ),
  phase: z
    .object({ start: date, end: date, target: goal })
    .refine(
      (v) =>
        v.start <= v.end &&
        Date.parse(v.end) - Date.parse(v.start) <= 366 * 86400000,
    )
    .nullable(),
});
export function readDesktop(
  db: Database.Database,
  userId: number,
  now = Date.now(),
): DesktopData {
  return db.transaction(() => {
    const saved = db
      .prepare(
        "SELECT settings,revision FROM gym_dashboard_settings WHERE user_id=?",
      )
      .get(userId) as { settings: string; revision: number } | undefined;
    const plans = db
      .prepare(
        "SELECT id,name,revision,archived FROM gym_plans WHERE user_id=? ORDER BY archived,id",
      )
      .all(userId) as DesktopData["plans"];
    const planItems = db
      .prepare(
        "SELECT i.plan_id AS planId,i.exercise_id AS exerciseId,i.sets FROM gym_plan_items i JOIN gym_plans p ON p.id=i.plan_id WHERE p.user_id=? ORDER BY i.position",
      )
      .all(userId) as (PlanItem & { planId: number })[];
    const byPlan = new Map(
      plans.map((p) => {
        p.items = [];
        return [p.id, p];
      }),
    );
    for (const i of planItems)
      byPlan
        .get(i.planId)
        ?.items.push({ exerciseId: i.exerciseId, sets: i.sets });
    const sessions = db
      .prepare(
        `SELECT w.id,w.plan_id AS planId,w.plan_revision AS planRevision,w.name,w.day,w.started,w.finished,
      round(coalesce(sum(CASE WHEN s.done=1 THEN s.volume ELSE 0 END),0),2) volume,coalesce(sum(s.done),0) sets
      FROM gym_workouts w LEFT JOIN gym_workout_items i ON i.workout_id=w.id LEFT JOIN gym_sets s ON s.item_id=i.id
      WHERE w.user_id=? AND w.finished IS NOT NULL GROUP BY w.id ORDER BY w.started DESC,w.id DESC`,
      )
      .all(userId) as SessionStat[];
    const items = db
      .prepare(
        `SELECT i.id,i.workout_id AS workoutId,i.exercise_id AS exerciseId,i.name,e.region,i.note,
      round(coalesce(sum(CASE WHEN s.done=1 THEN s.volume ELSE 0 END),0),2) volume,coalesce(sum(s.done),0) sets
      FROM gym_workout_items i JOIN gym_workouts w ON w.id=i.workout_id JOIN gym_exercises e ON e.id=i.exercise_id LEFT JOIN gym_sets s ON s.item_id=i.id
      WHERE w.user_id=? AND w.finished IS NOT NULL GROUP BY i.id ORDER BY w.started,i.position`,
      )
      .all(userId) as ItemStat[];
    const muscles = db
      .prepare(
        `SELECT substr(w.day,1,7) AS month,h.muscle,sum(h.sets) AS sets FROM gym_muscle_history h
      JOIN gym_workout_items i ON i.id=h.item_id JOIN gym_workouts w ON w.id=i.workout_id
      WHERE w.user_id=? AND w.finished IS NOT NULL AND h.weight=1 GROUP BY month,h.muscle`,
      )
      .all(userId) as MuscleStat[];
    return {
      today: epochToLocalInput(now).slice(0, 10),
      plans,
      sessions,
      items,
      muscles,
      latest: sessions[0] ? workout(db, userId, sessions[0].id) : null,
      settings: saved ? JSON.parse(saved.settings) : defaultSettings(),
      revision: saved?.revision ?? 0,
    };
  })();
}
export function saveDesktop(
  db: Database.Database,
  userId: number,
  input: unknown,
  revision: number,
  requestId: string,
) {
  if (
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    !z.string().uuid().safeParse(requestId).success
  )
    throw Error("保存参数无效");
  if (!input || JSON.stringify(input).length > 50000)
    throw Error("设置内容无效或过多");
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) throw Error("请检查目标、日期和组件选择");
  const settings: DesktopSettings = parsed.data;
  db.transaction(() => {
    if (
      db
        .prepare(
          "SELECT 1 FROM gym_dashboard_requests WHERE user_id=? AND request_id=?",
        )
        .get(userId, requestId)
    )
      return;
    const own = (planId: number) =>
      !!db
        .prepare("SELECT 1 FROM gym_plans WHERE user_id=? AND id=?")
        .get(userId, planId);
    for (const planId of [
      ...(settings.planIds ?? []),
      ...Object.keys(settings.planGoals).map((k) => Number(k.split(":")[1])),
    ])
      if (!own(planId)) throw Error("计划不存在或不属于当前账号");
    if (settings.focus) {
      const { exerciseId, planId } = settings.focus;
      if (!db.prepare("SELECT 1 FROM gym_exercises WHERE id=?").get(exerciseId))
        throw Error("动作不存在");
      if (
        planId !== null &&
        (!own(planId) ||
          !db
            .prepare(
              `SELECT 1 FROM gym_plan_items WHERE plan_id=? AND exercise_id=? UNION ALL SELECT 1 FROM gym_workout_items i JOIN gym_workouts w ON w.id=i.workout_id WHERE w.user_id=? AND w.plan_id=? AND i.exercise_id=? LIMIT 1`,
            )
            .get(planId, exerciseId, userId, planId, exerciseId))
      )
        throw Error("该计划中没有这个动作");
    }
    const row = db
      .prepare("SELECT revision FROM gym_dashboard_settings WHERE user_id=?")
      .get(userId) as { revision: number } | undefined;
    if ((row?.revision ?? 0) !== revision)
      throw Error("布局或目标已在其他窗口更新，请刷新后重试");
    db.prepare(
      `INSERT INTO gym_dashboard_settings(user_id,settings,revision) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET settings=excluded.settings,revision=excluded.revision`,
    ).run(userId, JSON.stringify(settings), revision + 1);
    db.prepare("INSERT INTO gym_dashboard_requests VALUES(?,?,?)").run(
      userId,
      requestId,
      Date.now(),
    );
  }).immediate();
}
