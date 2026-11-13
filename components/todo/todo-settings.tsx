"use client";
import Link from "next/link";
import { useState } from "react";
import type { McpAccessStatus } from "@/lib/todo/mcp-access";
import styles from "./todo-settings.module.css";
import { productVersions } from "@/lib/product-versions";
const endpoint = "https://life-152-32-131-4.nip.io/api/todo/mcp";
const tools: Record<string, string> = { get_day_schedule: "读取每日日程", get_event_details: "读取日程细节", create_event: "新建日程", update_event: "修改日程", delete_event: "删除日程", update_events: "批量调整日程" };
const date = (time: number) => new Date(time).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
export function TodoSettings({ initialStatus }: { initialStatus: McpAccessStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [key, setKey] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [manualCopy, setManualCopy] = useState("");
  async function request(method: "GET" | "POST" | "DELETE") {
    if (busy) return;
    if (method !== "GET" && status.enabled && !window.confirm(method === "DELETE" ? "停用后，已连接的 AI 将不能再读取或修改日程。确定停用？" : "重新生成后，旧 API Key 立即失效，需要更新 AI 的连接配置。继续？")) return;
    setBusy(true); setError(""); setNotice(""); setManualCopy("");
    try {
      const response = await fetch("/api/todo/mcp/access", { method, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "操作失败，请重试");
      if (method !== "GET" || data.createdAt !== status.createdAt || !data.enabled) { setKey(data.key ?? ""); setVisible(false); }
      setStatus(data);
      setNotice(method === "POST" ? "API Key 已生成，仅此次显示。请复制并保存到需要连接的 AI 中。" : method === "DELETE" ? "MCP 连接已停用，旧密钥已失效。" : "连接状态已刷新");
    } catch (e) { setError(e instanceof Error ? e.message : "网络连接失败，请重试"); }
    finally { setBusy(false); }
  }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice("已复制"); setError(""); setManualCopy(""); }
    catch { setManualCopy(value); setError("未能自动复制，请长按下面的内容手动复制。"); }
  }
  function config(secret: string) { return JSON.stringify({ mcpServers: { "xipo-todo": { type: "http", url: endpoint, headers: { Authorization: `Bearer ${secret}` } } } }, null, 2); }
  return <main className={styles.page}>
    <header className={styles.header}><Link href="/todo?tab=chat">‹ AI 助手</Link><h1>设置</h1></header>
    <section className={styles.intro}><h2>让其他 AI 帮你安排</h2><p>连接你自己的日程，读取计划、查看进度，也可以帮你调整安排。</p></section>
    <section className={styles.card}>
      <div className={styles.row}><h3>个人 MCP 连接</h3><span className={status.enabled ? styles.enabled : styles.disabled}>{status.enabled ? "已启用" : "未启用"}</span></div>
      <p className={styles.description}>每个账号使用独立 API Key，只能访问自己的 TODO 日程。它与 AI 模型接口密钥不同。</p>
      <dl><div><dt>最近调用</dt><dd>{status.lastUsedAt ? date(status.lastUsedAt) : "尚未调用"}</dd></div>{status.lastTool ? <div><dt>最近操作</dt><dd>{tools[status.lastTool] ?? status.lastTool}</dd></div> : null}<div><dt>调用次数</dt><dd>{status.calls}</dd></div>{status.expiresAt ? <div><dt>有效期至</dt><dd>{date(status.expiresAt)}</dd></div> : null}</dl>
      <div className={styles.actions}><button className={styles.primary} disabled={busy} onClick={() => request("POST")}>{status.enabled ? "重新生成 API Key" : "启用并生成 API Key"}</button><button disabled={busy} onClick={() => request("GET")}>刷新状态</button>{status.enabled ? <button className={styles.danger} disabled={busy} onClick={() => request("DELETE")}>停用</button> : null}</div>
      {key ? <div className={styles.key}><label htmlFor="mcp-key">个人 API Key</label><div><input id="mcp-key" type={visible ? "text" : "password"} value={key} readOnly autoComplete="off" onFocus={e => e.target.select()} /><button onClick={() => setVisible(!visible)}>{visible ? "隐藏" : "显示"}</button><button onClick={() => copy(key)}>复制</button></div></div> : null}
      <p className={styles.hint}>有效期一年，可随时停用。请仅交给你信任的 AI；持有此密钥即可读取及修改允许修改的日程。{status.enabled && !key ? "已有密钥仍可使用；忘记密钥时可重新生成。" : ""}</p>
    </section>
    <section className={styles.card}>
      <h3>连接方法</h3><p className={styles.description}>在支持远程 MCP 和自定义请求头的 AI 客户端中，添加以下配置。</p>
      <div className={styles.field}><span>连接地址</span><code>{endpoint}</code><button onClick={() => copy(endpoint)}>复制地址</button></div>
      <dl><div><dt>传输方式</dt><dd>Streamable HTTP</dd></div><div><dt>请求头</dt><dd><code>Authorization: Bearer 你的 API Key</code></dd></div></dl>
      <details><summary>查看 JSON 配置示例</summary><pre>{config("YOUR_API_KEY")}</pre><p className={styles.hint}>此连接可读取日程、创建与调整未完成事项。过去日期与已完成事项只读，重复日程仅修改指定那一天。</p></details>
      <button className={styles.secondary} disabled={!key} onClick={() => copy(config(key))}>复制含密钥的连接配置</button>
      <p className={styles.hint}>{key ? "复制后直接粘贴到客户端的 MCP 配置中；不要公开分享配置。" : "生成 API Key 后可一键复制完整配置，也可以手动替换示例中的 YOUR_API_KEY。"}只支持 OAuth 登录、不能填写密钥的客户端暂不能直接连接。</p>
    </section>
    <Link className={styles.widgetLink} href="/todo/widget"><span>桌面小组件</span><span>设置与安装 ›</span></Link>
    <small className={styles.version}>ToDo {productVersions.todo}</small>
    {manualCopy ? <textarea className={styles.manualCopy} aria-label="手动复制内容" readOnly value={manualCopy} rows={5} onFocus={e => e.target.select()} /> : null}
    {notice ? <div className={styles.notice} role="status">{notice}</div> : null}{error ? <div className={styles.error} role="alert">{error}</div> : null}
  </main>;
}
