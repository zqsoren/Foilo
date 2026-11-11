import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { widgetSnapshot, widgetTokens, widgetSameOrigin } from "../lib/todo/widget";
import type { TodoEvent } from "../lib/todo/model";
import { loginDestination } from "../lib/login-routing";

const event = (extra: Partial<TodoEvent> = {}): TodoEvent => ({ id: crypto.randomUUID(), title: "论文", date: "2026-10-15", start: "14:00", end: "15:00", notes: "私人备注", completed: false, fixed: false, ...extra });
function setup() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY, is_active INTEGER); INSERT INTO users VALUES (1,1),(2,1)");
  return { db, tokens: widgetTokens(db) };
}

describe("小组件独立只读凭证", () => {
  it("哈希存储、账号隔离、重发失效、停用与过期", () => {
    const { db, tokens } = setup();
    try {
      const a = tokens.issue(1, 1000), b = tokens.issue(2, 1000);
      expect(tokens.authenticate(`Bearer ${a.token}`, 1000)).toBe(1);
      expect(tokens.authenticate(`Bearer ${b.token}`, 1000)).toBe(2);
      expect(JSON.stringify(db.prepare("SELECT * FROM todo_widget_tokens").all())).not.toContain(a.token);
      expect(tokens.status(1, 1000)).toEqual({ connected: true, expiresAt: a.expiresAt, canWrite: true });
      expect(tokens.authenticate(`Bearer ${a.token}`, a.expiresAt)).toBeNull();
      expect(tokens.status(1, a.expiresAt).connected).toBe(false);
      const replacement = tokens.issue(1, 2000);
      expect(tokens.authenticate(`Bearer ${a.token}`, 2000)).toBeNull();
      expect(tokens.authenticate(`Bearer ${replacement.token}`, 2000)).toBe(1);
      tokens.revoke(1);
      expect(tokens.authenticate(`Bearer ${replacement.token}`, 2000)).toBeNull();
      expect(tokens.authenticate(`Bearer ${b.token}`, 2000)).toBe(2);
      for (const bad of [null, "", b.token, "Bearer session-cookie", `Bearer ${b.token}extra`]) expect(tokens.authenticate(bad, 2000)).toBeNull();
      db.prepare("UPDATE users SET is_active=0 WHERE id=2").run();
      expect(tokens.authenticate(`Bearer ${b.token}`, 2000)).toBeNull();
      db.prepare("DELETE FROM users WHERE id=2").run();
      expect(db.prepare("SELECT * FROM todo_widget_tokens").all()).toHaveLength(0);
    } finally { db.close(); }
  });
  it("管理入口必须登录并具有同站来源；支持登录后返回设置页", () => {
    const request = (origin?: string) => new Request("https://app.test/api/todo/widget/access", { headers: { host: "app.test", ...(origin ? { origin } : {}) } });
    expect(widgetSameOrigin(request("https://app.test"))).toBe(true);
    for (const origin of [undefined, "null", "https://other.test", "https://app.test.other.test"]) expect(widgetSameOrigin(request(origin))).toBe(false);
    expect(loginDestination("/todo/widget")).toBe("/todo/widget");
    expect(loginDestination("//evil.test/todo/widget")).toBe("/todo/dashboard");
  });
});

describe("当天日程快照", () => {
  it("只输出北京时间当天、重复例外和展示字段，未完成优先", () => {
    const repeated = event({ date: "2026-10-01", repeat: { frequency: "daily", days: [] }, completed: true, exceptions: { "2026-10-15": { title: "今日跑步", start: "16:00", end: "17:00", completed: false, notes: "隐私" } } });
    const deleted = event({ date: "2026-10-01", repeat: { frequency: "daily", days: [] }, exceptions: { "2026-10-15": null } });
    const result = widgetSnapshot([event({ completed: true }), repeated, deleted, event({ date: "2026-10-14", title: "昨天" }), event({ date: "2026-10-16", title: "明天" })], new Date("2026-10-14T16:00:00Z"));
    expect(result).toMatchObject({ date: "2026-10-15", clock: "00:00", total: 2, completed: 1 });
    expect(result.events).toMatchObject([{ title: "论文", completed: true, status: "completed" }, { title: "今日跑步", completed: false, status: "pending" }]);
    expect(JSON.stringify(result)).not.toMatch(/隐私|私人|昨天|明天|notes|exceptions/);
    expect(widgetSnapshot([repeated], new Date("2026-10-15T16:00:00Z")).events[0].completed).toBe(false);
  });
  it("空日程与大列表统计正确，不为截断列表减少总数", () => {
    const now = new Date("2026-10-15T06:00:00Z");
    expect(widgetSnapshot([], now)).toMatchObject({ total: 0, completed: 0, events: [] });
    const result = widgetSnapshot(Array.from({ length: 30 }, (_, i) => event({ title: `事项${i}` })), now);
    expect(result.total).toBe(30); expect(result.events).toHaveLength(20);
  });
});

