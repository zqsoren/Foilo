"use client";
import { useState } from "react";
import { Thumb } from "../parts";
import { setLabel, type Exercise } from "@/lib/gym/model";
import {
  widgets,
  regions,
  calendarDays,
  weekStart,
  shiftDay,
  shiftMonth,
  number,
  dateLabel,
  exerciseSeries,
  type DesktopData,
  type Widget,
} from "@/lib/gym/desktop";
import atlas from "@/lib/gym/muscle-atlas.json";
import taxonomy from "@/lib/gym/muscle-taxonomy.json";
import { Chart, Empty, Progress } from "./shared";
export function WidgetFace({
  kind,
  data,
  catalog,
  edit,
}: {
  kind: Widget;
  data: DesktopData;
  catalog: Exercise[];
  edit: (kind: Widget) => void;
}) {
  const [month, setMonth] = useState(data.today.slice(0, 7)),
    [year, setYear] = useState(Number(data.today.slice(0, 4))),
    [heatMode, setHeatMode] = useState("year");
  const sessions = data.sessions.filter((w) => w.day.startsWith(month)),
    settings = data.settings,
    activePlans = data.plans.filter((p) => !p.archived),
    plans = (settings.planIds ?? activePlans.slice(0, 3).map((p) => p.id))
      .map((id) => data.plans.find((p) => p.id === id))
      .filter((p) => !!p);
  const focus = settings.focus,
    ex = catalog.find((e) => e.id === focus?.exerciseId),
    series = focus
      ? exerciseSeries(data, focus.exerciseId, focus.planId)
          .filter((r) => r.sets > 0)
          .slice(-4)
      : [];
  const week = weekStart(data.today),
    weekly = data.sessions.filter(
      (w) => w.day >= week && w.day <= shiftDay(week, 6),
    );
  const count = kind === "week" ? weekly.length : sessions.length,
    target =
      kind === "week" ? settings.weekGoals[week] : settings.monthGoals[month];
  const sum = (key: "volume" | "sets") =>
    sessions.reduce((s, w) => s + w[key], 0);
  const primary = (m: string, r: string) =>
    data.muscles
      .filter(
        (x) =>
          x.month === m &&
          ((taxonomy as Record<string, string[]>)[r] ?? []).includes(x.muscle),
      )
      .reduce((s, x) => s + x.sets, 0);
  const calendar = (
    <>
      <div className="gx-month-nav">
        <button
          aria-label="上个月"
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          ‹
        </button>
        <span>{month.replace("-", " 年 ")} 月</span>
        <button
          aria-label="下个月"
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          ›
        </button>
      </div>
      <div className="gx-calendar">
        {"一二三四五六日".split("").map((d) => (
          <b key={d}>{d}</b>
        ))}
        {calendarDays(month).map((day) => {
          const ws = sessions.filter((w) => w.day === day);
          return (
            <div key={day} className={day.startsWith(month) ? "" : "outside"}>
              <span className={day === data.today ? "today" : ""}>
                {Number(day.slice(8))}
              </span>
              {!!ws.length && (
                <>
                  <small title={ws.map((w) => w.name).join("、")}>
                    {ws.length === 1 ? ws[0].name : ws.length + " 场训练"}
                  </small>
                  <em>{number(ws.reduce((s, w) => s + w.volume, 0))} kg</em>
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
  let content;
  if (kind === "phase") {
    const p = settings.phase,
      rows = p
        ? data.sessions.filter((w) => w.day >= p.start && w.day <= p.end)
        : [],
      months = p
        ? Array.from(
            {
              length: Math.min(
                12,
                (Number(p.end.slice(0, 4)) - Number(p.start.slice(0, 4))) * 12 +
                  Number(p.end.slice(5, 7)) -
                  Number(p.start.slice(5, 7)) +
                  1,
              ),
            },
            (_, i) => shiftMonth(p.start.slice(0, 7), i),
          )
        : [];
    content = (
      <>
        <p className="gx-muted">
          {p
            ? `${p.start} 至 ${p.end} · 自定 ${p.target} 次`
            : "设定一个阶段，持续记录训练"}
        </p>
        <div className="gx-phase">
          <div>
            <strong className="gx-big">{rows.length}</strong>
            <span> / {p?.target ?? "–"} 次</span>
          </div>
          <span>
            {p
              ? `已完成 ${number((rows.length / p.target) * 100)}%`
              : "尚未设置目标"}
          </span>
          <div className="gx-phase-months">
            {months.map((m) => (
              <div key={m}>
                <small>{Number(m.slice(5))} 月</small>
                <strong>
                  {rows.filter((w) => w.day.startsWith(m)).length}
                  <small> 次</small>
                </strong>
              </div>
            ))}
          </div>
        </div>
        <Progress value={rows.length} target={p?.target ?? 0} />
        <button className="gx-link" onClick={() => edit(kind)}>
          调整阶段目标 ›
        </button>
      </>
    );
  } else if (kind === "month" || kind === "week")
    content = (
      <>
        <p className="gx-muted">
          {kind === "week" ? `${week} 至 ${shiftDay(week, 6)}` : month}
        </p>
        <div>
          <strong className="gx-big">{count}</strong>
          <span> / {target ?? "–"} 次</span>
        </div>
        <Progress value={count} target={target ?? 0} />
        <button className="gx-link" onClick={() => edit(kind)}>
          设置目标 ›
        </button>
      </>
    );
  else if (kind === "calendar") content = calendar;
  else if (kind === "plans")
    content = (
      <>
        <button className="gx-link gx-top" onClick={() => edit(kind)}>
          选择展示计划 ›
        </button>
        <div className="gx-plan-trends">
          {plans.length ? (
            plans.map((p) => {
              const pool = data.sessions.filter((w) => w.planId === p.id);
              const rows = pool
                  .filter((w) => w.planRevision === pool[0]?.planRevision)
                  .slice(0, 4)
                  .reverse(),
                last = rows.at(-1),
                previous = rows.at(-2);
              return (
                <div key={p.id}>
                  <div>
                    <h3>{p.name}</h3>
                    <strong className="gx-number">
                      {last ? number(last.volume) : "–"}
                    </strong>{" "}
                    <small>kg</small>
                    <p className="gx-muted">
                      {last && previous
                        ? `较上次 ${last.volume >= previous.volume ? "+" : ""}${number(last.volume - previous.volume)} kg`
                        : "暂无上次记录"}
                    </p>
                  </div>
                  <Chart points={rows} compact />
                </div>
              );
            })
          ) : (
            <Empty>选择要关注的训练计划</Empty>
          )}
        </div>
        <small className="gx-muted">各行使用独立刻度</small>
      </>
    );
  else if (kind === "exercise")
    content = (
      <>
        <button className="gx-link gx-top" onClick={() => edit(kind)}>
          选择动作 ›
        </button>
        {ex ? (
          <>
            <div className="gx-ex-head">
              <Thumb exercise={ex} />
              <div>
                <h3>{ex.name}</h3>
                <p className="gx-muted">
                  {data.plans.find((p) => p.id === focus?.planId)?.name ??
                    "全部计划"}
                </p>
              </div>
              <div>
                <small>最近一次容量</small>
                <p>
                  <strong className="gx-number">
                    {series.at(-1) ? number(series.at(-1)!.volume) : "–"}
                  </strong>{" "}
                  kg
                </p>
              </div>
            </div>
            <Chart
              bars
              points={series.map((r) => ({
                day: r.session.day,
                volume: r.volume,
              }))}
            />
          </>
        ) : (
          <Empty>选择一个动作，查看容量变化</Empty>
        )}
      </>
    );
  else if (kind === "heat") {
    const start =
        heatMode === "year"
          ? weekStart(`${year}-01-01`)
          : weekStart(month + "-01"),
      days = heatMode === "year" ? 371 : 42;
    content = (
      <>
        <div className="gx-heat-controls">
          <button
            aria-pressed={heatMode === "year"}
            onClick={() => setHeatMode("year")}
          >
            年
          </button>
          <button
            aria-pressed={heatMode === "month"}
            onClick={() => setHeatMode("month")}
          >
            月
          </button>
          {heatMode === "year" ? (
            <input
              aria-label="热力图年份"
              type="number"
              min="2000"
              max="2100"
              value={year}
              onChange={(e) =>
                setYear(
                  Math.max(
                    2000,
                    Math.min(2100, Number(e.target.value) || 2000),
                  ),
                )
              }
            />
          ) : (
            <input
              aria-label="热力图月份"
              type="month"
              value={month}
              onChange={(e) => {
                if (e.target.value) setMonth(e.target.value);
              }}
            />
          )}
        </div>
        <div
          className="gx-heat"
          style={{ gridTemplateColumns: `repeat(${days / 7},1fr)` }}
        >
          {Array.from({ length: days }, (_, i) => {
            const day = shiftDay(start, i),
              n = data.sessions.filter((w) => w.day === day).length,
              valid =
                heatMode === "year"
                  ? day.startsWith(String(year))
                  : day.startsWith(month);
            return (
              <i
                key={day}
                title={`${day} · ${n} 场训练`}
                style={{
                  background: !valid
                    ? "transparent"
                    : n
                      ? `rgb(${Math.max(60, 180 - n * 35)} ${Math.max(60, 180 - n * 35)} ${Math.max(60, 180 - n * 35)})`
                      : "#eee",
                }}
              />
            );
          })}
        </div>
      </>
    );
  } else if (kind === "summary")
    content = (
      <div className="gx-summary">
        {[
          ["训练次数", sessions.length, "场"],
          ["完成组外部容量", sum("volume"), "kg"],
          ["已完成组", sum("sets"), "组"],
          [
            "训练用时",
            Math.round(
              sessions.reduce((s, w) => s + w.finished - w.started, 0) / 60000,
            ),
            "分钟",
          ],
        ].map(([label, n, unit]) => (
          <div key={label}>
            <small>{label}</small>
            <strong>{number(Number(n))}</strong>
            <small>{unit}</small>
          </div>
        ))}
      </div>
    );
  else if (kind === "rhythm")
    content = (
      <>
        <strong className="gx-number">
          {
            data.sessions.filter(
              (w) => w.day >= shiftDay(week, -21) && w.day <= data.today,
            ).length
          }
        </strong>{" "}
        场训练
        <div className="gx-rhythm">
          {[-3, -2, -1, 0].map((i) => {
            const start = shiftDay(week, i * 7);
            return (
              <div key={i}>
                <div>
                  {Array.from({ length: 7 }, (_, d) => {
                    const day = shiftDay(start, d),
                      ws = data.sessions.filter((w) => w.day === day);
                    return (
                      <i
                        key={day}
                        title={day + " · " + ws.length + " 场"}
                        style={{ background: ws.length ? "#666" : "#eee" }}
                      />
                    );
                  })}
                </div>
                <small>
                  {dateLabel(start)} 至 {dateLabel(shiftDay(start, 6))}
                </small>
              </div>
            );
          })}
        </div>
      </>
    );
  else if (kind === "planGoals")
    content = (
      <>
        <button className="gx-link gx-top" onClick={() => edit(kind)}>
          设置目标 ›
        </button>
        {plans.length ? (
          plans.map((p) => {
            const n = sessions.filter((w) => w.planId === p.id).length,
              t = settings.planGoals[month + ":" + p.id];
            return (
              <div className="gx-goal-row" key={p.id}>
                <h3>
                  {p.name}
                  <span>
                    {n} / {t ?? "–"} 次
                  </span>
                </h3>
                <Progress value={n} target={t ?? 0} />
              </div>
            );
          })
        ) : (
          <Empty>请先新建训练计划</Empty>
        )}
      </>
    );
  else if (kind === "recent") {
    const w = data.latest;
    content = w ? (
      <>
        <p className="gx-muted">
          {w.day} · {w.name}
        </p>
        <div className="gx-recent-summary">
          {Math.round((w.finished! - w.started) / 60000)} 分钟 ·{" "}
          {number(
            w.items.reduce(
              (s, i) =>
                s + i.sets.reduce((v, x) => v + (x.done ? x.volume : 0), 0),
              0,
            ),
          )}{" "}
          kg
        </div>
        <div className="gx-recent-items">
          {w.items
            .filter((i) => i.sets.some((s) => s.done))
            .map((i) => (
              <div key={i.id}>
                <Thumb exercise={catalog.find((e) => e.id === i.exerciseId)} />
                <h3>{i.name}</h3>
                {i.sets
                  .filter((s) => s.done)
                  .map((s) => (
                    <p key={s.id}>
                      ● {setLabel(i.mode, s)}
                      {s.stages.map((v, k) => (
                        <small key={k}>↳ {setLabel(i.mode, v)}</small>
                      ))}
                    </p>
                  ))}
                {i.note && <p>{i.note}</p>}
              </div>
            ))}
        </div>
        {w.items.some((i) => !i.sets.some((s) => s.done)) && (
          <p className="gx-muted">
            未训练：
            {w.items
              .filter((i) => !i.sets.some((s) => s.done))
              .map((i) => i.name)
              .join("、")}
          </p>
        )}
      </>
    ) : (
      <Empty />
    );
  } else if (kind === "comparison") {
    const last = data.sessions[0],
      previous = data.sessions.find(
        (w) =>
          w.planId === last?.planId &&
          w.planRevision === last?.planRevision &&
          w.id !== last.id,
      ),
      rows = data.items.filter((i) => i.workoutId === last?.id);
    content =
      last && previous ? (
        <>
          <p className="gx-muted">
            {last.name} · {previous.day} 与 {last.day} · kg
          </p>
          <table>
            <thead>
              <tr>
                <th>动作</th>
                <th>上次</th>
                <th>本次</th>
                <th>变化</th>
              </tr>
            </thead>
            <tbody>
              {[...new Set(rows.map((i) => i.exerciseId))].map((id) => {
                const current = rows.filter((i) => i.exerciseId === id),
                  old = data.items.filter(
                    (i) => i.workoutId === previous.id && i.exerciseId === id,
                  ),
                  a = current.reduce((s, i) => s + i.volume, 0),
                  b = old.reduce((s, i) => s + i.volume, 0);
                return (
                  <tr key={id}>
                    <td>{current[0].name}</td>
                    <td>{old.length ? number(b) : "–"}</td>
                    <td>{number(a)}</td>
                    <td>{old.length ? number(a - b) : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      ) : (
        <Empty>同一计划完成两场训练后显示对照</Empty>
      );
  } else if (kind === "focus") {
    const months = [-3, -2, -1].map((i) => shiftMonth(month, i));
    content = (
      <>
        <p className="gx-muted">主练完成组 · 三个完整月份</p>
        <table>
          <thead>
            <tr>
              <th>部位</th>
              {months.map((m) => (
                <th key={m}>{Number(m.slice(5))} 月</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {regions.map((r) => (
              <tr key={r}>
                <td>{r}</td>
                {months.map((m) => (
                  <td key={m}>
                    <span className="gx-cell">{primary(m, r)}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  } else {
    const m = shiftMonth(month, -1);
    content = (
      <>
        <p className="gx-muted">{m} · 各部位主练完成组</p>
        <div className="gx-body">
          <div className="gx-figures">
            {(["front", "back"] as const).map((side) => (
              <figure key={side}>
                <svg
                  viewBox={atlas.viewBox}
                  aria-label={side === "front" ? "人体正面" : "人体背面"}
                >
                  {Object.entries(atlas.layers[`surface-${side}`]).map(
                    ([muscle, d]) => {
                      const n = data.muscles
                        .filter((x) => x.month === m && x.muscle === muscle)
                        .reduce((s, x) => s + x.sets, 0);
                      return (
                        <path
                          key={muscle}
                          d={d}
                          fillRule="evenodd"
                          fill={
                            n
                              ? `rgb(${Math.max(75, 210 - n * 3)} ${Math.max(75, 210 - n * 3)} ${Math.max(75, 210 - n * 3)})`
                              : "#ddd"
                          }
                          stroke="white"
                          strokeWidth="1.5"
                        >
                          <title>{`${muscle || "人体轮廓"} · ${n} 主练组`}</title>
                        </path>
                      );
                    },
                  )}
                </svg>
                <figcaption>{side === "front" ? "正面" : "背面"}</figcaption>
              </figure>
            ))}
          </div>
          <dl>
            {regions.map((r) => (
              <div key={r}>
                <dt>{r}</dt>
                <dd>{primary(m, r)} 组</dd>
              </div>
            ))}
          </dl>
        </div>
      </>
    );
  }
  return (
    <article
      className={`gx-card gx-widget gx-widget-${kind}`}
      style={{ width: widgets[kind][1], height: widgets[kind][2] }}
    >
      <h2>{widgets[kind][0]}</h2>
      {content}
    </article>
  );
}
