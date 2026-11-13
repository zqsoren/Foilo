"use client";
import { useRef, useState } from "react";
import { type TodoEvent } from "@/lib/todo/model";
import { initialSlot } from "@/lib/todo/mobile-time";
import styles from "./todo.module.css";
export function InlineSchedule({ date, events, busy, onSave }: { date: string; events: TodoEvent[]; busy: boolean; onSave: (event: TodoEvent) => Promise<boolean> }) {
  const [draft, setDraft] = useState<TodoEvent | null>(null);
  const lock = useRef(false), titleRef = useRef<HTMLInputElement>(null);
  function activate() {
    if (draft) return;
    setDraft({ id: crypto.randomUUID(), title: "", notes: "", ...initialSlot(date, events), completed: false, fixed: false });
  }
  async function commit() {
    if (!draft || busy || lock.current) return;
    if (!draft.title.trim()) { setDraft(null); return; }
    lock.current = true;
    try { if (await onSave({ ...draft, title: draft.title.trim() })) setDraft(null); } finally { lock.current = false; }
  }
  return <div className={styles.inlineRow} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) void commit(); }} onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); void commit(); } }}>
    <button type="button" aria-label="添加日程" className={styles.blankCircle} disabled={busy} onClick={() => { activate(); titleRef.current?.focus(); }} />
    <div className={styles.inlineFields}>
      <input ref={titleRef} aria-label="新日程标题" value={draft?.title ?? ""} disabled={busy} onFocus={activate} onChange={e => setDraft(d => d ? { ...d, title: e.target.value } : d)} />
      {draft ? <><input aria-label="备注" className={styles.inlineNotes} placeholder="备注" value={draft.notes} disabled={busy} onChange={e => setDraft({ ...draft, notes: e.target.value })} /><div className={styles.inlineTimes}>
        <label>日期<input type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></label>
        <label>开始<input type="time" value={draft.start ?? ""} onChange={e => setDraft({ ...draft, start: e.target.value || null, end: draft.end ?? "23:59" })} /></label>
        <label>结束<input type="time" value={draft.end ?? ""} onChange={e => setDraft({ ...draft, end: e.target.value || null })} /></label>
      </div></> : null}
    </div>
  </div>;
}
