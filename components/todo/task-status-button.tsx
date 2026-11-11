"use client";
import { useEffect, useRef } from "react";
import { Check, ChevronRight, Minus } from "lucide-react";
import { statusOf, type TodoEvent, type TaskStatus } from "@/lib/todo/model";
import styles from "./todo.module.css";

export function TaskStatusButton({ event, disabled, onStatus }: { event: TodoEvent; disabled: boolean; onStatus: (status: TaskStatus) => void }) {
  const count = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const status = statusOf(event);
  const change = (clicks: number) => onStatus(clicks >= 3 ? (status === "cancelled" ? "pending" : "cancelled") : clicks === 2 ? (status === "deferred" ? "pending" : "deferred") : status === "deferred" ? "deferred" : status === "completed" ? "pending" : "completed");
  return <button type="button" className={styles.completeButton} disabled={disabled} aria-label={`${event.title}：${{pending:"待办",completed:"已完成",cancelled:"已取消",deferred:"已推迟"}[status]}`} title="单击完成，双击切换推迟，三击切换取消" onClick={(e) => {
    if (e.detail === 0) { change(1); return; }
    count.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { change(count.current); count.current = 0; }, 420);
  }}>{status === "completed" ? <Check size={16} /> : status === "cancelled" ? <Minus size={14} /> : status === "deferred" ? <ChevronRight size={16} /> : null}</button>;
}
