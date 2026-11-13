import type Database from "better-sqlite3";
import { epochToLocalInput } from "../life-date";
import {
  capacity,
  type Dashboard,
  type Exercise,
  type Plan,
  type PlanItem,
  type SetRow,
  type Values,
  type Workout,
  type WorkoutItem,
  type Summary,
  type Mode,
} from "./model";
import { gymCommand, type Command } from "./commands";
import { readMuscleLoad, snapshotMuscles } from "./muscle-storage";

export function gymMonth(now = Date.now()) {
  return epochToLocalInput(now).slice(0, 7);
}
export function exercises(db: Database.Database) {
  return db
    .prepare(
      "SELECT id,name,region,muscles,equipment,mode,aliases,image_id AS imageId,source_code AS code,main_muscle AS mainMuscle,also_muscles AS alsoMuscles,minor_muscles AS minorMuscles,stretch_target AS stretchTarget,star FROM gym_exercises WHERE listed=1 ORDER BY star DESC,id",
    )
    .all() as Exercise[];
}
export function workout(
  db: Database.Database,
  userId: number,
  id: number,
): Workout {
  const head = db
    .prepare(
      "SELECT id,plan_id AS planId,name,day,started,finished,revision,note FROM gym_workouts WHERE user_id=? AND id=?",
    )
    .get(userId, id) as Omit<Workout, "items"> | undefined;
  if (!head) throw Error("找不到这次训练");
  const items = db
    .prepare(
      "SELECT id,exercise_id AS exerciseId,name,mode,temporary,note FROM gym_workout_items WHERE workout_id=? ORDER BY position",
    )
    .all(id) as WorkoutItem[];
  const rows = db
    .prepare(
      `SELECT s.item_id AS itemId,s.id,s.kind,s.kg,s.reps,s.right_kg AS rightKg,s.right_reps AS rightReps,s.seconds,s.done,s.volume
    FROM gym_sets s JOIN gym_workout_items i ON i.id=s.item_id WHERE i.workout_id=? ORDER BY i.position,s.position`,
    )
    .all(id) as (SetRow & { itemId: number })[];
  const byItem = new Map(
    items.map((i) => {
      i.sets = [];
      return [i.id, i];
    }),
  );
  const bySet = new Map(rows.map(row => [row.id, row]));
  for (const row of rows) {
    row.stages = [];
    byItem.get(row.itemId)!.sets.push(row);
  }
  const stages = db.prepare(`SELECT t.set_id AS setId,t.kg,t.reps,t.right_kg AS rightKg,t.right_reps AS rightReps,t.seconds
    FROM gym_set_stages t JOIN gym_sets s ON s.id=t.set_id JOIN gym_workout_items i ON i.id=s.item_id
    WHERE i.workout_id=? ORDER BY t.set_id,t.position`).all(id) as (Values & {setId:number})[];
  for (const stage of stages) bySet.get(stage.setId)!.stages.push(stage);
  return { ...head, items, muscleLoad: head.finished === null ? [] : readMuscleLoad(db, userId, { id }) };
}
export function previousExercise(db: Database.Database, userId: number, exerciseId: number) {
  const last = db.prepare(`SELECT w.id FROM gym_workouts w
    JOIN gym_workout_items i ON i.workout_id=w.id
    WHERE w.user_id=? AND w.finished IS NOT NULL AND i.exercise_id=?
      AND EXISTS (SELECT 1 FROM gym_sets s WHERE s.item_id=i.id AND s.done=1)
    ORDER BY w.finished DESC,w.id DESC LIMIT 1`).get(userId,exerciseId) as {id:number} | undefined;
  if (!last) return null;
  const session = workout(db,userId,last.id);
  const item = session.items.find(i=>i.exerciseId===exerciseId)!;
  return { day:session.day, mode:item.mode, sets:item.sets.map((s,i)=>({...s,number:i+1})).filter(s=>s.done) };
}

