"use client";

import {
  BriefcaseBusiness,
  ChevronDown,
  ChevronUp,
  Clock3,
  Gamepad2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  createManualSessionAction,
  deleteSessionAction,
  startSessionAction,
  stopSessionAction,
  updateSessionAction,
} from "@/app/actions";
import { Card, CardHeader } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { InlineFeedback, useMutation } from "@/components/ui/use-mutation";
import {
  epochToLocalInput,
  formatClock,
  formatDuration,
  formatRemainingDuration,
} from "@/lib/life-date";
import type { SessionItem, SessionKind } from "@/lib/types";

function useLiveNow(enabled: boolean) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 1000);
    window.addEventListener("focus", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, [enabled]);
  return now;
}

function SessionForm({
  kind,
  initial,
  defaults,
  pending,
  onSubmit,
  onCancel,
}: {
  kind: SessionKind;
  initial?: SessionItem;
  defaults?: { startedAt: string; endedAt: string };
  pending: boolean;
  onSubmit: (input: { startedAt: string; endedAt: string; note: string }) => void;
  onCancel: () => void;
}) {
  const [startedAt, setStartedAt] = useState(
    initial ? epochToLocalInput(initial.startedAt) : defaults?.startedAt ?? "",
  );
  const [endedAt, setEndedAt] = useState(
    initial?.endedAt ? epochToLocalInput(initial.endedAt) : defaults?.endedAt ?? "",
  );
  const [note, setNote] = useState(initial?.note ?? "");
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ startedAt, endedAt, note });
      }}
    >
      <label className="field-label">
        <span>开始时间</span>
        <input type="datetime-local" required value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
      </label>
      <label className="field-label">
        <span>结束时间</span>
        <input type="datetime-local" required value={endedAt} onChange={(e) => setEndedAt(e.target.value)} />
      </label>
      {kind === "work" ? (
        <label className="field-label">
          <span>做了什么（可选）</span>
          <input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：整理论文文献" />
        </label>
      ) : null}
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>取消</button>
        <button type="submit" className="primary-button" disabled={pending}>保存记录</button>
      </div>
    </form>
  );
}

