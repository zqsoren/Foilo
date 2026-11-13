"use client";
import { useState } from "react";
import type { Dashboard, Exercise, Workout } from "@/lib/gym/model";
import { clockTime, setLabel, totals } from "@/lib/gym/model";
import { Thumb } from "./parts";
import { MuscleMap } from "./muscle-map";
export function Overview({
  work,
  catalog,
  back,
  home,
  remove,
  justFinished,
}: {
  work: Workout;
  catalog: Exercise[];
  back: () => void;
  home: () => void;
  remove: () => void;
  justFinished: boolean;
}) {
  const total = totals(work);
  const trained = work.items.filter(item => item.sets.some(set => set.done));
  const skipped = work.items.filter(item => item.sets.every(set => !set.done));
  return (
    <>
      <button className="text" onClick={back}>
        ‹ 训练日记
      </button>
      <p className="gym-muted">
        {justFinished ? "✓ 训练完成，辛苦了" : "训练概览"} · {work.day}
      </p>
      <h1>{work.name}</h1>
      <div className="gym-volume"><small>外部训练容量</small><strong>{total.volume.toLocaleString()} <small>kg</small></strong></div>
      <div className="gym-metrics">
        {[
          [
            "训练时长",
            clockTime((work.finished ?? work.started) - work.started),
          ],
          ["训练动作", trained.length],
          ["完成组", total.done],
        ].map(([k, v]) => (
          <div key={k}>
            <small>{k}</small>
            <strong>{v}</strong>
          </div>
        ))}
      </div>
      <h2>动作明细</h2>
      <div className="summary-columns">{[0,1].map(column=><div key={column}>{trained.filter((_,i)=>i%2===column).map(item=><article key={item.id}>
        <Thumb exercise={catalog.find(e=>e.id===item.exerciseId)} />
        <h3>{item.name}</h3>
        <div className="set-dots">{item.sets.map((set,i)=><i key={set.id} data-done={set.done} aria-label={`第 ${i+1} 组${set.done?"完成":"未完成"}`}/>)}</div>
        {item.sets.map((set,i)=>set.done ? <div className="summary-set" key={set.id}><strong>第 {i+1} 组</strong> {setLabel(item.mode,set)}
          {set.stages.map((stage,j)=><small key={j}>↳ {setLabel(item.mode,stage)}</small>)}</div>:null)}
        {item.note && <p className="gym-note"><b>本次动作心得</b>{item.note}</p>}
      </article>)}</div>)}</div>
      {skipped.length>0 && <section><h2>未训练</h2>{skipped.map(i=><p key={i.id}>{i.name}{i.note && <small> · 本次动作心得　{i.note}</small>}</p>)}</section>}
      <MuscleMap entries={work.muscleLoad} period="session" />
      {work.note && (
        <>
          <h2>训练心得</h2>
          <p className="gym-note">{work.note}</p>
        </>
      )}
      <button className="primary wide" onClick={justFinished ? home : remove}>
        {justFinished ? "返回训练首页" : "删除记录"}
      </button>
    </>
  );
}
export function Diary({
  data,
  monthChange,
  open,
  stats,
  switchTab,
  busy,
  selected,
  pick,
}: {
  data: Dashboard;
  monthChange: (month: string) => void;
  open: (id: number) => void;
  stats: boolean;
  switchTab: (v: boolean) => void;
  busy: boolean;
  selected: string;
  pick: (day: string) => void;
}) {
  const [monthly, setMonthly] = useState(false);
  const [year, month] = data.month.split("-").map(Number);
  const start = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const selectedDay = selected.startsWith(data.month)
    ? selected
    : data.month + "-01";
  const shift = (dir: number) =>
    monthChange(
      new Date(Date.UTC(year, month - 1 + dir, 1)).toISOString().slice(0, 7),
    );
  const rows = data.history;
  const dayRows = rows.filter((r) => r.day === selectedDay);
  const spanStart =
    data.month === data.today.slice(0, 7)
      ? data.today
      : data.month + "-" + length;
  const cutoff = new Date(Date.parse(spanStart + "T00:00:00Z") - 6 * 86400000)
    .toISOString()
    .slice(0, 10);
  return (
    <>
      <div className="gym-heading">
        
        <div className="gym-switch">
          <button aria-pressed={!stats} onClick={() => switchTab(false)}>
            训练日记
          </button>
          <button aria-pressed={stats} onClick={() => switchTab(true)}>
            训练统计
          </button>
        </div>
      </div>
      <div className="gym-month">
        <b>
          {month} 月
        </b>
        <button aria-label="上个月" disabled={busy} onClick={() => shift(-1)}>
          ‹
        </button>
        <button aria-label="下个月" disabled={busy} onClick={() => shift(1)}>
          ›
        </button>
        <span>{year} 年</span>
      </div>
      {stats ? (
        (() => {
          const range = monthly
            ? rows
            : rows.filter((r) => r.day >= cutoff && r.day <= spanStart);
          const volume = range.reduce((n, r) => n + r.volume, 0),
            duration = range.reduce((n, r) => n + r.finished - r.started, 0);
          const days = [...new Set(range.map((r) => r.day))].sort();
          const workoutIds = new Set(range.map(r => r.id));
          const points = days.map((day) => ({
            day,
            value: range
              .filter((r) => r.day === day)
              .reduce((n, r) => n + r.volume, 0),
          }));
          const max = Math.max(1, ...points.map((r) => r.value));
          return (
            <>
              <div className="gym-chips">
                <button
                  className={monthly ? "chosen" : ""}
                  onClick={() => setMonthly(true)}
                >
                  整月
                </button>
                <button
                  className={!monthly ? "chosen" : ""}
                  onClick={() => setMonthly(false)}
                >
                  月内最近 7 天
                </button>
              </div>
              <div className="gym-volume">
                <small>外部训练容量</small>
                <strong>
                  {Number(volume.toFixed(2)).toLocaleString()} <small>kg</small>
                </strong>
              </div>
              <div className="gym-metrics">
                <div>
                  <small>训练次数</small>
                  <strong>{range.length}</strong>
                </div>
                <div>
                  <small>总时长</small>
                  <strong>
                    {duration > 0 && duration < 60000
                      ? "<1"
                      : Math.round(duration / 60000)}{" "}
                    分
                  </strong>
                </div>
                <div>
                  <small>完成组</small>
                  <strong>{range.reduce((n, r) => n + r.count, 0)}</strong>
                </div>
              </div>
              <MuscleMap entries={data.muscleLoad.filter(row=>workoutIds.has(row.workoutId))} period={monthly?"month":"week"} />
              <h2>每日训练容量</h2>
              {points.length ? (
                points.map((p) => (
                  <div className="gym-plot" key={p.day}>
                    <span>{p.day.slice(5)}</span>
                    <b>{Number(p.value.toFixed(2))} kg</b>
                    <i style={{ width: (100 * p.value) / max + "%" }} />
                  </div>
                ))
              ) : (
                <p className="gym-muted">这段时间还没有完成的训练。</p>
              )}
            </>
          );
        })()
      ) : (
        <>
          <div className="gym-cal">
            {Array.from("一二三四五六日").map((x) => (
              <small key={x}>{x}</small>
            ))}
            {Array.from({ length: start }, (_, i) => (
              <span key={"pad" + i} />
            ))}
            {Array.from({ length }, (_, i) => {
              const day = data.month + "-" + String(i + 1).padStart(2, "0"),
                list = rows.filter((r) => r.day === day);
              return (
                <button
                  key={day}
                  aria-label={day}
                  aria-pressed={selectedDay === day}
                  onClick={() => pick(day)}
                >
                  <span>{i + 1}</span>
                  {list.length > 0 && (
                    <>
                      <em>
                        {list[0].name}
                        {list.length > 1 ? " +" + (list.length - 1) : ""}
                      </em>
                      <small>
                        {Number(
                          list.reduce((n, r) => n + r.volume, 0).toFixed(2),
                        )}{" "}
                        kg
                      </small>
                    </>
                  )}
                </button>
              );
            })}
          </div>
          <hr className="day-record-divider" />
          {dayRows.length ? (
            dayRows.map((r) => (
              <button
                key={r.id}
                className="gym-history"
                onClick={() => open(r.id)}
              >
                <b>{r.name}</b>
                <small>
                  {clockTime(r.finished - r.started)} · {r.count} 组 ·{" "}
                  {r.volume} kg
                </small>
              </button>
            ))
          ) : (
            <p className="gym-muted">当天没有训练记录。</p>
          )}
        </>
      )}
    </>
  );
}
