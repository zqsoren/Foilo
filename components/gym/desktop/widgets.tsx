"use client";
import { memo, useState } from "react";
import { Thumb } from "../parts";
import { setLabel, type Exercise, type Workout } from "@/lib/gym/model";
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
import { Empty, Modal, Progress } from "./shared";
import { MiniTrend, CapacityBars } from "./widget-charts";

function monthDay(day: string, withYear = false) {
  return `${withYear ? Number(day.slice(0, 4)) + " 年 " : ""}${Number(day.slice(5, 7))} 月 ${Number(day.slice(8))} 日`;
}

function DatePager({
  label,
  previous,
  next,
  unit,
}: {
  label: string;
  previous: () => void;
  next: () => void;
  unit: "周" | "月";
}) {
  return (
    <div
      className="gx-date-pager"
      aria-label={unit === "周" ? "周范围选择" : "月份选择"}
    >
      <button
        aria-label={unit === "周" ? "上一周" : "上个月"}
        onClick={previous}
      >
        ‹
      </button>
      <span>{label}</span>
      <button aria-label={unit === "周" ? "下一周" : "下个月"} onClick={next}>
        ›
      </button>
    </div>
  );
}

function RecentExercise({
  item,
  catalog,
}: {
  item: Workout["items"][number];
  catalog: Exercise[];
}) {
  return (
    <article className={"gx-recent-exercise" + (item.note ? " has-note" : "")}>
      <div className="gx-recent-identity">
        <Thumb exercise={catalog.find((e) => e.id === item.exerciseId)} />
        <h3>{item.name}</h3>
        <div
          className="gx-recent-dots"
          aria-label={`${item.sets.filter((s) => s.done).length} 组已完成，共 ${item.sets.length} 组`}
        >
          {item.sets.map((s) => (
            <i key={s.id} className={s.done ? "done" : ""} />
          ))}
        </div>
      </div>
      <ol className="gx-recent-set-list">
        {item.sets.map((s, i) =>
          s.done ? (
            <li key={s.id}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <div>
                {setLabel(item.mode, s)}
                {s.stages.length > 0 && (
                  <div className="gx-recent-stages">
                    {s.stages.map((stage, k) => (
                      <small key={k}>{setLabel(item.mode, stage)}</small>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ) : null,
        )}
      </ol>
      {item.note && <p className="gx-recent-note">本次动作心得：{item.note}</p>}
    </article>
  );
}

export const WidgetFace = memo(function WidgetFace({
  kind,
  data,
  catalog,
  edit,
}: {
  kind: Widget;
  data: DesktopData;
  catalog: Exercise[];
  edit: (kind: Widget, period?: string) => void;
}) {
  const [month, setMonth] = useState(data.today.slice(0, 7)),
    [year, setYear] = useState(Number(data.today.slice(0, 4))),
    [heatMode, setHeatMode] = useState("year"),
    [week, setWeek] = useState(weekStart(data.today)),
    [detail, setDetail] = useState<"body" | "focus" | null>(null);
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
  const weekly = data.sessions.filter(
      (w) => w.day >= week && w.day <= shiftDay(week, 6),
    ),
    orderedWeek = [...weekly].sort((a, b) => a.started - b.started);
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
      <DatePager
        unit="月"
        label={`${Number(month.slice(0, 4))} 年 ${Number(month.slice(5))} 月`}
        previous={() => setMonth(shiftMonth(month, -1))}
        next={() => setMonth(shiftMonth(month, 1))}
      />
      <div className="gx-calendar">
        {"一二三四五六日".split("").map((d) => (
          <b key={d}>{d}</b>
        ))}
        {calendarDays(month).map((day) => {
          const ws = sessions.filter((w) => w.day === day);
          return (
            <div
              key={day}
              className={
                (day.startsWith(month) ? "" : "outside") +
                (ws.length ? " has-training" : "") +
                (day > data.today ? " future" : "")
              }
            >
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
        <p className="gx-widget-caption">
          {p
            ? `${Number(p.start.slice(5, 7))} 月 ${Number(p.start.slice(8))} 日—${Number(p.end.slice(0, 4)) === Number(p.start.slice(0, 4)) + 1 ? "次年 " : p.end.slice(0, 4) === p.start.slice(0, 4) ? "" : p.end.slice(0, 4) + " 年 "}${Number(p.end.slice(5, 7))} 月 ${Number(p.end.slice(8))} 日 · 自定 ${p.target} 次`
            : "设定一个阶段，持续记录训练"}
        </p>
        <div className="gx-phase">
          <div className="gx-phase-total">
            <strong className="gx-big">{rows.length}</strong>
            <span> / {p?.target ?? "–"} 次</span>
          </div>
          <span className="gx-phase-completion">
            {p
              ? `已完成 ${number((rows.length / p.target) * 100)}%`
              : "尚未设置目标"}
          </span>
          <div className="gx-phase-months">
            {months.map((m) => (
              <div key={m}>
                <small>{Number(m.slice(5))} 月</small>
                <p>
                  <strong>
                    {rows.filter((w) => w.day.startsWith(m)).length}
                  </strong>
                  <span> / {settings.monthGoals[m] ?? "–"} 次</span>
                </p>
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
        {kind === "week" && (
          <DatePager
            unit="周"
            label={`${Number(week.slice(5, 7))} 月 ${Number(week.slice(8))} 日 – ${Number(shiftDay(week, 6).slice(5, 7))} 月 ${Number(shiftDay(week, 6).slice(8))} 日`}
            previous={() => setWeek(shiftDay(week, -7))}
            next={() => setWeek(shiftDay(week, 7))}
          />
        )}
        <div className="gx-goal-total">
          <strong className="gx-big">{count}</strong>
          <span> / {target ?? "–"} 次</span>
        </div>
        {kind === "month" ? (
          <>
            <Progress value={count} target={target ?? 0} />
            <small className="gx-goal-percentage">
              {target ? number((count / target) * 100) + "%" : "尚未设置目标"}
            </small>
          </>
        ) : target && target > 14 ? (
          <Progress value={count} target={target} />
        ) : (
          <div className="gx-week-segments">
            {Array.from(
              {
                length: Math.max(1, Math.min(14, target ?? Math.max(3, count))),
              },
              (_, i) => (
                <div key={i}>
                  <i className={i < count ? "done" : ""} />
                  {orderedWeek[i] && (
                    <small>
                      {dateLabel(orderedWeek[i].day)}　{orderedWeek[i].name}
                    </small>
                  )}
                </div>
              ),
            )}
          </div>
        )}
        <button
          className="gx-link"
          onClick={() => edit(kind, kind === "week" ? week : month)}
        >
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
                    <div className="gx-plan-value">
                      <strong className="gx-number">
                        {last ? number(last.volume) : "–"}
                      </strong>
                      <small>kg</small>
                    </div>
                    <p className="gx-muted">
                      {last && previous
                        ? `较上次 ${last.volume >= previous.volume ? "+" : ""}${number(last.volume - previous.volume)} kg`
                        : "暂无上次记录"}
                    </p>
                  </div>
                  <MiniTrend points={rows} />
                </div>
              );
            })
          ) : (
            <Empty>选择要关注的训练计划</Empty>
          )}
        </div>
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
                  <span>kg</span>
                </p>
                <span className="gx-ex-change">
                  {series.length > 1
                    ? `较上次 ${series.at(-1)!.volume >= series.at(-2)!.volume ? "+" : ""}${number(series.at(-1)!.volume - series.at(-2)!.volume)} kg`
                    : "暂无上次记录"}
                </span>
              </div>
            </div>
            <CapacityBars
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
          <div className="gx-heat-segmented">
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
          </div>
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
          <span aria-hidden>▾</span>
        </div>
        <div
          className="gx-heat"
          data-mode={heatMode}
          style={{
            gridTemplateColumns: `repeat(${days / 7},${heatMode === "year" ? "8px" : "1fr"})`,
          }}
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
                      : "#f0f0f0",
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
            "累计训练时长",
            sessions.reduce((s, w) => s + w.finished - w.started, 0),
            "小时 : 分钟",
          ],
        ].map(([label, n, unit]) => (
          <div key={label}>
            <small>{label}</small>
            <strong>
              {label === "累计训练时长"
                ? `${Math.floor(Number(n) / 3600000)
                    .toString()
                    .padStart(2, "0")}:${Math.floor((Number(n) / 60000) % 60)
                    .toString()
                    .padStart(2, "0")}`
                : number(Number(n))}
            </strong>
            <small>{unit}</small>
          </div>
        ))}
      </div>
    );
  else if (kind === "rhythm")
    content = (
      <>
        <div className="gx-rhythm-total">
          <strong className="gx-number">
            {
              data.sessions.filter(
                (w) => w.day >= shiftDay(week, -21) && w.day <= data.today,
              ).length
            }
          </strong>{" "}
          <span>场训练</span>
        </div>
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
                  {dateLabel(start)} —{" "}
                  {start.slice(0, 7) === shiftDay(start, 6).slice(0, 7)
                    ? shiftDay(start, 6).slice(8)
                    : dateLabel(shiftDay(start, 6))}
                </small>
                <p>
                  {
                    data.sessions.filter(
                      (w) => w.day >= start && w.day <= shiftDay(start, 6),
                    ).length
                  }{" "}
                  场
                </p>
              </div>
            );
          })}
        </div>
      </>
    );
  else if (kind === "planGoals")
    content = (
      <>
        <button className="gx-link" onClick={() => edit(kind, month)}>
          调整各计划目标 ›
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
                    <strong>{n}</strong>
                    <span> / {t ?? "–"} 次</span>
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
    const w = data.latest,
      trained = w?.items.filter((i) => i.sets.some((s) => s.done)) ?? [],
      skipped = w?.items.filter((i) => !i.sets.some((s) => s.done)) ?? [];
    content = w ? (
      <>
        <p className="gx-recent-date">
          {Number(w.day.slice(5, 7))} 月 {Number(w.day.slice(8))} 日 ·{" "}
          <strong>{w.name}</strong>
        </p>
        <div className="gx-recent-summary">
          <span>
            <strong>{Math.round((w.finished! - w.started) / 60000)}</strong>{" "}
            分钟
          </span>
          <span>
            <strong>
              {number(
                w.items.reduce(
                  (s, i) =>
                    s + i.sets.reduce((v, x) => v + (x.done ? x.volume : 0), 0),
                  0,
                ),
              )}
            </strong>{" "}
            kg
          </span>
          <span>
            <strong>
              {w.items.reduce(
                (n, i) => n + i.sets.filter((s) => s.done).length,
                0,
              )}
            </strong>{" "}
            个完成组
          </span>
        </div>
        <div className="gx-recent-scroll">
          <div className="gx-recent-columns">
            {[0, 1].map((column) => (
              <div key={column}>
                {trained
                  .filter((_, i) => i % 2 === column)
                  .map((item) => (
                    <RecentExercise
                      key={item.id}
                      item={item}
                      catalog={catalog}
                    />
                  ))}
              </div>
            ))}
          </div>
          {skipped.length > 0 && (
            <div className="gx-recent-untrained">
              <span>未训练</span>
              <div>
                {skipped.map((item) => (
                  <div key={item.id}>
                    <strong>{item.name}</strong>
                    <span
                      className="gx-recent-dots"
                      aria-label={`${item.sets.length} 组未完成`}
                    >
                      {item.sets.map((s) => (
                        <i key={s.id} />
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
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
          <p className="gx-widget-caption">
            {last.name} ·{" "}
            {monthDay(
              previous.day,
              previous.day.slice(0, 4) !== last.day.slice(0, 4),
            )}
            与 {monthDay(last.day)} · kg
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
                    <td>
                      {old.length
                        ? a === b
                          ? "—"
                          : `${a - b > 0 ? "+" : ""}${number(a - b)}`
                        : "–"}
                    </td>
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
        <p className="gx-widget-caption">每格为主练完成组 · 三个完整月份</p>
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
                <td>{r === "腰腹／核心" ? "核心" : r}</td>
                {months.map((m) => (
                  <td key={m}>
                    <span className="gx-cell">{primary(m, r)}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <button className="gx-region-link" onClick={() => setDetail("focus")}>
          看臀腿的三个月 →
        </button>
      </>
    );
  } else {
    const m = shiftMonth(month, -1);
    content = (
      <>
        <p className="gx-widget-caption">
          {Number(m.slice(5))} 月 · 各部位主练完成组
        </p>
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
                <dt>{r === "腰腹／核心" ? "核心" : r}</dt>
                <dd>
                  <strong>{primary(m, r)}</strong> 组
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <button className="gx-region-link" onClick={() => setDetail("body")}>
          展开臀腿 →
        </button>
      </>
    );
  }
  return (
    <article
      className={`gx-card gx-widget gx-widget-${kind}`}
      style={{ width: widgets[kind][1], height: widgets[kind][2] }}
    >
      <h2>
        {kind === "month" || kind === "week" || kind === "planGoals" ? (
          <>
            <span>
              {kind === "week" ? "周" : Number(month.slice(5)) + "月"}
            </span>
            <i />
            {kind === "planGoals" ? "各计划目标" : "训练目标"}
          </>
        ) : (
          widgets[kind][0]
        )}
      </h2>
      {content}
      {detail && (
        <Modal
          title={
            detail === "body" ? "臀腿 · 主练完成组" : "臀腿 · 三个月训练变化"
          }
          close={() => setDetail(null)}
        >
          <table className="gx-region-table">
            <thead>
              <tr>
                <th>肌群</th>
                {(detail === "body"
                  ? [shiftMonth(month, -1)]
                  : [-3, -2, -1].map((i) => shiftMonth(month, i))
                ).map((m) => (
                  <th key={m}>{Number(m.slice(5))} 月</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(taxonomy as Record<string, string[]>)["臀腿"].map((muscle) => (
                <tr key={muscle}>
                  <td>{muscle}</td>
                  {(detail === "body"
                    ? [shiftMonth(month, -1)]
                    : [-3, -2, -1].map((i) => shiftMonth(month, i))
                  ).map((m) => (
                    <td key={m}>
                      {data.muscles
                        .filter((x) => x.month === m && x.muscle === muscle)
                        .reduce((n, x) => n + x.sets, 0)}{" "}
                      组
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
    </article>
  );
});
