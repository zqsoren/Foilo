"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Circle, Menu, Repeat2, MessageSquare, Plus, Undo2, X } from "lucide-react";
import { addDays, displayDate, weekBounds } from "@/lib/life-date";
import { durationLabel, statusOf, isPending, minutes, shanghaiNow, type TodoEvent, type TodoRequest, type TodoState } from "@/lib/todo/model";
import { eventsForDate, occurrenceOn, repeatLabel } from "@/lib/todo/recurrence";
import { TaskStatusButton } from "./task-status-button";
import { InlineSchedule } from "./inline-schedule";
import { EventEditor } from "./event-editor";
import { VoiceInput } from "./voice-input";
import styles from "./todo.module.css";

type Mutation = TodoRequest extends infer T ? T extends TodoRequest ? Omit<T, "revision" | "requestId"> : never : never;

export function TodoApp({ initialState, today: initialToday, aiConfigured: initialConfigured, initialTab = "schedule" }: { initialState: TodoState; today: string; aiConfigured: boolean; initialTab?: "schedule" | "chat" }) {
  const [state, setState] = useState(initialState);
  const [today, setToday] = useState(initialToday);
  const [date, setDate] = useState(initialToday);
  const [tab, setTab] = useState<"schedule" | "chat">(initialTab);
  const [editing, setEditing] = useState<TodoEvent | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [aiConfigured, setAiConfigured] = useState(initialConfigured);
  const [clock, setClock] = useState("");
  const active = useRef(false);
  const editRevision = useRef(initialState.revision);
  const lastRequest = useRef<{ key: string; id: string } | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const acceptState = useCallback((next: TodoState) => setState((current) => next.revision >= current.revision ? next : current), []);

  useEffect(() => {
    async function refresh() {
      const now = shanghaiNow(); setToday(now.date); setClock(now.clock);
      if (active.current) return;
      try { const response = await fetch("/api/todo", { cache: "no-store" }); if (response.ok) { const data = await response.json(); acceptState(data.state); setAiConfigured(data.aiConfigured); } } catch { /* Keep the last saved schedule readable while offline. */ }
    }
    void refresh();
    const interval = setInterval(() => { const now = shanghaiNow(); setToday(now.date); setClock(now.clock); }, 30_000);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, [acceptState]);
  useEffect(() => { if (tab === "chat") chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [tab, state.messages.length, sending]);

  async function mutate(input: Mutation, expectedRevision = state.revision): Promise<boolean> {
    if (active.current) return false;
    active.current = true; setBusy(true); setError(""); setNotice("");
    const key = JSON.stringify(input);
    const requestId = lastRequest.current?.key === key ? lastRequest.current.id : crypto.randomUUID();
    lastRequest.current = { key, id: requestId };
    try {
      const response = await fetch("/api/todo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, ...(input.action === "save" ? { event: { ...input.event, exceptions: undefined } } : {}), revision: expectedRevision, requestId }), signal: AbortSignal.timeout(135_000) });
      const data = await response.json();
      if (data.state) acceptState(data.state);
      if (response.status === 409 && data.state) setEditing(null);
      if (!response.ok) { lastRequest.current = null; throw new Error(data.error ?? "保存失败，请重试"); }
      lastRequest.current = null;
      return true;
    } catch (error) { setError(error instanceof Error && error.name !== "TypeError" ? error.message : "网络连接失败，请重试；已保存的日程不会丢失。"); return false; }
    finally { active.current = false; setBusy(false); }
  }
  const dayEvents = eventsForDate(state.events, date);
  const scheduled = dayEvents.filter((event) => event.start).sort((a, b) => a.start!.localeCompare(b.start!));
  const unscheduled = dayEvents.filter((event) => !event.start);
  const done = dayEvents.filter((event) => event.completed).length;
  const weekStart = weekBounds(date).start;
  const weekdays = ["一", "二", "三", "四", "五", "六", "日"];

  function openEditor(event: TodoEvent) {
    editRevision.current = state.revision;
    setError(""); setEditing(event);
  }

  function createEvent() {
    const now = shanghaiNow();
    const currentMinutes = date === now.date ? Math.ceil(minutes(now.clock) / 5) * 5 : 9 * 60;
    let start = Math.min(currentMinutes, 23 * 60);
    for (const event of scheduled) {
      if (!event.completed && minutes(event.start!) < start + 60 && minutes(event.end!) + 5 > start) start = minutes(event.end!) + 5;
    }
    const toClock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
    const fits = start + 60 < 1440 && (date !== now.date || start >= minutes(now.clock));
    openEditor({ id: crypto.randomUUID(), title: "", date, start: fits ? toClock(start) : null, end: fits ? toClock(start + 60) : null, notes: "", fixed: false, completed: false });
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim(); if (!content || busy) return;
    setSending(content);
    const success = await mutate({ action: "chat", date, content });
    setSending("");
    if (success) setDraft("");
  }
  function eventCard(event: TodoEvent, compact = false) {
    const current = event.date === today && event.start && event.end && event.start <= clock && clock < event.end && isPending(event);
    return <div className={`${styles.eventCard} ${styles[statusOf(event)] ?? ""} ${current ? styles.current : ""} ${compact ? styles.compact : ""}`}>
      <TaskStatusButton event={event} disabled={busy} onStatus={status => { void mutate({ action: "status", id: event.id, occurrenceDate: event.occurrenceDate, date: event.date, status }); }} />
      {compact ? <span className={styles.compactTime}>{event.start ?? "待安排"}<br />{event.end}</span> : null}
      <button type="button" className={styles.eventBody} onClick={() => openEditor(event)}><strong>{event.title}</strong><span>{durationLabel(event)}{event.repeat ? <><Repeat2 size={11} />{repeatLabel(event)}</> : null}{current ? <em>进行中</em> : null}</span></button>
      <button type="button" className={styles.eventArrow} aria-label={`编辑：${event.title}`} onClick={() => openEditor(event)}><ChevronRight size={17} /></button>
    </div>;
  }

  return <main className={`${styles.root} ${tab === "chat" ? styles.chatRoot : ""}`}>
    <div className={styles.main}>
      <header className={styles.heading}>{tab === "chat" ? <h1>DIGTODO AI</h1> : <span />}{tab === "schedule" ? <div className={styles.headerActions}><button aria-label="新建日程" className={styles.newButton} onClick={createEvent}><Plus size={22} /></button></div> : <Link href="/todo/settings" className={styles.settingsLink} aria-label="设置"><Menu size={23} /></Link>}</header>
      {error ? <div className={styles.error} role="alert"><span>{error}</span><button aria-label="关闭错误提示" onClick={() => setError("")}><X size={16} /></button></div> : null}
      {notice ? <div className={styles.notice} role="status"><span>{notice}</span><button aria-label="关闭提示" onClick={() => setNotice("")}><X size={16} /></button></div> : null}

      {tab === "schedule" ? <>
        <div className={styles.monthRow}><label className={styles.datePicker}><span>{Number(date.slice(5, 7))}月 <small>{date.slice(0, 4)}</small><ChevronDown size={16} /></span><input type="date" aria-label="选择日期" value={date} onInput={(event) => { if (event.currentTarget.value) setDate(event.currentTarget.value); }} /></label><button className={styles.todayButton} onClick={() => setDate(today)}>今天</button></div>
        <div className={styles.weekNavigation}><button aria-label="上一周" onClick={() => setDate(addDays(date, -7))}><ChevronLeft size={15} /></button><span>{displayDate(weekStart).monthDay} — {displayDate(addDays(weekStart, 6)).monthDay}</span><button aria-label="下一周" onClick={() => setDate(addDays(date, 7))}><ChevronRight size={15} /></button></div>
        <div className={styles.week}>{weekdays.map((label, i) => { const value = addDays(weekStart, i); return <button key={value} aria-label={`${value}${value === today ? " 今天" : ""}`} aria-pressed={value === date} onClick={() => setDate(value)} className={value === date ? styles.selectedDay : ""}><span>{label}</span><strong>{Number(value.slice(8))}</strong><i className={value === today ? styles.todayDot : ""} /></button>; })}</div>
        <div className={styles.sectionHeading}><span>{done}/{dayEvents.length} 已完成</span></div>
        <div className={styles.progressTrack} role="progressbar" aria-label="完成进度" aria-valuenow={done} aria-valuemin={0} aria-valuemax={dayEvents.length || 1}><i style={{ width: `${dayEvents.length ? done / dayEvents.length * 100 : 0}%` }} /></div>
        {dayEvents.length ? <div className={styles.timeline}>{scheduled.map(event => <div key={`${event.id}:${event.date}`} className={styles.timelineRow}><div className={styles.timeLabel}><i /><strong>{event.start}</strong><span>{event.end}</span></div>{eventCard(event)}</div>)}
          {unscheduled.length ? <><h3 className={styles.unscheduledHeading}>待安排 <span>{unscheduled.length}</span></h3>{unscheduled.map((event) => <div key={event.id} className={styles.unscheduled}>{eventCard(event)}</div>)}</> : null}
        </div> : null}
        <InlineSchedule key={date} date={date} busy={busy} onSave={event => mutate({ action: "save", event })} />
        {state.undo ? <button className={styles.undo} disabled={busy} onClick={async () => { if (await mutate({ action: "undo" })) setNotice("已撤销上一次修改"); }}><Undo2 size={14} />撤销上一次修改</button> : null}
      </> : <div className={styles.chat}>
        {!aiConfigured ? <p className={styles.configNotice}>还没有找到 AI 配置。<Link href="/settings">前往工作台设置</Link>后即可使用。</p> : null}
        <div className={styles.messages} aria-live="polite">
          {state.messages.map((message) => <div key={message.id} className={message.role === "user" ? styles.userMessage : styles.assistantMessage}><p>{message.content}</p>{message.eventIds?.map((id) => { const root = state.events.find((event) => event.id === id); const event = root?.repeat ? occurrenceOn(root, date) ?? Array.from({ length: 7 }, (_, i) => occurrenceOn(root, addDays(root.date, i))).find(Boolean) : root; return event ? <div key={id} className={styles.chatEvent}>{event.date !== date ? <small>{event.date}</small> : null}{eventCard(event, true)}</div> : null; })}</div>)}
          {sending ? <><div className={styles.userMessage}><p>{sending}</p></div><div className={styles.thinking}><span /><span /><span />正在查看日程、安排时间…</div></> : null}
          <div ref={chatEnd} />
        </div>
        <div className={styles.composerDock}>{state.undo ? <button className={styles.undo} disabled={busy} onClick={async () => { if (await mutate({ action: "undo" })) setNotice("已撤销上一次修改"); }}><Undo2 size={14} />撤销上一次修改</button> : null}<form className={styles.composer} onSubmit={send}><textarea ref={draftRef} aria-label="告诉 AI 你的安排" rows={1} maxLength={4000} placeholder="说说你的安排…" value={draft} disabled={busy} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><VoiceInput disabled={busy} onText={(text) => setDraft((draft) => `${draft}${draft ? "，" : ""}${text}`)} onNotice={setNotice} /><button type="submit" className={styles.sendButton} disabled={busy || !draft.trim() || !aiConfigured} aria-label="发送"><ArrowUp size={22} /></button></form></div>
      </div>}
    </div>
    <nav className={styles.navigation} aria-label="日程工具导航"><button aria-label="日程" aria-current={tab === "schedule" ? "page" : undefined} onClick={() => setTab("schedule")}><CalendarDays size={21} /></button><button aria-label="AI助手" aria-current={tab === "chat" ? "page" : undefined} onClick={() => setTab("chat")}><MessageSquare size={21} />{sending ? <Circle size={6} fill="currentColor" className={styles.navDot} /> : null}</button></nav>
    {editing ? <EventEditor key={editing.id} event={editing} seriesEvent={state.events.find((event) => event.id === editing.id)} serverError={error} isNew={!state.events.some((event) => event.id === editing.id)} busy={busy} onClose={() => setEditing(null)} onSave={async (event) => { const ok = await mutate({ action: "save", event }, editRevision.current); if (ok) { setDate(event.date); } return ok; }} onDelete={async (id, occurrenceDate) => { const ok = await mutate({ action: "delete", id, occurrenceDate }, editRevision.current); if (ok) setNotice("日程已删除，可以撤销"); return ok; }} /> : null}
  </main>;
}