export function TimerCard({
  kind,
  recordDate,
  sessions,
  activeSession,
  targetMinutes,
  compact = false,
  variant = "default",
}: {
  kind: SessionKind;
  recordDate: string;
  sessions: SessionItem[];
  activeSession: SessionItem | null;
  targetMinutes?: number;
  compact?: boolean;
  variant?: "default" | "hero";
}) {
  const isWork = kind === "work";
  const [expanded, setExpanded] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDefaults, setManualDefaults] = useState({ startedAt: "", endedAt: "" });
  const [switchOpen, setSwitchOpen] = useState(false);
  const [editing, setEditing] = useState<SessionItem | null>(null);
  const [note, setNote] = useState("");
  const mutation = useMutation();
  const activeForKind = activeSession?.kind === kind ? activeSession : null;
  const now = useLiveNow(Boolean(activeForKind));
  const totalSeconds = useMemo(
    () =>
      sessions.reduce((sum, session) => {
        if (session.id === activeForKind?.id) {
          return sum + Math.max(0, ((now ?? session.startedAt) - session.startedAt) / 1000);
        }
        return sum + session.durationSeconds;
      }, 0),
    [sessions, activeForKind?.id, now],
  );
  const targetSeconds = (targetMinutes ?? 0) * 60;
  const gaugeProgress = isWork
    ? targetSeconds > 0 ? Math.min(1, totalSeconds / targetSeconds) : 0
    : Math.min(1, totalSeconds / (24 * 60 * 60));
  const gaugeStyle = { "--gauge-progress": `${gaugeProgress * 75}` } as CSSProperties;

  const begin = async (switchExisting = false) => {
    const result = await mutation.run(() =>
      startSessionAction(kind, note || null, switchExisting),
    );
    if (result.ok) {
      setStartOpen(false);
      setSwitchOpen(false);
      setNote("");
    } else if (result.code === "ACTIVE_SESSION_EXISTS") {
      setStartOpen(false);
      setSwitchOpen(true);
    }
  };

  const primaryAction = async () => {
    if (activeForKind) {
      await mutation.run(() => stopSessionAction(activeForKind.id));
      return;
    }
    if (activeSession) {
      setSwitchOpen(true);
      return;
    }
    if (isWork) setStartOpen(true);
    else await begin();
  };

  const openManualForm = () => {
    const current = Date.now();
    setManualDefaults({
      startedAt: epochToLocalInput(current - 60 * 60 * 1000),
      endedAt: epochToLocalInput(current),
    });
    setManualOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("确定删除这条时间记录吗？")) return;
    await mutation.run(() => deleteSessionAction(id));
  };

  const title = isWork ? "今日工作" : "娱乐";
  const Icon = isWork ? BriefcaseBusiness : Gamepad2;
  const activeIsPreviousDay = activeForKind && activeForKind.recordDate !== recordDate;

  return (
    <>
      <Card className={`${compact ? "timer-card compact-card" : "timer-card"}${variant === "hero" ? ` timer-card-hero timer-card-hero-${kind}` : ""}${isWork && activeForKind ? " is-working" : ""}`}>
        <CardHeader icon={Icon} title={variant === "hero" ? (isWork ? "今日工作" : "今日娱乐") : title} />
        {activeIsPreviousDay ? (
          <div className="warning-banner">
            <Clock3 size={17} />上一生活日的{isWork ? "工作" : "娱乐"}仍在计时，请结束或修正。
          </div>
        ) : null}
        {variant === "hero" ? (
          <div className="focus-work-control">
            <div className="focus-gauge" style={gaugeStyle}>
              <svg aria-hidden viewBox="0 0 240 210">
                <circle className="focus-gauge-track" cx="120" cy="105" r="82" pathLength="100" />
                <circle className="focus-gauge-value" cx="120" cy="105" r="82" pathLength="100" />
              </svg>
              <div className="focus-gauge-value-copy">
                <strong>{formatDuration(totalSeconds)}</strong>
                <span className={isWork && activeForKind ? "work-live-status" : undefined} role="status">
                  {isWork && activeForKind ? <i className="work-live-dot" aria-hidden /> : null}
                  {activeForKind ? (isWork ? "专注工作中" : "娱乐计时中") : (isWork ? "今日已完成" : "今日累计")}
                </span>
              </div>
              <div className="focus-gauge-target">
                <span>{isWork ? `今日目标 ${formatDuration(targetSeconds)}` : "今日娱乐记录"}</span>
                <i />
                <span>{isWork ? `完成 ${Math.round(gaugeProgress * 100)}%` : "24h 时间刻度"}</span>
              </div>
            </div>
            <div className="focus-work-actions">
              <button className="primary-button timer-button" disabled={mutation.pending} onClick={primaryAction}>
                {activeForKind ? `结束${isWork ? "工作" : "娱乐"}` : `开始${isWork ? "工作" : "娱乐"}`}
              </button>
            </div>
          </div>
        ) : (
        <div className="timer-main">
          <div>
            <p className="eyebrow">{isWork ? "今日工作" : "今日娱乐"}</p>
            <div className="timer-total">
              {formatDuration(totalSeconds)}
              {isWork && targetMinutes !== undefined ? (
                <span>/ {formatDuration(targetSeconds)}</span>
              ) : null}
            </div>
            {isWork ? (
              <p className="timer-difference">
                {totalSeconds < targetSeconds
                  ? <>还差 <strong>{formatRemainingDuration(targetSeconds - totalSeconds)}</strong></>
                  : totalSeconds === targetSeconds
                    ? "今日目标已完成"
                    : <>已超过 <strong>{formatDuration(totalSeconds - targetSeconds)}</strong></>}
              </p>
            ) : null}
          </div>
          <div className="timer-controls">
            <div className="timer-status">
              {activeForKind ? (
                <><strong>进行中</strong><span>开始时间 {formatClock(activeForKind.startedAt)}</span></>
              ) : (
                <><strong>未开始</strong><span>随时可以开始</span></>
              )}
            </div>
            <button className="primary-button timer-button" disabled={mutation.pending} onClick={primaryAction}>
              {activeForKind ? `结束${isWork ? "工作" : "娱乐"}` : `开始${isWork ? "工作" : "娱乐"}`}
            </button>
          </div>
        </div>
        )}
        <InlineFeedback error={mutation.error} notice={mutation.notice} />
        <div className="timer-footer">
          <button className="disclosure-button" onClick={() => setExpanded((value) => !value)}>
            <span>查看今日{isWork ? "工作" : "娱乐"}记录</span>
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          <button className="text-button add-record" onClick={openManualForm}>
            <Plus size={15} />补录
          </button>
        </div>
        {expanded ? (
          <div className="session-list">
            {sessions.length === 0 ? <p className="empty-line">今天还没有记录</p> : sessions.map((session) => (
              <div className="session-row" key={session.id}>
                <div>
                  <strong>{formatClock(session.startedAt)}–{session.endedAt ? formatClock(session.endedAt) : "现在"}</strong>
                  <span>{session.endedAt ? formatDuration(session.durationSeconds) : "计时中"}</span>
                  {isWork ? <p>{session.note || "未填写"}</p> : null}
                </div>
                <div className="row-actions">
                  <button className="icon-button" aria-label="编辑记录" onClick={() => setEditing(session)}><Pencil size={16} /></button>
                  <button className="icon-button danger" aria-label="删除记录" onClick={() => handleDelete(session.id)}><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      <Modal open={startOpen} onClose={() => setStartOpen(false)} title="开始工作" description="内容可以不填，计时仍会正常记录。" size="small">
        <label className="field-label"><span>现在准备做什么？</span><input autoFocus maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：写论文" /></label>
        <InlineFeedback error={mutation.error} />
        <div className="modal-actions"><button className="secondary-button" onClick={() => setStartOpen(false)}>取消</button><button className="primary-button" disabled={mutation.pending} onClick={() => begin()}>直接开始</button></div>
      </Modal>

      <Modal open={switchOpen} onClose={() => setSwitchOpen(false)} title={`切换到${isWork ? "工作" : "娱乐"}？`} description={`${activeSession?.kind === "work" ? "工作" : "娱乐"}仍在计时。确认后会在当前时间结束原计时，并立即开始${isWork ? "工作" : "娱乐"}。`} size="small">
        <InlineFeedback error={mutation.error} />
        <div className="modal-actions"><button className="secondary-button" onClick={() => setSwitchOpen(false)}>继续原计时</button><button className="primary-button" disabled={mutation.pending} onClick={() => begin(true)}>确认切换</button></div>
      </Modal>

      <Modal open={manualOpen} onClose={() => setManualOpen(false)} title={`补录${isWork ? "工作" : "娱乐"}时间`} description="补录会和已有记录检查重叠。" size="small">
        <SessionForm
          kind={kind}
          defaults={manualDefaults}
          pending={mutation.pending}
          onCancel={() => setManualOpen(false)}
          onSubmit={async (input) => {
            const result = await mutation.run(() => createManualSessionAction({ kind, ...input }));
            if (result.ok) setManualOpen(false);
          }}
        />
        <InlineFeedback error={mutation.error} />
      </Modal>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="修正时间记录" description="修改后，生活日会按新的开始时间重新计算。" size="small">
        {editing ? (
          <SessionForm
            kind={editing.kind}
            initial={editing}
            pending={mutation.pending}
            onCancel={() => setEditing(null)}
            onSubmit={async (input) => {
              const result = await mutation.run(() => updateSessionAction({ id: editing.id, ...input }));
              if (result.ok) setEditing(null);
            }}
          />
        ) : null}
        <InlineFeedback error={mutation.error} />
      </Modal>
    </>
  );
}
