import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mcpAccess } from "../lib/todo/mcp-access";
import { todoMcpTools } from "../lib/todo/mcp-tools";
import { todoRepository } from "../lib/todo/repository";
import { handleTodoMcp } from "../lib/todo/mcp-server";
import { emptyState, type TodoEvent } from "../lib/todo/model";
import { widgetTokens } from "../lib/todo/widget";
const now = new Date("2026-10-16T02:00:00Z");
const event = (extra: Partial<TodoEvent> = {}): TodoEvent => ({ id: crypto.randomUUID(), title: "写论文", date: "2026-10-16", start: "14:00", end: "15:00", completed: false, notes: "阅读材料", fixed: false, ...extra });
function setup(events: TodoEvent[] = []) {
  const db = new Database(":memory:"); db.pragma("foreign_keys=ON");
  db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY, is_active INTEGER); INSERT INTO users VALUES(1,1),(2,1)");
  const repo = todoRepository(db);
  repo.writeTodo(1, 0, crypto.randomUUID(), { ...emptyState(), events });
  repo.writeTodo(2, 0, crypto.randomUUID(), { ...emptyState(), events: [event({ title: "另一用户私事" })] });
  return { db, repo, service: todoMcpTools(db, 1, () => now), access: mcpAccess(db) };
}
const change = (revision = 1) => ({ request_id: crypto.randomUUID(), expected_revision: revision });

describe("个人 MCP API Key", () => {
  it("按账号隔离，只存哈希，支持轮换、撤销、过期和禁用账号", () => {
    const { db, access } = setup();
    try {
      const a = access.issue(1, 1000), b = access.issue(2, 1000);
      expect(access.authenticate(`Bearer ${a.key}`, 1000)).toBe(1);
      expect(access.authenticate(`Bearer ${b.key}`, 1000)).toBe(2);
      expect(JSON.stringify(db.prepare("SELECT * FROM todo_mcp_keys").all())).not.toContain(a.key);
      expect(access.authenticate(`Bearer ${a.key}`, a.expiresAt!)).toBeNull();
      access.issue(1, 2000); expect(access.authenticate(`Bearer ${a.key}`, 2000)).toBeNull();
      expect(access.authenticate(`Bearer ${b.key}`, 2000)).toBe(2);
      access.revoke(1); expect(access.status(1).enabled).toBe(false);
      db.prepare("UPDATE users SET is_active=0 WHERE id=2").run();
      expect(access.authenticate(`Bearer ${b.key}`, 2000)).toBeNull();
      expect(access.authenticate(`Bearer ${widgetTokens(db).issue(1).token}`)).toBeNull();
      expect(widgetTokens(db).authenticate(`Bearer ${access.issue(1).key}`)).toBeNull();
    } finally { db.close(); }
  });
});

