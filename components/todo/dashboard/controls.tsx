"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Minus, X } from "lucide-react";
import { statusOf, type TodoEvent, type TaskStatus } from "@/lib/todo/model";
import { shortDate, weekName, monthCells } from "@/lib/todo/dashboard";
import { eventsForDate } from "@/lib/todo/recurrence";
import type { BoardCommand } from "@/app/todo/dashboard/actions";
export type Commit = (cmd: BoardCommand) => Promise<boolean>;
export type Editor =
  | { kind: "new"; date: string }
  | { kind: "time" | "delay"; event: TodoEvent }
  | { kind: "settings" };
export const identity = (e: TodoEvent) => ({
  id: e.id,
  date: e.date,
  occurrenceDate: e.occurrenceDate,
});
export function Pager({
  unit,
  value,
  move,
}: {
  unit: string;
  value: string;
  move: (step: number) => void;
}) {
  return (
    <span className="dg-pager">
      <button aria-label={"上一" + unit} onClick={() => move(-1)}>
        <ChevronLeft />
      </button>
      <span>{value}</span>
      <button aria-label={"下一" + unit} onClick={() => move(1)}>
        <ChevronRight />
      </button>
    </span>
  );
}
export function Switch<T extends string>({
  values,
  value,
  onChange,
}: {
  values: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <span className="dg-switch">
      {values.map((v) => (
        <button key={v} aria-pressed={v === value} onClick={() => onChange(v)}>
          {v}
        </button>
      ))}
    </span>
  );
}
export function Calendar({
  events,
  month,
  selected,
  select,
}: {
  events: TodoEvent[];
  month: string;
  selected: string;
  select: (d: string) => void;
}) {
  return (
    <div className="dg-cal">
      <div className="dg-weekdays">
        {[..."一二三四五六日"].map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <div className="dg-days">
        {monthCells(month).map((day) => {
          if (day.slice(0, 7) !== month.slice(0, 7)) return <span key={day} />;
          const tasks = eventsForDate(events, day);
          return (
            <button
              key={day}
              aria-pressed={day === selected}
              aria-label={day + "，" + tasks.length + "项任务"}
              onClick={() => select(day)}
            >
              <span>{Number(day.slice(-2))}</span>
              <span className="dg-dots">
                {tasks.map((e) => (
                  <i key={e.id} data-done={statusOf(e) === "completed"} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
export function StatusMark({ status }: { status: TaskStatus }) {
  return (
    <span aria-hidden className={"dg-mark " + status}>
      {status === "deferred" ? (
        <ChevronRight />
      ) : status === "cancelled" ? (
        <Minus />
      ) : null}
    </span>
  );
}
function Gesture({
  label,
  children,
  act,
  className,
}: {
  label: string;
  children: ReactNode;
  act: (count: number) => void;
  className?: string;
}) {
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clicks = useRef(0);
  useEffect(() => () => clearTimeout(pending.current), []);
  return (
    <button
      className={className}
      title={label}
      aria-label={label}
      onClick={(e) => {
        clearTimeout(pending.current);
        if (!e.detail) {
          clicks.current = 0;
          act(1);
          return;
        }
        clicks.current++;
        pending.current = setTimeout(() => {
          const n = clicks.current;
          clicks.current = 0;
          act(n);
        }, 340);
      }}
    >
      {children}
    </button>
  );
}
export function TaskControls({
  e,
  mode,
  commit,
  edit,
}: {
  e: TodoEvent;
  mode: "detail" | "todo";
  commit: Commit;
  edit: (v: Editor) => void;
}) {
  const s = statusOf(e);
  const change = (status: TaskStatus) =>
    void commit({ action: "status", ...identity(e), status });
  const purge = () => void commit({ action: "purge", ...identity(e) });
  if (mode === "detail")
    return (
      <Gesture
        label={
          e.title +
          "：单击完成或选推迟日期，双击切换取消和推迟，已取消时三击删除"
        }
        act={(n) => {
          if (n === 3 && s === "cancelled") return purge();
          if (n === 2)
            return change(s === "cancelled" ? "deferred" : "cancelled");
          if (n !== 1) return;
          if (s === "deferred") edit({ kind: "delay", event: e });
          else if (s !== "cancelled")
            change(s === "completed" ? "pending" : "completed");
        }}
      >
        <StatusMark status={s} />
      </Gesture>
    );
  return (
    <span className="dg-todo-actions">
      <Gesture
        label={"推迟：" + e.title + "（双击选日期）"}
        className={"dg-square " + (s === "deferred" ? "on" : "")}
        act={(n) => {
          if (n === 2) edit({ kind: "delay", event: e });
          else if (n === 1) change(s === "deferred" ? "pending" : "deferred");
        }}
      >
        <ChevronRight />
      </Gesture>
      <Gesture
        label={"取消：" + e.title + "（已取消时双击删除）"}
        className={"dg-square " + (s === "cancelled" ? "on" : "")}
        act={(n) => {
          if (n === 2 && s === "cancelled") purge();
          else if (n === 1) change(s === "cancelled" ? "pending" : "cancelled");
        }}
      >
        <Minus />
      </Gesture>
    </span>
  );
}
export function Popup({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dg-popup"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            close();
        }
      }}
    >
      <header>
        <h2>{title}</h2>
        <button aria-label="关闭" onClick={close}>
          <X size={19} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function InlineField({
  value,
  label,
  save,
  multi = false,
}: {
  value: string;
  label: string;
  save: (v: string) => Promise<boolean>;
  multi?: boolean;
}) {
  const [draft, set] = useState(value),
    [active, focus] = useState(false);
  const cancel = useRef(false);
  const props = {
    value: active ? draft : value,
    "aria-label": label,
    placeholder: multi ? "添加备注" : "任务名称",
    maxLength: multi ? 2000 : 160,
    onFocus: () => {
      set(value);
      focus(true);
    },
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      set(e.target.value),
    onBlur: () => {
      focus(false);
      if (!cancel.current && draft !== value) void save(draft);
      cancel.current = false;
    },
    onKeyDown: (
      e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      if (e.nativeEvent.isComposing) return;
      if (e.key === "Escape") {
        cancel.current = true;
        e.currentTarget.blur();
      }
      if (e.key === "Enter" && (!multi || !e.shiftKey)) {
        e.preventDefault();
        e.currentTarget.blur();
      }
    },
  };
  return multi ? <textarea rows={1} {...props} /> : <input {...props} />;
}
export function DayHeading({ day }: { day: string }) {
  return (
    <h3>
      {shortDate(day)}，{weekName(day)}
    </h3>
  );
}
