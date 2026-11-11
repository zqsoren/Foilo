"use client";
import Link from "next/link";
import { useState } from "react";
import type { widgetSnapshot } from "@/lib/todo/widget";
import styles from "./widget-setup.module.css";

type Status = { connected: boolean; expiresAt: number | null; canWrite?: boolean };
export function WidgetSetup({ initialStatus, snapshot, scriptSource }: { scriptSource: string; initialStatus: Status; snapshot: ReturnType<typeof widgetSnapshot> }) {
  const [status, setStatus] = useState(initialStatus);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [size, setSize] = useState<"small" | "medium" | "large">("medium");
  const [script, setScript] = useState("");
  const limit = size === "small" ? 2 : size === "large" ? 7 : 3;
  const events = snapshot.events.slice(0, limit);
  const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "short", timeZone: "Asia/Shanghai" }).format(new Date(`${snapshot.date}T00:00:00+08:00`));
  async function change(revoke = false) {
    if (busy) return;
    if (status.connected && !window.confirm(revoke ? "停用后，小组件将无法再读取日程。确定停用？" : "重新生成会使旧连接码失效，需要在 Scriptable 中更换。继续？")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/todo/widget/access", { method: revoke ? "DELETE" : "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "操作失败");
      setStatus(data); setToken(data.token ?? ""); setShowToken(false);
      setNotice(revoke ? "已停用。手机已显示的内容会在下次刷新时清除。" : "连接码已生成，请复制到 Scriptable。离开后不再显示。");
    } catch (e) { setError(e instanceof Error ? e.message : "网络连接失败，请重试"); }
    finally { setBusy(false); }
  }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice("已复制"); setError(""); }
    catch { setError("未能自动复制，请展开内容后长按复制。"); }
  }
  function copyScript() {
    // Keep clipboard.writeText in the tap gesture for iPhone Safari.
    setScript(scriptSource);
    void copy(scriptSource);
  }
  return <main className={styles.page}>
    <header className={styles.header}><Link href="/todo">‹ 日程</Link><h1>桌面小组件</h1><span>iPhone</span></header>
    <section className={styles.previewArea} aria-label="小组件外观预览">
      <div className={styles.sizes} aria-label="预览尺寸">{(["small", "medium", "large"] as const).map((value, index) => <button key={value} aria-pressed={size === value} onClick={() => setSize(value)}>{["小", "中", "大"][index]}</button>)}</div>
      <div className={`${styles.widget} ${styles[size]}`}>
        <aside className={styles.datePanel}><span>{Number(snapshot.date.slice(5, 7))}月{Number(snapshot.date.slice(8))}日<br />{weekday}</span><div className={styles.progress}><strong>{snapshot.pending}</strong><b>{snapshot.completed}/{snapshot.total}</b></div></aside>
        <div className={styles.content}><div className={styles.events}>{events.length ? events.map((event, index) => <div key={index} className={`${styles.event} ${event.status !== "pending" ? styles.done : ""}`}><span>{event.completed ? "✓" : event.status === "cancelled" ? "⊖" : event.status === "deferred" ? "❯" : "○"}</span><div><strong className={event.completed ? styles.completedTitle : undefined}>{event.title}</strong><time>{event.start ? `${event.start}–${event.end}` : "时间待定"}</time></div></div>) : <div className={styles.empty}>今天还没有日程<small>点击安排今天</small></div>}</div>
        <footer>{snapshot.total > events.length ? `另 ${snapshot.total - events.length} 项 · ` : ""}{snapshot.clock} 更新</footer></div>
      </div>
      <p>白底鲜橙分栏 · 北京时间 · 实际样式随手机尺寸略有不同</p>
    </section>
    <div className={styles.steps}>
      <section><h2><i>1</i>安装 Scriptable</h2><p>借助这个 iPhone 应用，将网页里的日程放到桌面。</p><a className={styles.button} href="https://apps.apple.com/app/scriptable/id1405459188" target="_blank" rel="noreferrer">打开 App Store</a></section>
      <section><h2><i>2</i>添加或更新日程脚本</h2><p>首次使用：在 Scriptable 新建脚本，粘贴并命名「今日计划」。已安装：打开原脚本，全选替换为新版，保存后运行一次。原连接码仍可读取；要启用状态操作，请重新生成连接码并在脚本中更换一次。</p><button className={styles.button} onClick={copyScript}>复制新版脚本 · v4</button>{script ? <details><summary>展开脚本，手动复制</summary><textarea aria-label="日程脚本" readOnly value={script} onFocus={e => e.target.select()} rows={5} /></details> : null}</section>
      <section><h2><i>3</i>连接你的日程</h2><p>生成连接码后，在 Scriptable 中运行「今日计划」，将连接码粘贴到提示框。</p>
        <div className={styles.actions}><button className={styles.primary} disabled={busy} onClick={() => change()}>{busy ? "处理中…" : status.connected ? "重新生成连接码" : "生成连接码"}</button>{status.connected ? <button className={styles.revoke} disabled={busy} onClick={() => change(true)}>停用</button> : null}</div>
        {token ? <div className={styles.token}><input aria-label="小组件连接码" type={showToken ? "text" : "password"} readOnly value={token} onFocus={e => e.target.select()} autoComplete="off" /><button onClick={() => setShowToken(!showToken)}>{showToken ? "隐藏" : "显示"}</button><button onClick={() => copy(token)}>复制</button></div> : null}
        <p className={styles.hint}>新连接码可读取当天任务并修改完成、推迟、取消状态；不会开放聊天记录或其他账号。旧版只读连接码需重新生成一次才能操作。请勿分享给他人。{status.expiresAt ? `有效期至 ${new Date(status.expiresAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}。` : "有效期为一年，可随时停用。"}</p>
      </section>
      <section><h2><i>4</i>放到手机桌面</h2><p>长按桌面空白处 → 编辑／添加小组件 → 搜索 Scriptable → 选择尺寸。添加后长按小组件 → 编辑小组件 → Script 选择「今日计划」。中、大尺寸点击圆圈可打开任务操作；小尺寸点击组件后选择任务。</p><button className={styles.button} onClick={() => copy("https://life-152-32-131-4.nip.io/todo")}>复制日程地址</button></section>
    </div>
    <p className={styles.footnote}>刷新由 iOS 调度，不保证即时更新。打开 Scriptable 运行脚本可查看最新计划。Scriptable 不能识别双击、三击：点击圆圈会打开操作菜单，选择完成、推迟或取消。iOS 决定桌面刷新时间，操作后可能稍有延迟。</p>
    {notice ? <div className={styles.notice} role="status">{notice}</div> : null}
    {error ? <div className={styles.error} role="alert">{error}</div> : null}
  </main>;
}
