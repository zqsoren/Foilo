"use client";
import { useMemo, useState, type ReactNode } from "react";
import { addDays, weekBounds } from "@/lib/life-date";
import { eventsForDate, weekday } from "@/lib/todo/recurrence";
import { statusOf, type TodoEvent } from "@/lib/todo/model";
import {
  completedByScheduledDay,
  metrics,
  monthLabel,
  monthStart,
  periodBounds,
  shortDate,
  weekName,
  widgets,
  type BoardData,
  type Widget,
  type Period,
} from "@/lib/todo/dashboard";
import {
  Calendar,
  Pager,
  Switch,
  TaskControls,
  StatusMark,
  identity,
  type Commit,
  type Editor,
} from "./controls";
type Props = {
  kind: Widget;
  data: BoardData;
  today: string;
  day: string;
  select: (d: string) => void;
  commit: Commit;
  edit: (v: Editor) => void;
};
function Heading({ name, children }: { name: string; children?: ReactNode }) {
  return (
    <header className="dg-card-head">
      <h2>{name}</h2>
      {children}
    </header>
  );
}
function QuickTodo({
  day,
  items,
  commit,
  edit,
}: {
  day: string;
  items: TodoEvent[];
  commit: Commit;
  edit: (v: Editor) => void;
}) {
  const [title, setTitle] = useState(""),
    [sending, setSending] = useState(false);
  return (
    <div className="dg-todo-list">
      {items.map((e) => {
        const s = statusOf(e);
        return (
          <div key={e.id} className={"dg-todo-row " + s}>
            <button
              aria-label={"完成：" + e.title}
              onClick={() =>
                void commit({
                  action: "status",
                  ...identity(e),
                  status: s === "completed" ? "pending" : "completed",
                })
              }
            >
              <StatusMark
                status={s === "completed" ? "completed" : "pending"}
              />
            </button>
            <span className="dg-task-title" title={e.title}>
              {e.title}
            </span>
            <button
              className="dg-time"
              onClick={() => edit({ kind: "time", event: e })}
            >
              {e.start ? e.start + " – " + e.end : "待安排"}
            </button>
            <TaskControls e={e} mode="todo" commit={commit} edit={edit} />
          </div>
        );
      })}
      <form
        className="dg-quick"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim() || sending) return;
          setSending(true);
          try {
            if (
              await commit({
                action: "save",
                event: {
                  id: crypto.randomUUID(),
                  date: day,
                  title: title.trim(),
                  start: null,
                  end: null,
                  completed: false,
                  fixed: false,
                  notes: "",
                },
              })
            )
              setTitle("");
          } finally {
            setSending(false);
          }
        }}
      >
        <i />
        <input
          aria-label="快速添加任务"
          maxLength={160}
          value={title}
          disabled={sending}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.nativeEvent.isComposing)
              e.preventDefault();
          }}
        />
      </form>
    </div>
  );
}
function Heat({
  data,
  today,
  select,
}: {
  data: BoardData;
  today: string;
  select: (d: string) => void;
}) {
  const [period, setPeriod] = useState<"年" | "月">("年"),
    [cursor, setCursor] = useState(today),
    [expanded, setExpanded] = useState(false);
  const year = Number(cursor.slice(0, 4)),
    firstYear = data.events.reduce(
      (y, e) => Math.min(y, Number(e.date.slice(0, 4))),
      Number(today.slice(0, 4)) - 3,
    );
  const byDay = useMemo(() => completedByScheduledDay(data.events), [data.events]);
  const annual = period === "年",
    first = annual ? year + "-01-01" : monthStart(cursor),
    end = annual ? year + 1 + "-01-01" : monthStart(cursor, 1);
  const cells: ReactNode[] = [];
  const offset = (weekday(first) + 6) % 7;
  for (let i = 0; i < offset; i++) cells.push(<i key={i} />);
  for (let d = first; d < end; d = addDays(d, 1)) {
    const date = d,
      count = byDay.get(d) ?? 0;
    cells.push(
      <button
        key={d}
        data-level={Math.min(count, 4)}
        title={d + " · 完成 " + count + " 项"}
        aria-label={d + "，完成" + count + "项"}
        onClick={() => select(date)}
      />,
    );
  }
  return (
    <>
      <Heading name="活跃热力图">
        <Switch
          values={["年", "月"] as const}
          value={period}
          onChange={(v) => {
            setPeriod(v);
            setExpanded(false);
          }}
        />
      </Heading>
      <div className="dg-heat-date">
        {annual ? (
          <>
            <button
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {year} ▸
            </button>
            {expanded && (
              <div className="dg-years">
                {Array.from(
                  { length: Number(today.slice(0, 4)) - firstYear + 1 },
                  (_, i) => Number(today.slice(0, 4)) - i,
                ).map((y) => (
                  <button
                    key={y}
                    aria-pressed={y === year}
                    onClick={() => {
                      setCursor(y + "-01-01");
                      setExpanded(false);
                    }}
                  >
                    {y}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <Pager
            unit="月"
            value={monthLabel(cursor)}
            move={(s) => setCursor(monthStart(cursor, s))}
          />
        )}
      </div>
      <div className={"dg-heat " + (annual ? "annual" : "monthly")}>
        {cells}
      </div>
    </>
  );
}
function Trend({
  data,
  today,
  period,
}: {
  data: BoardData;
  today: string;
  period: Period;
}) {
  const buckets = useMemo(() => {
    const { start, end } = periodBounds(today, period),
      list = [];
    for (let day = start; day < end; ) {
      const next = period === "年" ? monthStart(day, 1) : addDays(day, 1);
      list.push({
        label:
          period === "年"
            ? Number(day.slice(5, 7)) + "月"
            : period === "周"
              ? "周" + "日一二三四五六"[weekday(day)]
              : String(Number(day.slice(-2))),
        ...metrics(data.events, data.activity, day, next),
      });
      day = next;
    }
    return list;
  }, [data, period, today]);
  const max = Math.max(4, ...buckets.flatMap((b) => [b.total, b.completed]));
  const top = Math.ceil(max / 4) * 4,
    x = (i: number) => 42 + (i * 501) / Math.max(1, buckets.length - 1),
    y = (v: number) => 234 - (v / top) * 211;
  return (
    <>
      <div className="dg-legend">
        <span>● 任务量</span>
        <span>● 完成量</span>
      </div>
      <svg
        className="dg-trend"
        viewBox="0 0 560 280"
        role="img"
        aria-label="本周期计划任务量与实际完成量折线图"
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line
              x1="42"
              x2="545"
              y1={y((top * i) / 4)}
              y2={y((top * i) / 4)}
              stroke="#ededeb"
            />
            <text x="26" y={y((top * i) / 4) + 4} textAnchor="end">
              {(top * i) / 4}
            </text>
          </g>
        ))}
        {(["total", "completed"] as const).map((key, j) => (
          <g key={key} fill={j ? "#242424" : "#c6c8cb"}>
            <polyline
              fill="none"
              stroke={j ? "#242424" : "#c6c8cb"}
              strokeWidth="2.4"
              points={buckets.map((b, i) => x(i) + "," + y(b[key])).join(" ")}
            />
            {buckets.map((b, i) => (
              <circle key={i} cx={x(i)} cy={y(b[key])} r="3.5">
                <title>
                  {b.label + " · " + (j ? "完成" : "任务") + " " + b[key]}
                </title>
              </circle>
            ))}
          </g>
        ))}
        {buckets.map(
          (b, i) =>
            (period !== "月" || i % 5 === 0) && (
              <text key={i} x={x(i)} y="266" textAnchor="middle">
                {b.label}
              </text>
            ),
        )}
      </svg>
    </>
  );
}
export function WidgetFace({
  kind,
  data,
  today,
  day,
  select,
  commit,
  edit,
}: Props) {
  const [period, setPeriod] = useState<Period>(kind === "trend" ? "周" : "年"),
    [cursor, setCursor] = useState(day);
  const name = widgets[kind][0],
    at = kind === "today" ? today : day;
  const items = useMemo(
    () => eventsForDate(data.events, at),
    [data.events, at],
  );
  let body: ReactNode;
  if (kind === "today") {
    const done = items.filter((e) => statusOf(e) === "completed").length;
    body = (
      <div className="dg-today">
        <Heading name={today.replaceAll("-", ".")}>
          <span>{weekName(today)}</span>
        </Heading>
        <div className="dg-kpis">
          <div>
            <small>今日任务</small>
            <strong>{items.length}</strong>
          </div>
          <div>
            <small>已完成</small>
            <strong>{done}</strong>
          </div>
        </div>
      </div>
    );
  } else if (kind === "todo") {
    body = (
      <>
        <Heading name="TODO">
          <Pager
            unit="天"
            value={shortDate(day)}
            move={(s) => select(addDays(day, s))}
          />
        </Heading>
        <QuickTodo day={day} items={items} commit={commit} edit={edit} />
      </>
    );
  } else if (kind === "calendar") {
    body = (
      <>
        <Heading name="月历">
          <Pager
            unit="月"
            value={monthLabel(day)}
            move={(s) => select(monthStart(day, s))}
          />
        </Heading>
        <Calendar
          events={data.events}
          month={day}
          selected={day}
          select={select}
        />
      </>
    );
  } else if (kind === "heat") {
    body = <Heat data={data} today={today} select={select} />;
  } else if (kind === "week") {
    const start = weekBounds(cursor).start;
    body = (
      <>
        <Heading name={name}>
          <Pager
            unit="周"
            value={shortDate(start) + " – " + shortDate(addDays(start, 6))}
            move={(s) => setCursor(addDays(start, s * 7))}
          />
        </Heading>
        <div className="dg-week">
          {Array.from({ length: 7 }, (_, i) => {
            const d = addDays(start, i);
            return (
              <section key={d} data-today={d === today}>
                <small>
                  {"周一 周二 周三 周四 周五 周六 周日".split(" ")[i]}{" "}
                  {d.slice(-2)}
                </small>
                {eventsForDate(data.events, d).map((e) => (
                  <div title={e.title} key={e.id}>
                    <StatusMark status={statusOf(e)} />
                    <span>{e.title}</span>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      </>
    );
  } else {
    const controls = (
      <Switch
        values={kind === "trend" ? ["年", "月", "周"] : ["年", "月"]}
        value={period}
        onChange={setPeriod}
      />
    );
    const bounds = periodBounds(today, period);
    const m = metrics(data.events, data.activity, bounds.start, bounds.end);
    if (kind === "trend")
      body = (
        <>
          <Heading name={name}>{controls}</Heading>
          <Trend data={data} period={period} today={today} />
        </>
      );
    else if (kind === "rates") {
      const percent = (n: number) =>
        m.total ? Math.round((n / m.total) * 100) + "%" : "—";
      body = (
        <>
          <Heading name={name}>{controls}</Heading>
          <div className="dg-rates">
            {[
              [percent(m.deferred), "推迟率"],
              [percent(m.cancelled), "取消率"],
            ].map(([v, k]) => (
              <div key={k} title={"本期计划 " + m.total + " 项"}>
                <strong>{v}</strong>
                <small>{k}</small>
              </div>
            ))}
          </div>
        </>
      );
    } else {
      const ranks = [...m.delays].sort((a, b) => b[1] - a[1]).slice(0, 5);
      body = (
        <>
          <Heading name={name}>{controls}</Heading>
          <ol className="dg-ranks">
            {ranks.map(([root, n]) => {
              const e =
                data.events.find((e) => e.id === root) ??
                data.events.find((e) => e.origin?.rootTaskId === root);
              return (
                <li key={root}>
                  <span>{e?.title ?? "历史任务"}</span>
                  <small>{n} 次</small>
                </li>
              );
            })}
          </ol>
          {!ranks.length && <p className="dg-empty">本期没有推迟记录</p>}
        </>
      );
    }
  }
  return (
    <article
      className={"dg-widget dg-w-" + kind}
      style={{ width: widgets[kind][1], height: widgets[kind][2] }}
    >
      {body}
    </article>
  );
}
