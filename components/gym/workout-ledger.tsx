"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { readPreviousExercise } from "@/app/gym/actions";
import type { Command } from "@/lib/gym/commands";
import { cardioUnit, setLabel, totals, type Exercise, type Mode, type Workout } from "@/lib/gym/model";
import { Elapsed, modeLabels, Sheet, Thumb } from "./parts";
import { TrainingSet } from "./training-set";

function PreviousSets({ exerciseId }: { exerciseId: number }) {
  const [record, setRecord] = useState<Awaited<ReturnType<typeof readPreviousExercise>>>();
  const [error, setError] = useState(false);
  const [attempt, retry] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let current = true;
    readPreviousExercise(exerciseId).then(value => {
      if (current) setRecord(value);
    }).catch(() => { if (current) setError(true); });
    return () => { current = false; };
  }, [exerciseId, attempt]);
  if (error) return <button className="ledger-history-toggle" onClick={() => { setError(false); retry(attempt+1); }}>上次记录读取失败 · 重试</button>;
  if (!record) return <small className="ledger-no-history">{record === null ? "暂无上次记录" : "读取上次记录…"}</small>;
  const { mode, sets, day } = record;
  const stages = sets.flatMap(set => [set, ...set.stages]);
  const numbers = stages.flatMap(v => mode === "time" ? [v.seconds] : mode === "sides" ? [v.kg, v.rightKg] : [v.kg]);
  const min = Math.min(...numbers), max = Math.max(...numbers);
  const range = min === max ? String(max) : min + "–" + max;
  return <>
    <button className="ledger-history-toggle" aria-expanded={open} aria-controls="previous-sets" onClick={() => setOpen(!open)}>
      上次记录　{sets.length} 组 · {range} {mode === "time" ? "秒" : "kg"} <ChevronDown size={14} />
    </button>
    {open && <div className="ledger-history" id="previous-sets">
      <time dateTime={day}>{day.replace(/-/g, ".")}</time>
      <div>{sets.map((set) => <section key={set.id}><small>第 {set.number} 组</small>
        {[set,...set.stages].map((stage,i) => <span key={i}>{setLabel(mode,stage)}</span>)}</section>)}</div>
    </div>}
  </>;
}

const weightLabel: Record<Mode,string> = { load:"重量 kg", pair:"单只 kg", body:"额外 kg", assist:"辅助 kg", sides:"重量 kg", time:"秒" };
const tools = [["minimize","最小化"],["add","加动作"],["note","写心得"]] as const;
type Props = {
  active: Workout; catalog: Map<number,Exercise>; focused: number | null;
  focus: (id:number) => void; finish: () => void; minimize: () => void; append: () => void; note: (id:number,text:string) => void;
  busy:boolean; message:string; send:(command:Command, after?:()=>void, quiet?:boolean)=>void;
};
export function WorkoutLedger({ active,catalog,focused,focus,finish,minimize,append,note,busy,message,send }:Props) {
  const [info, setInfo] = useState(false);
  const item = active.items.find(v => v.id === focused) ?? active.items[0];
  const exercise = catalog.get(item.exerciseId);
  const ref = {workoutId:active.id, revision:active.revision};
  const actions = {minimize,add:append,note:()=>note(item.id,item.note)};
  return <div className="ledger">
    <header className="ledger-head">
      <div><span>训练中</span><button onClick={finish}>结束训练</button></div>
      <div><h1>{active.name}</h1><Elapsed since={active.started}/></div>
      <p><small>总容量</small> {totals(active).volume.toLocaleString()} kg</p>
    </header>
    <div className="ledger-body">
      <nav className="ledger-rail" aria-label="本次训练动作">
        {active.items.map((v,i) => <button key={v.id} aria-label={v.name} aria-pressed={v.id === item.id} onClick={() => focus(v.id)}>
          <b>{String(i+1).padStart(2,"0")}</b><span>{v.name.replace(/^(平板杠铃|杠铃|高位|坐姿)(?=卧推|下拉|划船)/,"")}</span>
          <i aria-label={v.sets.filter(s=>s.done).length+" / "+v.sets.length+" 组完成"}>{v.sets.map(s=><em key={s.id} data-done={!!s.done}/>)}</i>
        </button>)}
      </nav>
      <div key={item.id} className="ledger-main">
        <div className="ledger-exercise">
          <button className="exercise-info-art" aria-label="动作信息" onClick={()=>setInfo(true)}><Thumb exercise={exercise}/></button><h2>{item.name}</h2>
          <PreviousSets exerciseId={item.exerciseId}/>
        </div>
        {item.note && <button className="gym-item-note" onClick={actions.note}>动作心得　{item.note}</button>}
        <div className="ledger-columns"><span>组</span>{item.mode==="time" ? <span className="timed">时长（秒）{cardioUnit(exercise?.code) && " / "+cardioUnit(exercise?.code)}</span> :
          <><span>{weightLabel[item.mode]}</span><span>次数</span></>}<span>完成</span></div>
        {item.sets.map((row,i)=><TrainingSet key={row.id+":"+row.stages.length} unit={cardioUnit(exercise?.code)} row={row} number={i+1} mode={item.mode} busy={busy} canCopy={item.sets.length<30} message={message}
          copy={()=>send({type:"copySet",...ref,setId:row.id})}
          save={(stages,done,after,quiet)=>send({type:"recordStages",...ref,setId:row.id,stages,done},after,quiet)}/>)}
        <button className="ledger-add" disabled={busy || item.sets.length>=30} onClick={()=>send({type:"addSet",...ref,itemId:item.id})}>＋ 添加一组</button>
      </div>
    </div>
    <nav className="gym-tabs ledger-tools" aria-label="训练操作">{tools.map(([icon,label])=><button key={icon} onClick={actions[icon]}><Image unoptimized src={"/folio/ledger/"+icon+".svg"} alt="" width={24} height={24}/>{label}</button>)}</nav>
    {info && <Sheet title={item.name} close={()=>setInfo(false)}><Thumb exercise={exercise}/><p>{[exercise?.region,exercise?.equipment,modeLabels[item.mode]].filter(Boolean).join(" · ")}</p></Sheet>}
  </div>;
}
