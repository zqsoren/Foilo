"use client";

import { BriefcaseBusiness, Gamepad2, HeartPulse, MoonStar } from "lucide-react";
import { useState } from "react";
import { saveSleepAction } from "@/app/actions";
import { Modal } from "@/components/ui/modal";
import { InlineFeedback, useMutation } from "@/components/ui/use-mutation";
import { formatDuration, formatRemainingDuration } from "@/lib/life-date";
import type { DashboardData } from "@/lib/types";

const BODY_LABELS = {
  workout: "健身",
  light_activity: "轻运动",
  no_activity: "不运动",
} as const;

export function SummaryStrip({ data }: { data: DashboardData }) {
  const [sleepOpen, setSleepOpen] = useState(false);
  const initial = data.daily.sleepMinutes ?? 0;
  const [hours, setHours] = useState(Math.floor(initial / 60));
  const [minutes, setMinutes] = useState(initial % 60);
  const mutation = useMutation();
  const targetSeconds = data.daily.workTargetMinutes * 60;
  const workDifference = targetSeconds - data.daily.workSeconds;

  const saveSleep = async () => {
    const result = await mutation.run(() =>
      saveSleepAction(data.lifeDate, hours * 60 + minutes),
    );
    if (result.ok) setSleepOpen(false);
  };

  return (
    <>
      <section className="summary-strip" aria-label="今日概览">
        <div className="summary-cell">
          <div className="summary-label"><MoonStar size={19} />睡眠时长</div>
          <strong>{data.daily.sleepMinutes === null ? "—" : formatDuration(data.daily.sleepMinutes * 60)}</strong>
          <button className="text-button" onClick={() => setSleepOpen(true)}>编辑</button>
        </div>
        <div className="summary-cell">
          <div className="summary-label"><BriefcaseBusiness size={19} />今日工作</div>
          <strong>{formatDuration(data.daily.workSeconds)}</strong>
          <p>目标 {formatDuration(targetSeconds)}<span className="divider">|</span>{workDifference > 0 ? `还差 ${formatRemainingDuration(workDifference)}` : workDifference < 0 ? `超过 ${formatDuration(-workDifference)}` : "目标完成"}</p>
        </div>
        <div className="summary-cell">
          <div className="summary-label"><Gamepad2 size={19} />今日娱乐</div>
          <strong>{formatDuration(data.daily.entertainmentSeconds)}</strong>
          <p>{data.activeSession?.kind === "entertainment" ? "正在计时" : "享受，也要被看见"}</p>
        </div>
        <div className="summary-cell">
          <div className="summary-label"><HeartPulse size={19} />身体状态</div>
          <strong className={data.daily.bodyStatus ? "status-chip" : "summary-empty"}>
            {data.daily.bodyStatus ? BODY_LABELS[data.daily.bodyStatus] : "未记录"}
          </strong>
          <p>本周健身 {data.daily.weeklyWorkoutCount} / {data.daily.weeklyWorkoutTarget}</p>
        </div>
      </section>

      <Modal open={sleepOpen} onClose={() => setSleepOpen(false)} title="记录睡眠" description="只记录总时长，不需要填写入睡和起床时间。" size="small">
        <div className="duration-inputs">
          <label><span>小时</span><input type="number" min={0} max={24} value={hours} onChange={(e) => setHours(Math.max(0, Math.min(24, Number(e.target.value))))} /></label>
          <label><span>分钟</span><input type="number" min={0} max={59} value={minutes} onChange={(e) => setMinutes(Math.max(0, Math.min(59, Number(e.target.value))))} /></label>
        </div>
        <InlineFeedback error={mutation.error} />
        <div className="modal-actions">
          <button className="secondary-button" onClick={() => setSleepOpen(false)}>取消</button>
          <button className="primary-button" disabled={mutation.pending || (hours === 24 && minutes > 0)} onClick={saveSleep}>保存</button>
        </div>
      </Modal>
    </>
  );
}
