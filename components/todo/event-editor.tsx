"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarDays, Check, Clock3, Trash2, X } from "lucide-react";
import { durationLabel, type TodoEvent } from "@/lib/todo/model";
import { TimeRuler } from "./time-ruler";
import { weekday } from "@/lib/todo/recurrence";
import styles from "./todo.module.css";

export function EventEditor({ event, seriesEvent, isNew, busy, serverError, onClose, onSave, onDelete }: {
  event: TodoEvent; isNew: boolean; busy: boolean; onClose: () => void;
  seriesEvent?: TodoEvent;
  serverError: string;
  onSave: (event: TodoEvent) => Promise<boolean>; onDelete: (id: string, occurrenceDate?: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(event);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError("");
    if (draft.start && draft.end && draft.end <= draft.start) { setError("结束时间应晚于开始时间。"); return; }
    if (draft.repeat?.frequency === "custom" && !draft.repeat.days.length) { setError("请选择至少一个重复的星期。"); return; }
    if (await onSave(draft)) onClose();
    else setError("没有保存成功，请检查页面提示后重试。");
  }
  return <dialog ref={dialog} className={styles.editor} aria-labelledby="todo-editor-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={submit} className={styles.editorForm}>
      <header className={styles.editorHeader}>
        <button type="button" aria-label="取消" disabled={busy} onClick={onClose}><X size={21} /></button>
        <h2 id="todo-editor-title">{isNew ? "新建日程" : "编辑日程"}</h2>
      </header>
      <div className={styles.editorBody}>
        <section className={styles.formCard} aria-label="时间">
        {event.occurrenceDate && seriesEvent ? <label className={styles.field}>修改范围<select aria-label="修改范围" value={draft.occurrenceDate ? "occurrence" : "series"} onChange={(e) => { setDraft(e.target.value === "series" ? { ...seriesEvent, occurrenceDate: undefined } : event); setConfirmDelete(false); }}><option value="occurrence">仅这一次</option><option value="series">整个重复日程</option></select></label> : null}
        <label className={styles.formDate}><CalendarDays size={18} />
          <span>{draft.date.replace(/-/g, " / ")}</span><small>{draft.date ? "周" + "日一二三四五六"[weekday(draft.date)] : ""} ﹀</small>
          <input aria-label="日期" type="date" required disabled={Boolean(draft.occurrenceDate)} value={draft.date}
            onChange={e => { if(e.currentTarget.value) setDraft({ ...draft, date:e.currentTarget.value }); }} />
        </label>
        {draft.start !== null && draft.end !== null && <>
          <TimeRuler start={draft.start} end={draft.end} disabled={busy} onChange={times=>setDraft(current=>({...current,...times}))} />
          <div className={styles.duration}><span><Clock3 size={14} />持续时长</span><strong>{durationLabel(draft)}</strong></div>
        </>}
        </section>
        <section className={styles.formCard} aria-label="日程内容">
        <label className={styles.field}>标题<input required maxLength={160} value={draft.title} placeholder="要做什么？" onChange={(e) => setDraft({ ...draft, title: e.target.value })}  /></label>
        <label className={`${styles.field} ${styles.notesField}`}>备注<input maxLength={2000} value={draft.notes} placeholder="添加备注（可选）" onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
        </section>
        <section className={styles.formCard} aria-label="时间选项">
        <label className={styles.toggleField}><span><strong>暂不安排时间</strong><small>先记下来，稍后再安排</small></span><input type="checkbox" checked={draft.start === null} onChange={(e) => setDraft({ ...draft, start: e.target.checked ? null : "09:00", end: e.target.checked ? null : "10:00", fixed: false })} /><i aria-hidden="true" /></label>
        <label className={styles.field}>重复<select aria-label="重复" disabled={Boolean(draft.occurrenceDate)} value={draft.repeat?.frequency ?? "none"} onChange={(e) => setDraft({ ...draft, fixed: false, repeat: e.target.value === "none" ? null : { frequency: e.target.value as "daily" | "weekly" | "custom", days: [weekday(draft.date)] } })}><option value="none">不重复</option><option value="daily">每天</option><option value="weekly">每周{ "日一二三四五六"[weekday(draft.date)] }</option><option value="custom">指定周几</option></select></label>
        {draft.repeat?.frequency === "custom" ? <div className={styles.repeatDays} role="group" aria-label="重复星期">{[1, 2, 3, 4, 5, 6, 0].map((day) => <button key={day} type="button" disabled={Boolean(draft.occurrenceDate)} aria-label={`每周${"日一二三四五六"[day]}`} aria-pressed={draft.repeat!.days.includes(day)} onClick={() => { const days = draft.repeat!.days.includes(day) ? draft.repeat!.days.filter((value) => value !== day) : [...draft.repeat!.days, day]; setDraft({ ...draft, repeat: { frequency: "custom", days } }); }}>{"日一二三四五六"[day]}</button>)}</div> : null}
        </section>
        {serverError || error ? <p role="alert" className={styles.inlineError}>{serverError || error}</p> : null}
        {!isNew ? <div className={styles.deleteArea}>{confirmDelete ? <><p>{draft.occurrenceDate ? "只删除这一次" : draft.repeat ? "删除整个重复日程" : "删除此日程"}？删除后可以撤销。</p><button disabled={busy} type="button" onClick={async () => { if (await onDelete(event.id, draft.occurrenceDate)) onClose(); }} className={styles.deleteButton}>确认删除</button><button type="button" onClick={() => setConfirmDelete(false)}>保留日程</button></> : <button disabled={busy} type="button" onClick={() => setConfirmDelete(true)} className={styles.deleteButton}><Trash2 size={16} />删除日程</button>}</div> : null}
      </div>
      <footer className={styles.editorFooter}><button type="submit" disabled={busy}><Check size={17} />{busy ? "保存中" : isNew ? "保存日程" : "保存修改"}</button></footer>
    </form>
  </dialog>;
}
