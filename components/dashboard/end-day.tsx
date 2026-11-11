"use client";

import { Check, ChevronLeft, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { closeDayAction } from "@/app/actions";
import { DAILY_STATES, stateLabel } from "./state-picker";
import { InlineFeedback, useMutation } from "@/components/ui/use-mutation";
import { formatDuration } from "@/lib/life-date";
import type { DashboardData } from "@/lib/types";

type Phase = "closed" | "form" | "animating" | "summary";

export function EndDayExperience({ data }: { data: DashboardData }) {
  const [phase, setPhase] = useState<Phase>("closed");
  const [stateCode, setStateCode] = useState<string | null>(data.daily.dailyStateCode);
  const [customState, setCustomState] = useState(data.daily.dailyStateCustom ?? "");
  const [summary, setSummary] = useState(data.daily.daySummary ?? "");
  const mutation = useMutation();
  const workNotes = [...new Set(data.workSessions.map((item) => item.note).filter(Boolean))] as string[];
  const particles = useMemo(() => Array.from({ length: 34 }, (_, index) => index), []);

  useEffect(() => {
    if (phase !== "animating") return;
    const timer = window.setTimeout(() => setPhase("summary"), 2450);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const open = () => {
    if (data.activeSession) {
      mutation.setError("请先结束正在运行的计时，再收下今天。");
      setPhase("form");
      return;
    }
    setPhase(data.daily.closedAt ? "summary" : "form");
  };

  const close = () => {
    setPhase("closed");
    mutation.setError(null);
  };

  const submit = async () => {
    const result = await mutation.run(() =>
      closeDayAction({
        recordDate: data.lifeDate,
        stateCode,
        stateCustom: stateCode === "custom" ? customState : null,
        summary: summary || null,
      }),
    );
    if (result.ok) setPhase("animating");
  };

  return (
    <>
      <button className="primary-button end-day-trigger" onClick={open}>
        {data.daily.closedAt ? "查看今日总结" : "结束今天"}
      </button>
      {phase !== "closed" ? (
        <div className={`end-day-overlay phase-${phase}`} role="dialog" aria-modal="true" aria-label="结束今天">
          {phase === "form" ? (
            <div className="end-day-panel">
              <button className="icon-button end-close" onClick={close} aria-label="关闭"><X /></button>
              <div className="end-day-heading"><Sparkles size={23} /><p>把今天收好</p><h2>今天已经走到这里了。</h2><span>可以留一句话，也可以什么都不写。</span></div>
              <div className="end-preview-grid">
                <div><span>工作</span><strong>{formatDuration(data.daily.workSeconds)}</strong></div>
                <div><span>娱乐</span><strong>{formatDuration(data.daily.entertainmentSeconds)}</strong></div>
                <div><span>身体</span><strong>{data.daily.bodyStatus === "workout" ? "健身" : data.daily.bodyStatus === "light_activity" ? "轻运动" : data.daily.bodyStatus === "no_activity" ? "不运动" : "未记录"}</strong></div>
                <div><span>睡眠</span><strong>{data.daily.sleepMinutes === null ? "未记录" : formatDuration(data.daily.sleepMinutes * 60)}</strong></div>
              </div>
              <div className="end-form-section"><label>今天是什么状态？</label><div className="end-state-options">{DAILY_STATES.map(([value, label]) => <button key={value} className={stateCode === value ? "selected" : ""} onClick={() => setStateCode(value)}>{label}</button>)}<button className={stateCode === "custom" ? "selected" : ""} onClick={() => setStateCode("custom")}>自定义</button></div>{stateCode === "custom" ? <input className="end-custom-input" maxLength={12} value={customState} onChange={(e) => setCustomState(e.target.value)} placeholder="写下你的状态" /> : null}</div>
              <div className="end-form-section"><label htmlFor="day-summary">给今天留一句话</label><textarea id="day-summary" maxLength={1000} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="今天发生了什么？有什么想留给以后的自己？" /></div>
              <InlineFeedback error={mutation.error} />
              <button className="primary-button collect-day" disabled={mutation.pending || (stateCode === "custom" && !customState.trim()) || Boolean(data.activeSession)} onClick={submit}><Sparkles size={18} />收下今天</button>
            </div>
          ) : null}

          {phase === "animating" ? (
            <div className="day-animation" aria-label="正在把今天送入星空">
              <button className="skip-animation" onClick={() => setPhase("summary")}>跳过动画</button>
              <div className="animation-date">{data.lifeDate.slice(5).replace("-", ".")}</div>
              <div className="orbit-ring" />
              {particles.map((index) => <i key={index} style={{ "--i": index } as React.CSSProperties} />)}
              <p>收下今天，明天继续出发</p>
            </div>
          ) : null}

          {phase === "summary" ? (
            <div className="day-summary-card">
              <button className="icon-button end-close" onClick={close} aria-label="关闭"><X /></button>
              <div className="summary-mark"><Check size={26} /></div>
              <p className="summary-date">{data.lifeDate}</p>
              <h2>今天已经成为你的一部分。</h2>
              <p className="summary-state">{stateLabel(stateCode, customState)}</p>
              <div className="summary-numbers"><div><strong>{formatDuration(data.daily.workSeconds)}</strong><span>工作</span></div><div><strong>{formatDuration(data.daily.entertainmentSeconds)}</strong><span>娱乐</span></div><div><strong>{data.daily.sleepMinutes === null ? "未记录" : formatDuration(data.daily.sleepMinutes * 60)}</strong><span>睡眠</span></div></div>
              {workNotes.length ? <div className="summary-section"><span>今天推进了</span><p>{workNotes.join("、")}</p></div> : null}
              {summary ? <blockquote>{summary}</blockquote> : null}
              <div className="summary-actions"><button className="secondary-button" onClick={() => setPhase("form")}><ChevronLeft size={16} />修改总结</button><button className="primary-button" onClick={() => setPhase("animating")}><Sparkles size={16} />重播星空</button></div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

