"use client";
import { useRef, useState } from "react";
import { shanghaiNow, type TodoEvent } from "@/lib/todo/model";
import { addDays } from "@/lib/life-date";
import styles from "./todo.module.css";
export function InlineSchedule({ date, busy, onSave }: { date: string; busy: boolean; onSave: (event: TodoEvent) => Promise<boolean> }) {
  const [draft, setDraft] = useState<TodoEvent | null>(null);
  const lock = useRef(false), titleRef = useRef<HTMLInputElement>(null);
  function activate() {
    if (draft) return;
    const now = shanghaiNow(), [h,m] = now.clock.split(":").map(Number);
    const rounded = Math.ceil((h*60+m)/10)*10;
    const start = date === now.date ? rounded : 9*60;
    const clock = (n: number) => `${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;
    const fits = start+60 < 1440;
    setDraft({ id: crypto.randomUUID(), title: "", notes: "", date: start >= 1440 ? addDays(date,1) : date, start: fits ? clock(start) : null, end: fits ? clock(start+60) : null, completed: false, fixed: false });
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
