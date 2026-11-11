"use client";

import { Armchair, Dumbbell, Footprints, Heart, Pencil } from "lucide-react";
import { useState } from "react";
import { saveBodyAction } from "@/app/actions";
import { Card, CardHeader } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { InlineFeedback, useMutation } from "@/components/ui/use-mutation";
import type { BodyStatus } from "@/lib/types";

const options: Array<{ status: BodyStatus; label: string; icon: typeof Dumbbell }> = [
  { status: "workout", label: "健身", icon: Dumbbell },
  { status: "light_activity", label: "轻运动", icon: Footprints },
  { status: "no_activity", label: "不运动", icon: Armchair },
];

export function BodyCard({
  recordDate,
  status,
  note,
  count,
  target,
}: {
  recordDate: string;
  status: BodyStatus | null;
  note: string | null;
  count: number;
  target: number;
}) {
  const mutation = useMutation();
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteValue, setNoteValue] = useState(note ?? "");

  const choose = (nextStatus: BodyStatus, nextNote = note) =>
    mutation.run(() => saveBodyAction(recordDate, nextStatus, nextNote));

  return (
    <>
      <Card>
        <CardHeader icon={Heart} title="身体状况" action={status && status !== "no_activity" ? <button className="text-button" onClick={() => setNoteOpen(true)}><Pencil size={14} />备注</button> : null} />
        <p className="eyebrow">今天的状态</p>
        <div className="body-options">
          {options.map(({ status: value, label, icon: Icon }) => (
            <button
              key={value}
              className={status === value ? "body-option selected" : "body-option"}
              disabled={mutation.pending}
              onClick={() => choose(value, value === "no_activity" ? null : note)}
            >
              <Icon size={21} strokeWidth={1.8} />{label}
            </button>
          ))}
        </div>
        {note ? <p className="body-note">“{note}”</p> : null}
        <InlineFeedback error={mutation.error} />
        <div className="card-bottom-line"><span>本周健身：{count} / {target} 次</span><span>周一至周日</span></div>
      </Card>
      <Modal open={noteOpen} onClose={() => setNoteOpen(false)} title="运动备注" description="一句话就够了，也可以不填。" size="small">
        <label className="field-label"><span>今天做了什么？</span><input maxLength={100} value={noteValue} onChange={(e) => setNoteValue(e.target.value)} placeholder="例如：散步 40 分钟" /></label>
        <InlineFeedback error={mutation.error} />
        <div className="modal-actions"><button className="secondary-button" onClick={() => setNoteOpen(false)}>取消</button><button className="primary-button" disabled={mutation.pending || !status} onClick={async () => { if (!status) return; const result = await choose(status, noteValue); if (result.ok) setNoteOpen(false); }}>保存</button></div>
      </Modal>
    </>
  );
}
