"use client";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { eventsForDate } from "@/lib/todo/recurrence";
import { addDays } from "@/lib/life-date";
import { productVersions } from "@/lib/product-versions";
import {
  monthLabel,
  monthStart,
  searchTasks,
  taskKey,
  taskTotals,
  type BoardData,
} from "@/lib/todo/dashboard";
import {
  Calendar,
  DayHeading,
  InlineField,
  Pager,
  Popup,
  TaskControls,
  identity,
  type Commit,
  type Editor,
} from "./controls";
import { signOutBoard } from "@/app/todo/dashboard/actions";
import type { TodoEvent } from "@/lib/todo/model";

export function TaskSearch({
  data,
  day,
  choose,
}: {
  data: BoardData;
  day: string;
  choose: (e: TodoEvent) => void;
}) {
  const [query, setQuery] = useState(""),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(0);
  const results = open ? searchTasks(data.events, query, day) : [];
  return (
    <div
      className="dg-search"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <Search size={15} />
      <input
        aria-label="搜索任务名称或备注"
        role="combobox"
        aria-expanded={open && !!query.trim()}
        aria-controls="dg-results"
        aria-activedescendant={
          open && results[active] ? "dg-result-" + active : undefined
        }
        placeholder="搜索任务名称或备注"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Escape") {
            setOpen(false);
            return;
          }
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setActive((a) =>
              Math.min(
                Math.max(0, results.length - 1),
                Math.max(0, a + (e.key === "ArrowDown" ? 1 : -1)),
              ),
            );
          }
          if (e.key === "Enter" && results[active]) {
            choose(results[active]);
            setOpen(false);
          }
        }}
      />
      {open && query.trim() && (
        <div className="dg-results" id="dg-results" role="listbox">
          {results.length ? (
            results.map((e, i) => (
              <button
                id={"dg-result-" + i}
                key={taskKey(e)}
                role="option"
                aria-selected={i === active}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => {
                  choose(e);
                  setOpen(false);
                }}
              >
                <time>{e.date}</time>
                <span>{e.title}</span>
              </button>
            ))
          ) : (
            <p>没有匹配的任务</p>
          )}
        </div>
      )}
    </div>
  );
}
export function AllTasks({
  data,
  today,
  day,
  select,
  highlight,
  commit,
  edit,
}: {
  data: BoardData;
  today: string;
  day: string;
  select: (d: string) => void;
  highlight: string;
  commit: Commit;
  edit: (e: Editor) => void;
}) {
  const counts = taskTotals(data.events, today),
    items = eventsForDate(data.events, day);
  useEffect(() => {
    if (!highlight) return;
    const el = document.getElementById("dg-record-" + highlight);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [day, highlight]);
  return (
    <div className="dg-all">
      <section className="dg-summary" aria-label="任务汇总">
        {[
          ["全部任务", Object.values(counts).reduce((s, n) => s + n, 0)],
          ["已完成", counts.completed],
          ["待完成", counts.pending],
          ["已推迟", counts.deferred],
          ["已取消", counts.cancelled],
        ].map(([k, v]) => (
          <div key={k}>
            <small>{k}</small>
            <strong>{v}</strong>
          </div>
        ))}
      </section>
      <section className="dg-detail">
        <h2>日历与任务</h2>
        <div className="dg-split">
          <div className="dg-month-detail">
            <header>
              <h3 className="dg-pick-month">
                {monthLabel(day)}
                <input
                  aria-label="跳转到月份"
                  type="month"
                  value={day.slice(0, 7)}
                  onChange={(e) => {
                    if (/^\d{4}-\d{2}$/.test(e.target.value))
                      select(e.target.value + "-01");
                  }}
                />
              </h3>
              <Pager
                unit="月"
                value=""
                move={(s) => select(monthStart(day, s))}
              />
            </header>
            <Calendar
              events={data.events}
              month={day}
              selected={day}
              select={select}
            />
          </div>
          <div className="dg-detail-list">
            <DayHeading day={day} />
            {items.length === 0 ? (
              <p className="dg-empty-day">这一天没有任务</p>
            ) : (
              <div className="dg-detail-scroll">
                {items.map((e) => (
                  <article
                    key={taskKey(e)}
                    id={"dg-record-" + taskKey(e)}
                    className={highlight === taskKey(e) ? "dg-highlight" : ""}
                  >
                    <TaskControls
                      e={e}
                      mode="detail"
                      commit={commit}
                      edit={edit}
                    />
                    <div>
                      <InlineField
                        value={e.title}
                        label="任务名称"
                        save={(title) =>
                          commit({
                            action: "edit",
                            ...identity(e),
                            patch: { title },
                          })
                        }
                      />
                      <button
                        className="dg-detail-time"
                        onClick={() => edit({ kind: "time", event: e })}
                      >
                        时间　{e.start ? e.start + " – " + e.end : "待安排"}
                      </button>
                      <label className="dg-inline-note">
                        备注{" "}
                        <InlineField
                          value={e.notes}
                          label="任务备注"
                          multi
                          save={(notes) =>
                            commit({
                              action: "edit",
                              ...identity(e),
                              patch: { notes },
                            })
                          }
                        />
                      </label>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
export function TaskPopup({
  model,
  close,
  commit,
  data,
}: {
  model: Editor;
  close: () => void;
  commit: Commit;
  data: BoardData;
}) {
  const e = "event" in model ? model.event : null;
  const child = e?.deferredTo
    ? data.events.find((v) => v.id === e.deferredTo)
    : null;
  const [date, setDate] = useState(
    model.kind === "new"
      ? model.date
      : model.kind === "delay"
        ? (child?.date ?? addDays(model.event.date, 1))
        : "",
  );
  const [title, setTitle] = useState(""),
    [notes, setNotes] = useState(""),
    [start, setStart] = useState(e?.start ?? ""),
    [end, setEnd] = useState(e?.end ?? "");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const heading = {
    new: "添加任务",
    time: "选择时间",
    delay: "选择推迟日期",
    settings: "设置",
  }[model.kind];
  return (
    <Popup
      title={heading}
      close={() => {
        if (!busy) close();
      }}
    >
      {model.kind === "settings" ? (
        <>
          <div className="dg-settings-body">开发中……</div>
          <div className="dg-modal-actions">
            <small className="dg-settings-version">ToDo {productVersions.todo}</small>
            <form action={signOutBoard}>
              <button>退出登录</button>
            </form>
            <button className="dg-primary" onClick={close}>
              完成
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={async (ev) => {
            ev.preventDefault();
            if (busy) return;
            if (
              model.kind !== "delay" &&
              (!start !== !end || (start && end <= start))
            ) {
              setError("请填写完整的起止时间，结束时间须晚于开始时间");
              return;
            }
            setError("");
            setBusy(true);
            try {
              let ok = false;
              if (model.kind === "new")
                ok = await commit({
                  action: "save",
                  event: {
                    id: crypto.randomUUID(),
                    title,
                    date,
                    notes,
                    start: start || null,
                    end: end || null,
                    completed: false,
                    fixed: false,
                  },
                });
              if (model.kind === "time")
                ok = await commit({
                  action: "edit",
                  ...identity(model.event),
                  patch: { start: start || null, end: end || null },
                });
              if (model.kind === "delay")
                ok = await commit({
                  action: "status",
                  ...identity(model.event),
                  status: "deferred",
                  targetDate: date,
                });
              if (ok) close();
              else setError("保存未完成，请检查页面提示。");
            } finally {
              setBusy(false);
            }
          }}
        >
          {model.kind === "new" && (
            <input
              className="dg-new-title"
              aria-label="任务名称"
              placeholder="任务名称"
              required
              autoFocus
              value={title}
              maxLength={160}
              onChange={(ev) => setTitle(ev.target.value)}
            />
          )}
          {(model.kind === "new" || model.kind === "delay") && (
            <label className="dg-form-field">
              日期
              <input
                type="date"
                required
                min={
                  model.kind === "delay"
                    ? addDays(model.event.date, 1)
                    : undefined
                }
                value={date}
                onChange={(ev) => setDate(ev.target.value)}
              />
            </label>
          )}
          {model.kind !== "delay" && (
            <div className="dg-time-inputs">
              <label>
                开始时间
                <input
                  type="time"
                  value={start}
                  onChange={(ev) => setStart(ev.target.value)}
                />
              </label>
              <span>—</span>
              <label>
                结束时间
                <input
                  type="time"
                  value={end}
                  onChange={(ev) => setEnd(ev.target.value)}
                />
              </label>
            </div>
          )}
          {model.kind === "new" && (
            <textarea
              aria-label="备注"
              placeholder="补充任务说明"
              value={notes}
              maxLength={2000}
              onChange={(ev) => setNotes(ev.target.value)}
            />
          )}
          {error && <p role="alert">{error}</p>}
          <div className="dg-modal-actions">
            <button type="button" onClick={close}>
              取消
            </button>
            <button className="dg-primary" disabled={busy}>
              {model.kind === "new" ? "添加任务" : "保存"}
            </button>
          </div>
        </form>
      )}
    </Popup>
  );
}
