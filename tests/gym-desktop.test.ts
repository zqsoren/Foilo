import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { migrations } from "../lib/db/migrations";
import { readDesktop, saveDesktop } from "../lib/gym/desktop-store";
import {
  defaultSettings,
  exerciseSeries,
  calendarDays,
  weekStart,
} from "../lib/gym/desktop";
import { mutate, workout } from "../lib/gym/store";
import { emptyValues } from "../lib/gym/model";
import { loginDestination } from "../lib/login-routing";

describe("健身桌面真实数据与持久化", () => {
  let db: Database.Database;
  const now = Date.UTC(2026, 10, 17, 5);
  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys=ON");
    for (const m of migrations) db.exec(m.sql);
    for (const id of [41, 42])
      db.prepare(
        "INSERT INTO users(id,name,phone,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)",
      ).run(id, "测试" + id, "desktop-" + id, "fixture", now, now);
  });
  afterEach(() => db.close());
  const command = (uid: number, c: unknown, t = now) =>
    mutate(db, uid, randomUUID(), c, t);
  const plan = (uid = 41) =>
    command(uid, {
      type: "savePlan",
      name: "同名计划",
      items: [{ exerciseId: 1, sets: 2 }],
    });
  it("布局与目标按账号保存，拒绝跨账号计划和重复组件", () => {
    const p = plan(),
      other = plan(42),
      s = {
        ...defaultSettings(),
        layout: [] as ReturnType<typeof defaultSettings>["layout"],
        planIds: [p],
        monthGoals: { "2026-11": 12 },
      };
    saveDesktop(db, 41, s, 0, randomUUID());
    expect(readDesktop(db, 41).settings).toEqual(s);
    expect(readDesktop(db, 42).settings.layout.length).toBe(5);
    expect(() =>
      saveDesktop(db, 42, { ...s, planIds: [p] }, 0, randomUUID()),
    ).toThrow();
    expect(() =>
      saveDesktop(db, 41, { ...s, planIds: [other] }, 1, randomUUID()),
    ).toThrow();
    expect(() =>
      saveDesktop(db, 41, { ...s, layout: ["heat", "heat"] }, 1, randomUUID()),
    ).toThrow();
  });
  it("重试幂等，旧版本写入拒绝且不覆盖已保存目标", () => {
    const s = defaultSettings(),
      id = randomUUID();
    saveDesktop(db, 41, s, 0, id);
    saveDesktop(db, 41, s, 0, id);
    expect(readDesktop(db, 41).revision).toBe(1);
    expect(() =>
      saveDesktop(
        db,
        41,
        { ...s, monthGoals: { "2026-11": 99 } },
        0,
        randomUUID(),
      ),
    ).toThrow(/其他窗口/);
    expect(readDesktop(db, 41).settings.monthGoals).toEqual({});
  });
  it("真实日期及阶段范围校验，不接受无效目标", () => {
    const s = defaultSettings();
    for (const phase of [
      { start: "2026-02-30", end: "2026-03-05", target: 3 },
      { start: "2026-11-20", end: "2026-11-01", target: 3 },
      { start: "2026-11-01", end: "2028-11-01", target: 3 },
      { start: "2026-11-01", end: "2026-11-30", target: 0 },
    ])
      expect(() =>
        saveDesktop(db, 41, { ...s, phase }, 0, randomUUID()),
      ).toThrow();
    expect(() => saveDesktop(db, 41, undefined, 0, randomUUID())).toThrow();
  });
  it("只读取本人结束训练，重复追加同动作汇总并保留零完成组事实", () => {
    const p = plan(),
      w = command(41, { type: "start", planId: p });
    const initial = workout(db, 41, w);
    command(41, {
      type: "record",
      workoutId: w,
      revision: 0,
      setId: initial.items[0].sets[0].id,
      ...emptyValues,
      kg: 10,
      reps: 8,
      done: true,
    });
    command(41, {
      type: "append",
      workoutId: w,
      revision: 1,
      exerciseIds: [1],
    });
    command(41, { type: "finish", workoutId: w, revision: 2 });
    const d = readDesktop(db, 41);
    expect(d.sessions).toHaveLength(1);
    expect(d.sessions[0].volume).toBe(80);
    expect(d.sessions[0].sets).toBe(1);
    expect(d.sessions[0].planRevision).toBe(0);
    expect(exerciseSeries(d, 1, p)[0].items).toHaveLength(2);
    expect(exerciseSeries(d, 1, p)[0].volume).toBe(80);
    expect(readDesktop(db, 42).sessions).toEqual([]);
    const other = plan(42);
    command(42, { type: "start", planId: other });
    expect(readDesktop(db, 42).sessions).toEqual([]);
  });
  it("迁移14保留原字段和训练引用，老记录的版本不伪造", () => {
    const p = plan(),
      w = command(41, { type: "start", planId: p });
    db.prepare(
      "UPDATE gym_workouts SET finished=?,plan_revision=NULL WHERE id=?",
    ).run(now, w);
    expect(readDesktop(db, 41).sessions[0].planRevision).toBeNull();
    expect(db.pragma("foreign_key_check")).toEqual([]);
    expect(db.pragma("quick_check")).toEqual([{ quick_check: "ok" }]);
    expect(readDesktop(db, 41).plans[0].items).toHaveLength(1);
  });
  it("月历从周一起排六周，跨月周与新入口登录回跳", () => {
    expect(calendarDays("2026-11")).toHaveLength(42);
    expect(calendarDays("2026-11")[6]).toBe("2026-11-01");
    expect(weekStart("2026-11-01")).toBe("2026-10-26");
    expect(loginDestination("/gym/dashboard")).toBe("/gym/dashboard");
    expect(loginDestination("/gym/dashboard?view=plans")).toBe(
      "/gym/dashboard?view=plans",
    );
  });
});
