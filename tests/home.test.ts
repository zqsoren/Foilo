import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrations } from "../lib/db/migrations";
import { enableModule, enabledModules, homeTrend, readHome } from "../lib/home/store";
import { monthHeatmap, mondayOffset } from "../lib/home/model";
import { emptyState, type TodoEvent } from "../lib/todo/model";
import { todoRepository } from "../lib/todo/repository";
import { saveWealth } from "../lib/wealth/store";
import { loginDestination, loginUrl } from "../lib/login-routing";

describe("账号主页与真实模块数据", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(":memory:"); db.pragma("foreign_keys=ON");
    for (const m of migrations) db.exec(m.sql);
    for (const id of [91,92]) db.prepare("INSERT INTO users(id,name,phone,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)").run(id,"测试"+id,"home-"+id,"fixture",0,0);
  });
  afterEach(() => db.close());
  it("空账号无板块、无伪造数据，开通幂等且按账号隔离", async () => {
    const empty = await readHome(db,91,"2026-11-17");
    expect(empty.modules).toEqual([]); expect(empty.completed).toBe(0); expect(empty.trend).toEqual([]);
    expect(empty.life.every((d) => !d.count)).toBe(true);
    enableModule(db,91,"gym"); enableModule(db,91,"gym");
    expect(enabledModules(db,91)).toEqual(["gym"]); expect(enabledModules(db,92)).toEqual([]);
    expect(() => enableModule(db,91,"not-a-module")).toThrow();
    expect(() => enableModule(db,999,"gym")).toThrow();
  });
  it("自动保留已有模块，只统计本人当年真实记录，撤销日程同步减少", async () => {
    const repo=todoRepository(db);
    const event: TodoEvent={id:randomUUID(),title:"本人",date:"2026-11-16",start:null,end:null,completed:true,fixed:false,notes:""};
    repo.writeTodo(91,0,randomUUID(),{...emptyState(),events:[event]});
    repo.writeTodo(92,0,randomUUID(),{...emptyState(),events:[{...event,id:randomUUID()},{...event,id:randomUUID()}]});
    db.prepare("INSERT INTO gym_plans(id,user_id,name) VALUES(901,91,'训练'),(902,92,'另一账号')").run();
    const workout=db.prepare("INSERT INTO gym_workouts(user_id,plan_id,name,day,started,finished) VALUES(?,?,'训练',?,1,?)");
    workout.run(91,901,"2026-10-31",2); workout.run(91,901,"2026-11-16",2); workout.run(91,901,"2026-11-17",null);
    workout.run(92,902,"2026-11-16",2);
    const home=await readHome(db,91,"2026-11-17");
    expect(home.modules).toEqual(["gym","todo"]); expect(home.completed).toBe(1);
    expect(home.gym.filter((d) => d.count).map((d) => d.date)).toEqual(["2026-11-16"]);
    expect(home.life.find((d) => d.date === "2026-11-16")?.count).toBe(2);
    const current=repo.readTodo(91);
    repo.writeTodo(91,current.revision,randomUUID(),{...current,events:[{...event,completed:false}]});
    expect((await readHome(db,91,"2026-11-17")).completed).toBe(0);
  });
  it("当日日程保留四种状态，只计待办；无日程时保留年度完成数", async () => {
    const repo = todoRepository(db);
    const task = (title: string, date: string, status: "pending" | "completed" | "cancelled" | "deferred", start: string | null = null): TodoEvent => ({
      id: randomUUID(), title, date, start, end: start ? "23:00" : null, status, completed: status === "completed", fixed: false, notes: "",
    });
    const events = [task("待办", "2026-11-17", "pending", "09:00"), task("完成", "2026-11-17", "completed", "10:00"),
      task("取消", "2026-11-17", "cancelled", "11:00"), task("推迟", "2026-11-17", "deferred", "12:00"), task("待安排", "2026-11-17", "pending"),
      task("昨天完成", "2026-11-16", "completed"), task("未来完成", "2026-12-01", "completed"), task("去年完成", "2025-11-17", "completed")];
    repo.writeTodo(91, 0, randomUUID(), { ...emptyState(), events });
    repo.writeTodo(92, 0, randomUUID(), { ...emptyState(), events: [task("另一账号", "2026-11-17", "pending")] });
    const home = await readHome(db, 91, "2026-11-17");
    expect(home.schedule).toMatchObject({ total: 5, pending: 2 });
    expect(home.schedule.items.map((e) => e.title)).toEqual(["待办", "完成", "取消", "推迟", "待安排"]);
    expect(home.schedule.items.map((e) => e.status)).toEqual(["pending", "completed", "cancelled", "deferred", "pending"]);
    expect(home.completed).toBe(2);
    expect(home.life.find((d) => d.date === "2026-11-17")?.count).toBe(1);
    const emptyDay = await readHome(db, 91, "2026-11-18");
    expect(emptyDay.schedule).toEqual({ total: 0, pending: 0, items: [] }); expect(emptyDay.completed).toBe(2);
    const doneDay = await readHome(db, 91, "2026-11-16");
    expect(doneDay.schedule).toMatchObject({ total: 1, pending: 0 });
    expect((await readHome(db, 92, "2026-11-17")).schedule.items.map((e) => e.title)).toEqual(["另一账号"]);
  });
  it("今日重复日程遵循单次状态、删除例外与上海年界", async () => {
    const recurring: TodoEvent = { id: randomUUID(), title: "每日", date: "2025-12-30", start: "08:00", end: "09:00", completed: false, fixed: false, notes: "", repeat: { frequency: "daily", days: [] },
      exceptions: { "2025-12-31": { title: "去年完成", start: "08:00", end: "09:00", completed: true, notes: "" },
        "2026-01-01": { title: "今年完成", start: "08:00", end: "09:00", completed: true, notes: "" }, "2026-01-02": null,
        "2026-01-03": { title: "单次推迟", start: "10:00", end: "11:00", completed: false, status: "deferred", notes: "" } } };
    todoRepository(db).writeTodo(91, 0, randomUUID(), { ...emptyState(), events: [recurring] });
    const first = await readHome(db, 91, "2026-01-01");
    expect(first.completed).toBe(1); expect(first.schedule).toMatchObject({ total: 1, pending: 0, items: [{ title: "今年完成", status: "completed" }] });
    const deleted = await readHome(db, 91, "2026-01-02");
    expect(deleted.completed).toBe(1); expect(deleted.schedule.total).toBe(0);
    expect((await readHome(db, 91, "2026-01-03")).schedule).toMatchObject({ total: 1, pending: 0, items: [{ title: "单次推迟", status: "deferred" }] });
    expect((await readHome(db, 91, "2026-01-04")).schedule).toMatchObject({ total: 1, pending: 1, items: [{ title: "每日", status: "pending" }] });
  });
  it("每个自然月仅生成本月日期，包括闰年、年末和未来天", () => {
    for (const [date,length] of [["2026-11-17",30],["2024-02-10",29],["2026-02-10",28],["2026-12-31",31]] as const) {
      const days=monthHeatmap(date,new Map([["2026-10-31",99],[date,1],[date.slice(0,7)+"-28",1]]));
      expect(days).toHaveLength(length); expect(days.every((d) => d.date.startsWith(date.slice(0,7)))).toBe(true);
      expect(days.filter((d) => d.future).every((d) => d.count===0)).toBe(true);
    }
    expect(mondayOffset("2026-11-01")).toBe(6);
  });
  it("资产曲线来自本人估值，无历史不补零，计总资产且排除负债", async () => {
    const create=(uid:number,amount:string,typeCode="alipay")=>saveWealth(db,uid,randomUUID(),{type:"create",typeCode,name:"账户",note:"",institution:"",cardLast4:"",bookkeeping:true,position:{name:"余额",category:"cash",currency:"CNY",include:true,amount,date:"2026-10-01",note:""}});
    const saved=create(91,"100"); create(92,"999999");
    saveWealth(db,91,randomUUID(),{type:"record",positionId:saved.positionId,revision:0,amount:"120",date:"2026-11-16",note:""});
    const home=await readHome(db,91,"2026-11-17");
    expect(home.modules).toEqual(["wealth"]);
    expect(home.trend[0]).toEqual({date:"2026-10-01",value:100});
    expect(home.trend.at(-1)).toEqual({date:"2026-11-17",value:120});
    expect(home.life.find((d) => d.date === "2026-11-16")?.count).toBe(1);
    db.prepare("UPDATE assets_positions SET side='liability' WHERE user_id=91").run();
    expect(await homeTrend(db,91,"2026-11-17")).toEqual([]);
  });
  it("登录默认进入主页，明确的各模块入口仍安全回跳", () => {
    expect(loginDestination(undefined)).toBe("/"); expect(loginUrl("/")).toBe("/login");
    expect(loginDestination("//evil.example")).toBe("/");
    for (const path of ["/gym","/gym/dashboard","/wealth","/todo","/todo/dashboard"]) expect(loginDestination(path)).toBe(path);
    expect(loginUrl("/todo/dashboard")).toBe("/login?next=%2Ftodo%2Fdashboard");
  });
});
