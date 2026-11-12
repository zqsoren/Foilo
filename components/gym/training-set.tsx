"use client";
import { useState, useRef } from "react";
import { Check, MoreHorizontal, Plus, X } from "lucide-react";
import { emptyValues, type Mode, type SetRow, type Values } from "@/lib/gym/model";
import { Sheet } from "./parts";

type Props = {
  row: SetRow; number: number; mode: Mode; busy: boolean; canCopy: boolean; message: string;
  save: (stages: Values[], done: boolean, after?: () => void, quiet?: boolean) => void;
  copy: () => void;
};

export function TrainingSet({ row, number, mode, busy, canCopy, message, save, copy }: Props) {
  const [menu, setMenu] = useState(false);
  const form = useRef<HTMLDivElement>(null);
  const stages = [row, ...row.stages];
  const drop = stages.length > 1;
  const hasValue = (v: Values) => mode === "time" ? v.seconds > 0 : v.reps + v.rightReps > 0;
  function readFields() {
    const next = stages.map(({kg,reps,rightKg,rightReps,seconds}) => ({kg,reps,rightKg,rightReps,seconds}));
    for (const input of form.current?.querySelectorAll<HTMLInputElement>("input[data-field]") ?? []) {
      next[Number(input.dataset.stage)][input.dataset.field as keyof Values] = Number(input.value);
    }
    return next;
  }
  function field(i: number, key: keyof Values, label: string, caption = label) {
    const weight = key === "kg" || key === "rightKg";
    return <label className="inline-number" key={key}><small>{caption}</small>
      <input key={row.id + ":" + i + ":" + key} data-field={key} data-stage={i}
        aria-label={"第 " + number + " 组，第 " + (i+1) + " 段，" + label}
        type="number" inputMode={weight ? "decimal" : "numeric"} min={0}
        max={key === "seconds" ? 86400 : 10000} step={weight ? "any" : 1}
        defaultValue={stages[i][key] || ""} placeholder={weight ? "0" : "—"}
        onFocus={event => {event.currentTarget.dataset.initial = event.currentTarget.value; event.currentTarget.select();}}
        onKeyDown={event => { if(event.key === "Enter") event.currentTarget.blur(); }}
        onBlur={event => {
          const input = event.currentTarget;
          if (input.value === input.dataset.initial) return;
          if (!input.validity.valid) {
            input.reportValidity();
            input.value = input.dataset.initial ?? "";
            return;
          }
          const values = readFields();
          save(values, !!row.done && values.every(hasValue), undefined, true);
        }} />
    </label>;
  }
  function add(index: number) {
    const next = readFields();
    next.splice(index + 1, 0, { ...emptyValues });
    save(next, false, () => { setMenu(false); });
  }
  function toggle() {
    const values = readFields();
    const missing = values.findIndex(v => !hasValue(v));
    if (!row.done && missing >= 0) form.current?.querySelector<HTMLInputElement>(`input[data-stage="${missing}"][data-field="${mode==="time"?"seconds":"reps"}"]`)?.focus();
    else save(values, !row.done);
  }
  return <div className="set-block" data-mode={mode} ref={form}>
    {stages.map((stage, i) => <div className={"set-line" + (i ? " set-stage" : "")} key={i}>
      <span className="set-number">{drop ? (i ? "递 " + (i + 1) : number + " · 递1") : String(number).padStart(2,"0")}</span>
      {mode === "time" ? <div className="set-field timed">{field(i,"seconds","时长（秒）","秒")}</div> :
        <>
          <div className="set-field">{field(i,"kg",mode==="sides"?"左 kg":mode==="pair"?"单只 kg":mode==="assist"?"辅助 kg":mode==="body"?"额外 kg":"kg")}{mode==="sides" && field(i,"rightKg","右 kg")}</div>
          <div className="set-field">{field(i,"reps",mode==="sides"?"左 次":"次")}{mode==="sides" && field(i,"rightReps","右 次")}</div>
        </>}
      {i === 0 ? <>
        <button disabled={busy} className="set-check" aria-label={"完成第 " + number + " 组"} aria-pressed={!!row.done} onClick={toggle}><Check size={19}/></button>
        <button disabled={busy} className="set-more" aria-label={"第 " + number + " 组操作"} onClick={() => setMenu(true)}><MoreHorizontal size={21}/></button>
      </> : <>
        <button disabled={busy || stages.length >= 30} aria-label={"在第 " + (i+1) + " 段后添加"} onClick={() => add(i)}><Plus size={17}/></button>
        <button className="set-more" disabled={busy} aria-label={"移除第 " + (i+1) + " 段"} onClick={() => save(readFields().filter((_,j)=>j!==i), !!row.done)}><X size={16}/></button>
      </>}
    </div>)}
    {menu && <Sheet title={"第 " + number + " 组"} close={() => setMenu(false)} message={message}>
      <div className="set-menu"><button disabled={busy || stages.length>=30} onClick={() => add(stages.length-1)}>{drop ? "添加递减段" : "递减组"}</button>
      <button disabled={busy || !canCopy} onClick={() => { setMenu(false); copy(); }}>复制组</button></div>
    </Sheet>}
  </div>;
}
