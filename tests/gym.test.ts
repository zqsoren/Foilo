import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrations } from "../lib/db/migrations";
import { dashboard, exercises, mutate, previousExercise, workout } from "../lib/gym/store";
import { capacity, emptyValues } from "../lib/gym/model";
import { loginDestination, loginUrl } from "../lib/login-routing";

describe("健身模块数据库", () => {
  let db: Database.Database;
  const now = Date.UTC(2026, 10, 11, 13);
  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys=ON");
    for (const m of migrations) db.exec(m.sql);
    for (const id of [41, 42])
      db.prepare(
        "INSERT INTO users(id,name,phone,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)",
      ).run(id, "测试" + id, "test-" + id, "fixture", now, now);
  });
  afterEach(() => db.close());
  function create() {
    return mutate(
      db,
      41,
      randomUUID(),
      { type: "savePlan", name: "上肢", items: [{ exerciseId: 1, sets: 2 }] },
      now,
    );
  }
  it("递减段累计容量但只计一组，复制和删除按训练归属生效", () => {
    const planId = create();
    const workoutId = mutate(db,41,randomUUID(),{type:"start",planId},now);
    const setId = workout(db,41,workoutId).items[0].sets[0].id;
    const stages = [[3,40],[2,20],[1,20]].map(([kg,reps])=>({...emptyValues,kg,reps}));
    const change = (type:string, revision:number, extra = {}) =>
      mutate(db,41,randomUUID(),{type,revision,workoutId,...extra},now);
    change("recordStages",0,{setId,stages,done:true});
    change("copySet",1,{setId});
    const sets = workout(db,41,workoutId).items[0].sets;
    expect(sets.map(s=>[s.kind,s.done,s.volume])).toEqual([["drop",1,180],["drop",0,0],["normal",0,0]]);
    expect(sets[1].stages.map(s=>s.kg)).toEqual([2,1]);
    expect(()=>change("deleteHistory",2)).toThrow();
    expect(previousExercise(db,41,1)).toBeNull();
    change("finish",2);
    expect(previousExercise(db,42,1)).toBeNull();
    const previous = previousExercise(db,41,1);
    expect(previous?.sets.map(s=>[s.number,s.stages.length])).toEqual([[1,2]]);
    expect(dashboard(db,41,"2026-11").history[0]).toMatchObject({count:1,volume:180});
    expect(()=>mutate(db,42,randomUUID(),{type:"deleteHistory",workoutId,revision:3})).toThrow();
    change("deleteHistory",3);
    expect(dashboard(db,41,"2026-11").history).toEqual([]);
    expect(db.prepare("SELECT count(*) n FROM gym_set_stages").get()).toEqual({n:0});
    expect(dashboard(db,41,"2026-11").plans).toHaveLength(1);
  });
  it("精选目录包含334个编号动作及六个保留或新增动作", () => {
    const list = exercises(db);
    expect(list).toHaveLength(340);
    expect(new Set(list.filter(e=>e.code).map(e=>e.code)).size).toBe(334);
    for (const id of [101,102,105]) {
      expect(list.find(e=>e.id===id)?.imageId).toBe(1000+id);
    }
  });
  it("隔离账户；开始、重复请求、改计划、临时添加与完成互不串写", () => {
    const planId = create(),
      req = randomUUID(),
      start = { type: "start", planId };
    expect(() => mutate(db, 42, randomUUID(), start)).toThrow();
    const w = mutate(db, 41, req, start, now);
    expect(mutate(db, 41, req, start, now)).toBe(w);
    expect(() => workout(db, 42, w)).toThrow();
    expect(dashboard(db, 42, "2026-11").plans).toEqual([]);
    mutate(db, 41, randomUUID(), {
      type: "savePlan",
      planId,
      revision: 0,
      name: "修订",
      items: [{ exerciseId: 1, sets: 4 }],
    });
    const initial = workout(db, 41, w);
    expect(initial.name).toBe("上肢");
    expect(initial.items[0].sets).toHaveLength(2);
    const curl = exercises(db).find((e) => e.name === "哑铃交替二头弯举")!;
    mutate(db, 41, randomUUID(), {
      type: "append",
      workoutId: w,
      revision: 0,
      exerciseIds: [curl.id],
    });
    let a = workout(db, 41, w);
    expect(a.items[1].temporary).toBe(1);
    expect(dashboard(db, 41, "2026-11").plans[0].items).toHaveLength(1);
    const record = {
      type: "record",
      workoutId: w,
      revision: 1,
      setId: a.items[1].sets[0].id,
      ...emptyValues,
      kg: 8,
      reps: 10,
      rightKg: 6,
      rightReps: 10,
      done: true,
    };
    expect(() => mutate(db, 42, randomUUID(), record)).toThrow();
    mutate(db, 41, randomUUID(), record);
    expect(() => mutate(db, 41, randomUUID(), record)).toThrow();
    a = workout(db, 41, w);
    expect(a.items[1].sets[0].volume).toBe(140);
    mutate(
      db,
      41,
      randomUUID(),
      { type: "finish", workoutId: w, revision: 2 },
      now + 60000,
    );
    const d = dashboard(db, 41, "2026-11");
    expect(d.active).toBeNull();
    expect(d.history[0]).toMatchObject({ id: w, volume: 140, count: 1 });
    expect(dashboard(db, 42, "2026-11").history).toEqual([]);
  });
  it("无完成组不能记进历史，跨训练的组号不能写入", () => {
    const w = mutate(db, 41, randomUUID(), { type: "start", planId: create() });
    expect(() =>
      mutate(db, 41, randomUUID(), {
        type: "finish",
        workoutId: w,
        revision: 0,
      }),
    ).toThrow();
    expect(() =>
      mutate(db, 41, randomUUID(), {
        type: "record",
        workoutId: w,
        revision: 0,
        setId: 9999,
        ...emptyValues,
        kg: 10,
        reps: 2,
        done: true,
      }),
    ).toThrow();
    expect(workout(db, 41, w).revision).toBe(0);
  });
  it("两只哑铃、自重、辅助与计时容量口径", () => {
    const v = { ...emptyValues, kg: 8, reps: 10, seconds: 45 };
    expect(capacity("pair", v)).toBe(160);
    expect(capacity("assist", v)).toBe(0);
    expect(capacity("time", v)).toBe(0);
    expect(capacity("body", { ...v, kg: 0 })).toBe(0);
  });
  it("模块与设备贯穿登录和注册步骤", () => {
    for (const d of ["mobile", "desktop"]) {
      const p = "/gym?device=" + d;
      expect(loginDestination(p)).toBe(p);
      expect(
        new URL(
          loginUrl(p, "register"),
          "https://example.com",
        ).searchParams.get("next"),
      ).toBe(p);
    }
    expect(loginDestination("//other.test/gym")).toBe("/todo/dashboard");
  });
});
