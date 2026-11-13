"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { minutes } from "@/lib/todo/model";
import { clockText, dragInterval, lastMinute, type DragPart } from "@/lib/todo/mobile-time";
import styles from "./time-ruler.module.css";

type Interval = { start: string; end: string };
type Gesture = { pointer: number; part: DragPart; x: number; start: number; end: number; width: number; span: number; origin: number };

function parseClock(value: string) {
  const match = /^(\d{1,2}):?(\d{2})$/.exec(value.trim().replace("：", ":"));
  if (!match || +match[1] > 23 || +match[2] > 59) return null;
  return clockText(+match[1] * 60 + +match[2]);
}

export function TimeRuler({ start, end, onChange, disabled }: Interval & { onChange: (v: Interval) => void; disabled: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [active, setActive] = useState<DragPart | null>(null);
  const [editing, setEditing] = useState<{ field: "start" | "end"; value: string } | null>(null);
  const a = minutes(start), b = minutes(end);
  const windowSize = Math.min(lastMinute, Math.max(120, (b-a)*2));
  const span = gesture.current?.span ?? windowSize;
  const center = gesture.current?.origin ?? (a+b-span)/2;
  const origin = Math.max(0, Math.min(lastMinute-span, Math.max(b-span, Math.min(a, center))));
  const left = (a-origin)/span*100, right = (b-origin)/span*100;
  function update(first: number, last: number) { onChange({ start: clockText(first), end: clockText(last) }); }
  function begin(e: PointerEvent<HTMLButtonElement>, part: DragPart) {
    if (!e.isPrimary || e.button !== 0 || gesture.current || !track.current || disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { pointer:e.pointerId, part, x:e.clientX, start:a, end:b, width:track.current.clientWidth, span, origin };
    setActive(part);
  }
  function move(e: PointerEvent<HTMLButtonElement>) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointer) return;
    update(...dragInterval(g.start, g.end, g.part, Math.round((e.clientX-g.x)*g.span/g.width)));
  }
  function release(e: PointerEvent<HTMLButtonElement>) {
    if (gesture.current?.pointer !== e.pointerId) return;
    gesture.current = null;
    setActive(null);
  }
  function key(e: KeyboardEvent<HTMLButtonElement>, part: DragPart) {
    if (!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    update(...dragInterval(a,b,part,(e.key==="ArrowLeft" || e.key==="ArrowDown" ? -1 : 1)*(e.shiftKey?10:1)));
  }
  const handle = (part: DragPart, label: string) => <button type="button" disabled={disabled}
    className={styles[part]} aria-label={label} role="slider" aria-valuetext={part==="range"?start+" 至 "+end:part==="start"?start:end}
    aria-valuemin={part==="end"?a+1:0} aria-valuemax={part==="start"?b-1:part==="range"?lastMinute-(b-a):lastMinute}
    aria-valuenow={part==="end"?b:a} onPointerDown={e=>begin(e,part)} onPointerMove={move}
    onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onKeyDown={e=>key(e,part)} />;
  const field = (name: "start"|"end", label: string) => {
    const value = name==="start"?start:end;
    return <label>{label}<input type="text" inputMode="numeric" autoComplete="off" spellCheck={false} disabled={disabled}
      aria-label={label} value={editing?.field===name?editing.value:value} placeholder="HH:MM"
      onFocus={e=>{ setEditing({field:name,value:e.currentTarget.value}); e.currentTarget.select(); }}
      onChange={e=>{ const raw=e.target.value; setEditing({field:name,value:raw}); const parsed=parseClock(raw);
        const valid=parsed && (name==="start"?parsed<end:parsed>start);
        e.currentTarget.setCustomValidity(valid?"":"请输入有效时间，结束时间须晚于开始时间");
        if(valid) onChange({start,end,[name]:parsed});
      }}
      onBlur={e=>{if(e.currentTarget.validity.valid) setEditing(null);}}
      onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();if(e.currentTarget.reportValidity())e.currentTarget.blur();}}}
    /></label>;
  };
  return <><div className={styles.clocks}>{field("start","开始时间")}<span aria-hidden>→</span>{field("end","结束时间")}</div>
    <div ref={track} className={styles.track} data-active={active ?? ""}>
      <div className={styles.selection} style={{left:left+"%",width:(right-left)+"%"}}>
        {handle("range","整体移动时间段")}{handle("start","调整开始时间")}{handle("end","调整结束时间")}
      </div>
    </div></>;
}
