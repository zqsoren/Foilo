"use client";

import { Circle, ChevronDown } from "lucide-react";
import { useState } from "react";
import { saveDailyStateAction } from "@/app/actions";
import { Modal } from "@/components/ui/modal";
import { InlineFeedback, useMutation } from "@/components/ui/use-mutation";

export const DAILY_STATES = [
  ["great", "节奏很好"],
  ["steady", "平稳推进"],
  ["happy", "今天很开心"],
  ["relaxed", "放松一天"],
  ["tired", "有点疲惫"],
  ["rest", "需要休息"],
] as const;

export function stateLabel(code: string | null, custom: string | null): string {
  if (code === "custom") return custom || "自定义状态";
  return DAILY_STATES.find(([value]) => value === code)?.[1] ?? "选择今日状态";
}

export function StatePicker({
  recordDate,
  code,
  custom,
}: {
  recordDate: string;
  code: string | null;
  custom: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [customValue, setCustomValue] = useState(custom ?? "");
  const mutation = useMutation();

  const select = async (value: string | null, customText: string | null = null) => {
    const result = await mutation.run(() =>
      saveDailyStateAction(recordDate, value, customText),
    );
    if (result.ok) setOpen(false);
  };

  return (
    <>
      <button className="state-trigger" onClick={() => setOpen(true)}>
        <Circle size={9} fill="currentColor" strokeWidth={0} />
        <span>{stateLabel(code, custom)}</span>
        <ChevronDown size={14} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="今天是什么状态？" size="small">
        <div className="state-grid">
          {DAILY_STATES.map(([value, label]) => (
            <button
              key={value}
              className={code === value ? "state-option selected" : "state-option"}
              disabled={mutation.pending}
              onClick={() => select(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="custom-state-row">
          <input
            value={customValue}
            maxLength={12}
            placeholder="或者写一个自己的状态"
            onChange={(event) => setCustomValue(event.target.value)}
          />
          <button
            className="secondary-button"
            disabled={mutation.pending || !customValue.trim()}
            onClick={() => select("custom", customValue)}
          >
            使用
          </button>
        </div>
        <button className="text-button muted" onClick={() => select(null)}>
          清除状态
        </button>
        <InlineFeedback error={mutation.error} />
      </Modal>
    </>
  );
}

