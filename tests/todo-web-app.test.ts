import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { isMobileTodoDestination, loginDestination, loginUrl } from "../lib/login-routing";

function worker(fetcher: typeof fetch) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const fallback = new Response("offline screen");
  const cache = { add: vi.fn(async () => {}), match: vi.fn(async () => fallback) };
  const caches = { open: vi.fn(async () => cache), keys: vi.fn(async () => ["unrelated", "xipo-todo-offline-v0"]), delete: vi.fn(async () => true) };
  runInNewContext(readFileSync("public/todo-sw.js", "utf8"), {
    self: { location: { origin: "https://example.test" }, addEventListener: (type: string, callback: (event: unknown) => void) => { handlers[type] = callback; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches, fetch: fetcher, URL, Response,
  });
  return { handlers, cache, caches, fallback };
}
const navigation = (path: string) => ({ url: `https://example.test${path}`, method: "GET", mode: "navigate" });

describe("桌面启动与网络恢复", () => {
  it("固定日程入口、独立窗口及不透明纯色图标配置", () => {
    const manifest = JSON.parse(readFileSync("public/todo.webmanifest", "utf8"));
    expect(manifest).toMatchObject({ id: "/todo", start_url: "/todo", scope: "/", display: "standalone" });
    for (const icon of manifest.icons) expect(readFileSync(`public${icon.src}`).subarray(1, 4).toString()).toBe("PNG");
    expect(readFileSync("public/todo-icons/apple-touch-icon.png").readUInt32BE(16)).toBe(180);
  });
  it("登录只能返回受支持的站内入口，阻止外站跳转", () => {
    expect(loginDestination("/todo")).toBe("/todo");
    expect(loginDestination("/")).toBe("/");
    for (const path of ["/dashboard", "/todo/dashboard"]) expect(loginDestination(path)).toBe("/todo/dashboard");
    for (const path of ["/dashboard?view=tasks", "/todo/dashboard?view=tasks"]) {
      expect(loginDestination(path)).toBe("/todo/dashboard?view=tasks");
      expect(loginUrl(path)).toBe("/login?next=%2Ftodo%2Fdashboard%3Fview%3Dtasks");
      expect(isMobileTodoDestination(loginDestination(path))).toBe(false);
    }
    expect(loginUrl("/todo/dashboard")).toBe("/login");
    expect(isMobileTodoDestination("/todo/dashboard")).toBe(false);
    expect(isMobileTodoDestination("/todo?tab=chat")).toBe(true);
    for (const value of [undefined, "//other.example", "https://other.example", "/todo/../settings", ["/todo"]]) expect(loginDestination(value)).toBe("/todo/dashboard");
  });
  it("在线页面直接透传，不缓存用户数据", async () => {
    const response = new Response("private schedule");
    const { handlers, caches } = worker(vi.fn(async () => response));
    let result: Promise<Response> | undefined;
    handlers.fetch({ request: navigation("/todo"), respondWith: (value: Promise<Response>) => { result = value; } });
    expect(await result).toBe(response);
    expect(caches.open).not.toHaveBeenCalled();
  });
  it("断网和服务器暂不可用时显示通用恢复页", async () => {
    for (const fetcher of [vi.fn(async () => { throw new TypeError("offline"); }), vi.fn(async () => new Response("unavailable", { status: 502 }))]) {
      const { handlers, fallback } = worker(fetcher);
      let result: Promise<Response> | undefined;
      handlers.fetch({ request: navigation("/login?next=%2Ftodo"), respondWith: (value: Promise<Response>) => { result = value; } });
      expect(await result).toBe(fallback);
    }
  });
  it("不拦截日程写入、接口读取、Next 页面数据或其他网站", () => {
    const fetcher = vi.fn();
    const { handlers } = worker(fetcher);
    const respondWith = vi.fn();
    for (const request of [navigation("/api/todo"), navigation("/projects"), { ...navigation("/todo"), mode: "cors" }, { ...navigation("/login"), method: "POST" }, { ...navigation("/todo"), url: "https://other.example/todo" }]) handlers.fetch({ request, respondWith });
    expect(respondWith).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("安装只缓存通用离线页，更新只清理本模块旧缓存", async () => {
    const { handlers, cache, caches } = worker(vi.fn());
    let pending: Promise<unknown> | undefined;
    const event = { waitUntil: (value: Promise<unknown>) => { pending = value; } };
    handlers.install(event); await pending;
    expect(cache.add).toHaveBeenCalledExactlyOnceWith("/todo-offline.html");
    handlers.activate(event); await pending;
    expect(caches.delete).toHaveBeenCalledExactlyOnceWith("xipo-todo-offline-v0");
  });
});