export function dashboard(
  db: Database.Database,
  userId: number,
  month: string,
): Dashboard {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Error("月份无效");
  const plans = db
    .prepare(
      "SELECT id,name,revision FROM gym_plans WHERE user_id=? AND archived=0 ORDER BY id",
    )
    .all(userId) as Plan[];
  const items = db
    .prepare(
      `SELECT i.plan_id AS planId,i.exercise_id AS exerciseId,i.sets FROM gym_plan_items i JOIN gym_plans p ON p.id=i.plan_id
     WHERE p.user_id=? AND p.archived=0 ORDER BY p.id,i.position`,
    )
    .all(userId) as (PlanItem & { planId: number })[];
  const byPlan = new Map(
    plans.map((p) => {
      p.items = [];
      return [p.id, p];
    }),
  );
  for (const row of items) byPlan.get(row.planId)!.items.push(row);
  const active = db
    .prepare("SELECT id FROM gym_workouts WHERE user_id=? AND finished IS NULL")
    .get(userId) as { id: number } | undefined;
  const history = db
    .prepare(
      `SELECT w.id,w.name,w.day,w.started,w.finished,round(coalesce(sum(s.volume),0),2) volume,coalesce(sum(s.done),0) count
    FROM gym_workouts w LEFT JOIN gym_workout_items i ON i.workout_id=w.id LEFT JOIN gym_sets s ON s.item_id=i.id
    WHERE w.user_id=? AND w.finished IS NOT NULL AND w.day>=? AND w.day<=? GROUP BY w.id ORDER BY w.started DESC`,
    )
    .all(userId, month + "-01", month + "-31") as Summary[];
  return {
    plans,
    active: active ? workout(db, userId, active.id) : null,
    history,
    muscleLoad: readMuscleLoad(db, userId, { start: month + "-01", end: month + "-31" }),
    today: epochToLocalInput(Date.now()).slice(0, 10),
    month,
  };
}
function addItems(
  db: Database.Database,
  wid: number,
  items: PlanItem[],
  temporary: number,
) {
  const base = db
    .prepare("SELECT count(*) n FROM gym_workout_items WHERE workout_id=?")
    .get(wid) as { n: number };
  const ins =
    db.prepare(`INSERT INTO gym_workout_items(workout_id,exercise_id,position,name,mode,temporary)
    SELECT ?,id,?,name,mode,? FROM gym_exercises WHERE id=?`);
  const set = db.prepare("INSERT INTO gym_sets(item_id,position) VALUES (?,?)");
  items.forEach((x, i) => {
    const info = ins.run(wid, base.n + i, temporary, x.exerciseId);
    if (!info.changes) throw Error("动作不存在");
    for (let j = 0; j < x.sets; j++) set.run(info.lastInsertRowid, j);
  });
}
function apply(
  db: Database.Database,
  uid: number,
  c: Command,
  now: number,
): number {
  if (c.type === "savePlan") {
    let id = c.planId;
    if (id) {
      const changed = db
        .prepare(
          "UPDATE gym_plans SET name=?,revision=revision+1 WHERE id=? AND user_id=? AND revision=? AND archived=0",
        )
        .run(c.name, id, uid, c.revision ?? -1);
      if (!changed.changes) throw Error("计划已更新，请刷新后重试");
      db.prepare("DELETE FROM gym_plan_items WHERE plan_id=?").run(id);
    } else
      id = Number(
        db
          .prepare("INSERT INTO gym_plans(user_id,name) VALUES (?,?)")
          .run(uid, c.name).lastInsertRowid,
      );
    const add = db.prepare(
      "INSERT INTO gym_plan_items(plan_id,exercise_id,position,sets) VALUES(?,?,?,?)",
    );
    c.items.forEach((x, i) => add.run(id, x.exerciseId, i, x.sets));
    return id;
  }
  if (c.type === "start") {
    const plan = db
      .prepare(
        "SELECT name FROM gym_plans WHERE id=? AND user_id=? AND archived=0",
      )
      .get(c.planId, uid) as { name: string } | undefined;
    if (!plan) throw Error("计划不存在");
    const active = db
      .prepare(
        "SELECT id,plan_id FROM gym_workouts WHERE user_id=? AND finished IS NULL",
      )
      .get(uid) as { id: number; plan_id: number } | undefined;
    if (active) {
      if (active.plan_id === c.planId) return active.id;
      throw Error("请先继续并结束当前训练");
    }
    const wid = Number(
      db
        .prepare(
          "INSERT INTO gym_workouts(user_id,plan_id,name,day,started) VALUES(?,?,?,?,?)",
        )
        .run(uid, c.planId, plan.name, epochToLocalInput(now).slice(0, 10), now)
        .lastInsertRowid,
    );
    const items = db
      .prepare(
        "SELECT exercise_id AS exerciseId,sets FROM gym_plan_items WHERE plan_id=? ORDER BY position",
      )
      .all(c.planId) as PlanItem[];
    addItems(db, wid, items, 0);
    return wid;
  }
  const wid = c.workoutId;
  if (c.type === "deleteHistory") {
    const removed = db.prepare("DELETE FROM gym_workouts WHERE id=? AND user_id=? AND revision=? AND finished IS NOT NULL").run(wid,uid,c.revision);
    if (!removed.changes) throw Error("找不到可删除的训练记录");
    return wid;
  }
  const lock = db
    .prepare(
      "UPDATE gym_workouts SET revision=revision+1 WHERE id=? AND user_id=? AND finished IS NULL AND revision=?",
    )
    .run(wid, uid, c.revision);
  if (!lock.changes) throw Error("训练状态已更新，请刷新后重试");
  switch (c.type) {
    case "itemNote": {
      const result = db.prepare("UPDATE gym_workout_items SET note=? WHERE id=? AND workout_id=?").run(c.text,c.itemId,wid);
      if (!result.changes) throw Error("找不到本次训练的动作");
      break;
    }
    case "append": {
      const present = db
        .prepare("SELECT exercise_id FROM gym_workout_items WHERE workout_id=?")
        .all(wid) as { exercise_id: number }[];
      const seen = new Set(present.map((x) => x.exercise_id));
      addItems(
        db,
        wid,
        c.exerciseIds
          .filter((id) => !seen.has(id))
          .map((exerciseId) => ({ exerciseId, sets: 1 })),
        1,
      );
      break;
    }
    case "addSet": {
      const item = db
        .prepare("SELECT id FROM gym_workout_items WHERE id=? AND workout_id=?")
        .get(c.itemId, wid);
      if (!item) throw Error("找不到训练动作");
      const { n } = db
        .prepare("SELECT count(*) n FROM gym_sets WHERE item_id=?")
        .get(c.itemId) as { n: number };
      if (n >= 30) throw Error("每个动作最多 30 组");
      db.prepare("INSERT INTO gym_sets(item_id,position) VALUES(?,?)").run(
        c.itemId,
        n,
      );
      break;
    }
    case "copySet": {
      const row = db.prepare(`SELECT s.* FROM gym_sets s JOIN gym_workout_items i ON i.id=s.item_id
        WHERE i.workout_id=? AND s.id=?`).get(wid,c.setId) as {item_id:number;position:number} | undefined;
      if (!row) throw Error("找不到训练组");
      const count = db.prepare("SELECT count(*) n FROM gym_sets WHERE item_id=?").get(row.item_id) as {n:number};
      if (count.n >= 30) throw Error("每个动作最多 30 组");
      // Move later rows in two passes to respect the unique position constraint.
      db.prepare("UPDATE gym_sets SET position=position+100 WHERE item_id=? AND position>?").run(row.item_id,row.position);
      db.prepare("UPDATE gym_sets SET position=position-99 WHERE item_id=? AND position>=100").run(row.item_id);
      const copy = db.prepare(`INSERT INTO gym_sets(item_id,position,kind,kg,reps,right_kg,right_reps,seconds)
        SELECT item_id,position+1,kind,kg,reps,right_kg,right_reps,seconds FROM gym_sets WHERE id=?`).run(c.setId);
      db.prepare(`INSERT INTO gym_set_stages SELECT ?,position,kg,reps,right_kg,right_reps,seconds FROM gym_set_stages WHERE set_id=?`).run(copy.lastInsertRowid,c.setId);
      break;
    }
    case "recordStages":
    case "record": {
      const row = db.prepare(`SELECT i.mode,s.kind FROM gym_sets s JOIN gym_workout_items i ON i.id=s.item_id
        WHERE s.id=? AND i.workout_id=?`).get(c.setId,wid) as {mode:Mode;kind:string} | undefined;
      if (!row) throw Error("找不到训练组");
      if (c.type === "record" && row.kind !== "normal") throw Error("请刷新页面后编辑递减组");
      const mode = row.mode;
      const values = (c.type === "record" ? [c] : c.stages).map(v => ({
        kg: mode === "time" ? 0 : v.kg, reps: mode === "time" ? 0 : v.reps,
        rightKg: mode === "sides" ? v.rightKg : 0, rightReps: mode === "sides" ? v.rightReps : 0,
        seconds: mode === "time" ? v.seconds : 0,
      }));
      if (c.done && values.some(v => mode === "time" ? !v.seconds : !(v.reps + v.rightReps)))
        throw Error(mode === "time" ? "请为每段填写时长" : "请为每段填写实际次数");
      const first = values[0];
      const volume = c.done ? Math.round(values.reduce((sum,v) => sum+capacity(mode,v),0)*100)/100 : 0;
      db.prepare("UPDATE gym_sets SET kind=?,kg=?,reps=?,right_kg=?,right_reps=?,seconds=?,done=?,volume=? WHERE id=?")
        .run(values.length>1?"drop":"normal",first.kg,first.reps,first.rightKg,first.rightReps,first.seconds,Number(c.done),volume,c.setId);
      db.prepare("DELETE FROM gym_set_stages WHERE set_id=?").run(c.setId);
      const insert = db.prepare("INSERT INTO gym_set_stages VALUES(?,?,?,?,?,?,?)");
      values.slice(1).forEach((v,i)=>insert.run(c.setId,i+1,v.kg,v.reps,v.rightKg,v.rightReps,v.seconds));
      break;
    }
    case "note":
      db.prepare("UPDATE gym_workouts SET note=? WHERE id=?").run(c.text, wid);
      break;
    case "finish": {
      const done = db
        .prepare(
          "SELECT 1 FROM gym_sets s JOIN gym_workout_items i ON i.id=s.item_id WHERE i.workout_id=? AND s.done=1 LIMIT 1",
        )
        .get(wid);
      if (!done) throw Error("至少完成一组，或放弃这次空训练");
      snapshotMuscles(db, wid);
      db.prepare(
        "UPDATE gym_workouts SET finished=max(started,?) WHERE id=?",
      ).run(now, wid);
      break;
    }
    case "discard": {
      const any = db
        .prepare(
          "SELECT 1 FROM gym_sets s JOIN gym_workout_items i ON i.id=s.item_id WHERE i.workout_id=? AND s.done=1 LIMIT 1",
        )
        .get(wid);
      if (any) throw Error("已有完成组，请使用完成训练");
      db.prepare("DELETE FROM gym_workouts WHERE id=?").run(wid);
      break;
    }
  }
  return wid;
}
export function mutate(
  db: Database.Database,
  uid: number,
  request: string,
  input: unknown,
  now = Date.now(),
): number {
  if (!/^[0-9a-f-]{36}$/i.test(request)) throw Error("请求编号无效");
  const parsed = gymCommand.safeParse(input);
  if (!parsed.success) throw Error("请检查名称、动作和组数");
  return db
    .transaction(() => {
      const seen = db
        .prepare(
          "SELECT result_id FROM gym_requests WHERE user_id=? AND request_id=?",
        )
        .get(uid, request) as { result_id: number } | undefined;
      if (seen) return seen.result_id;
      const id = apply(db, uid, parsed.data, now);
      db.prepare(
        "INSERT INTO gym_requests(user_id,request_id,result_id,created) VALUES(?,?,?,?)",
      ).run(uid, request, id, now);
      return id;
    })
    .immediate();
}