async function runScript({ family = "medium", token = "test-token", status = 200, offline = false, events = [event()], total = events.length, runningApp = false, cancel = false }: { runningApp?: boolean; cancel?: boolean; family?: string; token?: string; status?: number; offline?: boolean; events?: TodoEvent[]; total?: number } = {}) {
  const labels: string[] = [];
  const requests: Array<{ url: string; headers?: object; onRedirect?: () => null }> = [];
  const node = () => ({ addImage: () => ({}), addText: (value: string) => { labels.push(value); return {}; }, addSpacer: () => {}, addStack: () => node(), setPadding: () => {}, centerAlignContent: () => {}, layoutVertically: () => {}, layoutHorizontally: () => {} });
  const setWidget = vi.fn(), saveToken = vi.fn();
  const context = {
    Request: class {
      response = { statusCode: status }; headers = {}; onRedirect = () => null;
      constructor(public url: string) { requests.push(this); }
      async loadString() { if (offline) throw Error("offline"); return JSON.stringify({ date: "2026-10-15", clock: "14:00", total, completed: 0, events }); }
    },
    Keychain: { contains: () => Boolean(token), get: () => token, set: saveToken },
    Alert: class { addSecureTextField() {} addAction() {} addCancelAction() {} async presentAlert() { return cancel ? -1 : 0; } textFieldValue() { return "new-connection-code"; } },
    config: { runsInWidget: !runningApp, widgetFamily: family },
    ListWidget: class { constructor() { Object.assign(this, node()); } setPadding() {} async presentMedium() {} },
    Color: class { constructor(public value: string) {} },
    SFSymbol: { named: () => ({ image: {} }) },
    Size: class { constructor(public width: number, public height: number) {} },
    Font: { semiboldSystemFont: vi.fn(), systemFont: vi.fn() },
    Script: { setWidget, name: () => "今日计划", complete: vi.fn() }, Date,
  };
  await runInNewContext(`(async () => {${readFileSync("public/widgets/xipo-today.js", "utf8")}\n})()`, context);
  return { labels, requests, saveToken, widget: setWidget.mock.calls[0][0] };
}

describe("Scriptable 脚本运行逻辑（模拟原生 API）", () => {
  it("三种尺寸限额、点击地址、更新时间与刷新建议", async () => {
    for (const [family, count] of [["small", 2], ["medium", 3], ["large", 7]] as const) {
      const result = await runScript({ family, events: Array.from({ length: 10 }, (_, i) => event({ title: `事项${i}` })) });
      expect(result.labels.filter(label => label.startsWith("事项"))).toHaveLength(count);
      expect(result.labels.join(" ")).toContain("14:00 更新");
      expect(result.labels).toContain("周四");
      expect(result.labels).not.toContain("今日计划");
      expect(result.widget.url).toBe(family === "small" ? "scriptable:///run?scriptName=%E4%BB%8A%E6%97%A5%E8%AE%A1%E5%88%92&action=task" : "https://life-152-32-131-4.nip.io/todo");
      expect(result.widget.refreshAfterDate.getTime()).toBeGreaterThan(Date.now());
      expect(result.requests[0].headers).toMatchObject({ Authorization: "Bearer test-token" });
      expect(result.requests[0].url).not.toContain("test-token");
      expect(result.requests[0].onRedirect!()).toBeNull();
    }
  });
  it("首次连接验证成功才写入钥匙串，取消和失败不保存", async () => {
    const success = await runScript({ token: "", runningApp: true });
    expect(success.saveToken).toHaveBeenCalledWith("xipo-today-widget-v1", "new-connection-code");
    for (const options of [{ status: 401 }, { offline: true }, { cancel: true }]) {
      const result = await runScript({ token: "", runningApp: true, ...options });
      expect(result.saveToken).not.toHaveBeenCalled();
    }
  });
  it("没有连接码、已失效和断网时不显示旧的私人数据", async () => {
    const missing = await runScript({ token: "" });
    expect(missing.requests).toHaveLength(0);
    expect(missing.labels.join(" ")).toContain("先在 Scriptable");
    for (const options of [{ status: 401 }, { offline: true }]) {
      const result = await runScript(options);
      expect(result.labels.join(" ")).not.toContain("论文");
      expect(result.labels.join(" ")).toMatch(/连接码已失效|暂时无法连接/);
      expect(result.widget.url).toContain("/todo/widget");
    }
  });
});

it("手机组件圆圈菜单提交真实状态操作，凭证只在请求头，过期日期不提交", async () => {
  const e = event({ date: "2026-11-03" });
  const source = readFileSync("public/widgets/xipo-today.js", "utf8").split("async function main()")[0];
  for (const [index, expected] of [[0,"completed"],[1,"deferred"],[2,"cancelled"]] as const) {
    const posts: string[] = [];
    const context = {
      args: { queryParameters: { id: e.id, date: e.date } }, UUID: { string: () => "unique-request" },
      Alert: class { addAction() {} addCancelAction() {} async presentSheet() { return index; } },
      Request: class {
        response = { statusCode: 200 }; method = "GET"; body = ""; headers = {};
        async loadString() { if (this.method === "POST") posts.push(this.body); return JSON.stringify({ date:e.date, clock:"14:00", revision:4, events:[e], total:1, completed:0 }); }
      },
    };
    await runInNewContext(`(async()=>{${source}\nawait taskAction("private-token");})()`, context);
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0])).toMatchObject({ id:e.id, date:e.date, status:expected, revision:4, requestId:"unique-request" });
    expect(posts[0]).not.toContain("private-token");
  }
});