describe("MCP 日程读写", () => {
  it("每天列表/详情含完成情况、备注和总数，分页不改变统计，不输出其他模块", () => {
    const a = event(), b = event({ completed: true });
    const { db, service } = setup([a, b, event({ date: "2026-10-15", title: "过去" })]);
    try {
      const day = service.call("get_day_schedule", { date: "2026-10-16", limit: 1 });
      expect(day).toMatchObject({ revision: 1, total: 2, completed: 1, pending: 1, next_offset: 1 });
      expect(day.events).toHaveLength(1);
      expect(service.call("get_event_details", { id: a.id })).toMatchObject({ event: { notes: "阅读材料", editable: true } });
      expect(service.call("get_day_schedule", { date: "2026-10-15" })).toMatchObject({ total: 1 });
      expect(service.call("get_day_schedule", { date: "2026-10-20" })).toMatchObject({ total: 0 });
      expect(JSON.stringify(day)).not.toMatch(/另一用户|messages|apiKey|password/);
    } finally { db.close(); }
  });
  it("新增幂等重试返回同一结果，重复ID不同内容拒绝；旧revision不会覆盖", () => {
    const { db, repo, service } = setup();
    try {
      const request = { ...change(), title: "健身", date: "2026-10-16", start: "16:00", end: "17:00" };
      const first = service.call("create_event", request);
      expect(first.revision).toBe(2);
      expect(service.call("create_event", request)).toEqual({ ...first, replayed: true });
      expect(repo.readTodo(1).events).toHaveLength(1);
      expect(() => service.call("create_event", { ...request, title: "不同" })).toThrow("request_id");
      expect(() => service.call("create_event", { ...request, request_id: crypto.randomUUID() })).toThrow("revision=2");
      const created = repo.readTodo(1).events[0];
      service.call("update_event", { ...change(2), id: created.id, patch: { title: "力量训练", notes: "做三组", completed: true } });
      expect(repo.readTodo(1).events[0]).toMatchObject({ title: "力量训练", notes: "做三组", completed: true });
      expect(() => service.call("delete_event", { ...change(3), id: created.id })).toThrow("已完成");
    } finally { db.close(); }
  });
  it("自定义每周重复可从非重复日开始，不误判创建失败", () => {
    const { db, service } = setup();
    try {
      const result = service.call("create_event", { ...change(), title: "周六训练", date: "2026-10-16", start: "16:00", end: "17:00", repeat: { frequency: "custom", days: [6] } });
      expect(result.revision).toBe(2);
      expect(service.call("get_day_schedule", { date: "2026-10-16" }).total).toBe(0);
      expect(service.call("get_day_schedule", { date: "2026-10-17" }).total).toBe(1);
    } finally { db.close(); }
  });
  it("拒绝跨账号ID、过去日期和已完成内容的修改删除，不允许客户端传userId", () => {
    const past = event({ date: "2026-10-15" }), done = event({ completed: true });
    const { db, repo, service } = setup([past, done]);
    try {
      for (const value of [past, done, repo.readTodo(2).events[0]]) {
        expect(() => service.call("delete_event", { ...change(), id: value.id })).toThrow();
        expect(() => service.call("update_event", { ...change(), id: value.id, patch: { completed: false, title: "修改" } })).toThrow();
      }
      expect(() => service.call("get_event_details", { id: repo.readTodo(2).events[0].id })).toThrow("找不到");
      expect(() => service.call("get_day_schedule", { userId: 2 })).toThrow();
      expect(repo.readTodo(1).revision).toBe(1);
    } finally { db.close(); }
  });
  it("批量交换顺序原子保存，冲突或任一受保护项使全部回滚", () => {
    const a = event(), b = event({ title: "健身", start: "15:05", end: "16:05" }), past = event({ date: "2026-10-15" });
    const { db, repo, service } = setup([a, b, past]);
    try {
      service.call("update_events", { ...change(), changes: [{ id: a.id, patch: { start: b.start, end: b.end } }, { id: b.id, patch: { start: a.start, end: a.end } }] });
      expect(repo.readTodo(1).events.find(e => e.id === b.id)?.start).toBe("14:00");
      const saved = repo.readTodo(1);
      expect(() => service.call("update_events", { ...change(2), changes: [{ id: a.id, patch: { title: "不应保存" } }, { id: past.id, patch: { title: "非法" } }] })).toThrow("过去");
      expect(repo.readTodo(1)).toEqual(saved);
      expect(() => service.call("update_event", { ...change(2), id: a.id, patch: { start: "14:30" } })).toThrow("重叠");
      expect(() => service.call("update_event", { ...change(2), id: a.id, patch: { start: "15:03" } })).toThrow("5 分钟");
      expect(repo.readTodo(1)).toEqual(saved);
    } finally { db.close(); }
  });
  it("重复日程只能操作单日，其他日期和原始完成状态不受影响", () => {
    const root = event({ date: "2026-10-01", repeat: { frequency: "daily", days: [] } });
    const { db, repo, service } = setup([root]);
    try {
      expect(() => service.call("delete_event", { ...change(), id: root.id })).toThrow("occurrence_date");
      service.call("update_event", { ...change(), id: root.id, occurrence_date: "2026-10-16", patch: { notes: "今日细节", completed: true } });
      expect(service.call("get_event_details", { id: root.id, occurrence_date: "2026-10-16" })).toMatchObject({ event: { completed: true, notes: "今日细节" } });
      expect(service.call("get_event_details", { id: root.id, occurrence_date: "2026-10-17" })).toMatchObject({ event: { completed: false, notes: "阅读材料" } });
      service.call("delete_event", { ...change(2), id: root.id, occurrence_date: "2026-10-17" });
      expect(service.call("get_day_schedule", { date: "2026-10-17" }).total).toBe(0);
      expect(repo.readTodo(1).events).toHaveLength(1);
    } finally { db.close(); }
  });
});

