"use client";
import { useState } from "react";
import { Check, MoreHorizontal, Plus, X } from "lucide-react";
import { emptyValues, type Mode, type SetRow, type Values } from "@/lib/gym/model";
import { Sheet, SetForm } from "./parts";

type Props = {
  row: SetRow; number: number; mode: Mode; busy: boolean; canCopy: boolean; message: string;
  save: (stages: Values[], done: boolean, after?: () => void) => void;
  copy: () => void;
};

export function TrainingSet({ row, number, mode, busy, canCopy, message, save, copy }: Props) {
  const [menu, setMenu] = useState(false);
  const [editing, edit] = useState<number | null>(null);
  const stages = [row, ...row.stages];
  const drop = stages.length > 1;
  const hasValue = (v: Values) => mode === "time" ? v.seconds > 0 : v.reps + v.rightReps > 0;
  function add(index: number) {
    const next = stages.slice();
    next.splice(index + 1, 0, { ...emptyValues });
    save(next, false, () => { setMenu(false); edit(index + 1); });
  }
  function toggle() {
    const missing = stages.findIndex(v => !hasValue(v));
    if (!row.done && missing >= 0) edit(missing);
    else save(stages, !row.done);
  }
  return <div className="set-block">
    {stages.map((stage, i) => <div className={"set-line" + (i ? " set-stage" : "")} key={i}>
      <span className="set-number">{drop ? (i ? "递 " + (i + 1) : number + " · 递1") : number}</span>
      {mode === "time" ? <button className="set-field timed" onClick={() => edit(i)}><small>秒</small>{stage.seconds || "—"}</button> :
        <>
          <button className="set-field" onClick={() => edit(i)}><small>{mode === "sides" ? "左 / 右 kg" : mode === "pair" ? "单只 kg" : mode === "assist" ? "辅助 kg" : mode === "body" ? "额外 kg" : "kg"}</small>
            {mode === "sides" ? stage.kg + " / " + stage.rightKg : stage.kg}</button>
          <button className="set-field" onClick={() => edit(i)}><small>{mode === "sides" ? "左 / 右 次" : "次"}</small>
            {mode === "sides" ? stage.reps + " / " + stage.rightReps : stage.reps || "—"}</button>
        </>}
      {i === 0 ? <>
        <button disabled={busy} className="set-check" aria-label={"完成第 " + number + " 组"} aria-pressed={!!row.done} onClick={toggle}><Check size={19}/></button>
        <button disabled={busy} className="set-more" aria-label={"第 " + number + " 组操作"} onClick={() => setMenu(true)}><MoreHorizontal size={21}/></button>
      </> : <>
        <button disabled={busy || stages.length >= 30} aria-label={"在第 " + (i+1) + " 段后添加"} onClick={() => add(i)}><Plus size={17}/></button>
        <button className="set-more" disabled={busy} aria-label={"移除第 " + (i+1) + " 段"} onClick={() => save(stages.filter((_,j)=>j!==i), !!row.done)}><X size={16}/></button>
      </>}
    </div>)}
    {menu && <Sheet title={"第 " + number + " 组"} close={() => setMenu(false)} message={message}>
      <div className="set-menu"><button disabled={busy || stages.length>=30} onClick={() => add(stages.length-1)}>{drop ? "添加递减段" : "递减组"}</button>
      <button disabled={busy || !canCopy} onClick={() => { setMenu(false); copy(); }}>复制组</button></div>
    </Sheet>}
    {editing !== null && stages[editing] && <Sheet title={"第 " + number + " 组" + (drop ? " · 递 " + (editing+1) : "")} close={() => edit(null)} message={message}>
      <SetForm row={{...row,...stages[editing]}} mode={mode} busy={busy} segment={drop}
        save={(value, done) => save(stages.map((v,i)=>i===editing?value:v),drop ? !!row.done : done,()=>edit(null))}/>
    </Sheet>}
  </div>;
}
