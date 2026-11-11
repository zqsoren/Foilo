"use client";

import { Check, Dumbbell, MoonStar, Pencil } from "lucide-react";
import { useState } from "react";
import { saveSleepAction, toggleWorkoutAction } from "@/app/actions";
import { Modal } from "@/components/ui/modal";
import { InlineFeedback, useMutation } from "@/components/ui/use-mutation";
import { formatDuration } from "@/lib/life-date";
import type { DashboardData } from "@/lib/types";
import { TimerCard } from "./timer-card";

export function FocusOverviewCard({ data }: { data: DashboardData }) {
  const [sleepOpen, setSleepOpen] = useState(false);
  const initialSleep = data.daily.sleepMinutes ?? 0;
  const [hours, setHours] = useState(Math.floor(initialSleep / 60));
  const [minutes, setMinutes] = useState(initialSleep % 60);
  const sleepMutation = useMutation();
  const workoutMutation = useMutation();

  const saveSleep = async () => {
    const result = await sleepMutation.run(() =>
      saveSleepAction(data.lifeDate, hours * 60 + minutes),
    );
    if (result.ok) setSleepOpen(false);
  };
  const workoutDone = data.daily.bodyStatus === "workout";

  return (
    <>
      <section className="focus-overview-card" aria-label="今日计时与状态">
        <div className="focus-overview-work">
          <div className="focus-dual-timers">
            <TimerCard
              kind="work"
              recordDate={data.lifeDate}
              sessions={data.workSessions}
              activeSession={data.activeSession}
              targetMinutes={data.daily.workTargetMinutes}
              variant="hero"
            />
            <TimerCard
              kind="entertainment"
              recordDate={data.lifeDate}
              sessions={data.entertainmentSessions}
              activeSession={data.activeSession}
              variant="hero"
            />
          </div>
        </div>

        <div className="focus-signal-stack" aria-label="今日状态摘要">
          <article className="focus-signal-card">
            <span className="focus-signal-icon"><MoonStar size={22} /></span>
            <div className="focus-signal-copy">
              <span>睡眠时长</span>
              <strong>{data.daily.sleepMinutes === null ? "—" : formatDuration(data.daily.sleepMinutes * 60)}</strong>
              <small>{data.daily.sleepMinutes === null ? "还没有记录" : "今天的睡眠记录"}</small>
            </div>
            <button className="focus-signal-action" onClick={() => setSleepOpen(true)}>
              <Pencil size={14} />编辑
            </button>
          </article>

          <article className="focus-signal-card">
            <span className="focus-signal-icon"><Dumbbell size={22} /></span>
            <div className="focus-signal-copy">
              <span>今日健身</span>
              <strong>{workoutDone ? "已完成" : "未完成"}</strong>
              <small>本周健身 {data.daily.weeklyWorkoutCount} / {data.daily.weeklyWorkoutTarget}</small>
            </div>
            <button
              className={workoutDone ? "focus-workout-check checked" : "focus-workout-check"}
              role="checkbox"
              aria-checked={workoutDone}
              aria-label={workoutDone ? "取消今天的健身记录" : "标记今天已经健身"}
              disabled={workoutMutation.pending}
              onClick={() => workoutMutation.run(() => toggleWorkoutAction(data.lifeDate))}
            >
              <Check size={18} />
            </button>
            <InlineFeedback error={workoutMutation.error} notice={workoutMutation.notice} />
          </article>
        </div>
      </section>

      <Modal open={sleepOpen} onClose={() => setSleepOpen(false)} title="记录睡眠" description="只记录总时长，不需要填写入睡和起床时间。" size="small">
        <div className="duration-inputs">
          <label><span>小时</span><input type="number" min={0} max={24} value={hours} onChange={(event) => setHours(Math.max(0, Math.min(24, Number(event.target.value))))} /></label>
          <label><span>分钟</span><input type="number" min={0} max={59} value={minutes} onChange={(event) => setMinutes(Math.max(0, Math.min(59, Number(event.target.value))))} /></label>
        </div>
        <InlineFeedback error={sleepMutation.error} />
        <div className="modal-actions">
          <button className="secondary-button" onClick={() => setSleepOpen(false)}>取消</button>
          <button className="primary-button" disabled={sleepMutation.pending || (hours === 24 && minutes > 0)} onClick={saveSleep}>保存</button>
        </div>
      </Modal>
    </>
  );
}