describe("官方 MCP SDK 客户端互通", () => {
  it("握手、工具发现、读取、创建、更新、批量更新、删除、撤销密钥", async () => {
    const { db, access } = setup();
    const key = access.issue(1).key;
    const client = new Client({ name: "todo-integration-test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL("http://127.0.0.1:3000/api/todo/mcp"), {
      requestInit: { headers: { Authorization: `Bearer ${key}` } },
      fetch: async (input, init) => {
        const request = new Request(input, init); request.headers.set("host", "127.0.0.1:3000");
        return handleTodoMcp(request, db);
      },
    });
    try {
      await client.connect(transport);
      expect((await client.listTools()).tools).toHaveLength(6);
      const day = await client.callTool({ name: "get_day_schedule", arguments: { date: "2099-01-01" } });
      expect(day.structuredContent).toMatchObject({ total: 0, revision: 1 });
      const created = await client.callTool({ name: "create_event", arguments: { ...change(), title: "远程测试", date: "2099-01-01", start: "14:00", end: "15:00" } });
      expect(created.isError).not.toBe(true);
      const state = todoRepository(db).readTodo(1), id = state.events[0].id;
      const update = await client.callTool({ name: "update_event", arguments: { ...change(2), id, patch: { title: "已修改" } } });
      expect(update.structuredContent).toMatchObject({ revision: 3 });
      expect((await client.callTool({ name: "get_event_details", arguments: { id } })).structuredContent).toMatchObject({ event: { title: "已修改" } });
      expect((await client.callTool({ name: "update_events", arguments: { ...change(3), changes: [{ id, patch: { start: "15:00", end: "16:00" } }] } })).isError).not.toBe(true);
      expect((await client.callTool({ name: "delete_event", arguments: { ...change(4), id } })).structuredContent).toMatchObject({ revision: 5 });
      expect(access.status(1).calls).toBe(6);
      access.revoke(1);
      await expect(client.callTool({ name: "get_day_schedule", arguments: {} })).rejects.toThrow();
    } finally { await client.close(); db.close(); }
  });
  it("拒绝错误凭证、cookie替代、外站Origin、错误Host和超长请求", async () => {
    const { db, access } = setup(); const key = access.issue(1).key;
    const req = (headers: Record<string,string> = {}, body = '{}') => new Request("http://127.0.0.1:3000/api/todo/mcp", { method: "POST", headers: { host: "127.0.0.1:3000", "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body });
    try {
      expect((await handleTodoMcp(req({ cookie: "life_session=anything" }), db)).status).toBe(401);
      expect((await handleTodoMcp(req({ authorization: `Bearer ${key}`, origin: "https://evil.test" }), db)).status).toBe(403);
      expect((await handleTodoMcp(req({ authorization: `Bearer ${key}`, host: "evil.test" }), db)).status).toBe(403);
      expect((await handleTodoMcp(req({ authorization: `Bearer ${key}` }, 'x'.repeat(130*1024)), db)).status).toBe(413);
      const malformed = await handleTodoMcp(req({ authorization: `Bearer ${key}` }, 'not json'), db);
      expect(malformed.status).toBe(400);
      expect(malformed.headers.get("cache-control")).toContain("no-store");
    } finally { db.close(); }
  });
});
