"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import type { Exercise, Mode, Values, SetRow } from "@/lib/gym/model";
import { clockTime } from "@/lib/gym/model";
const titleArtwork = {
  "我的计划": ["plans", 98, 24], "动作库": ["library", 73, 23], "选择计划动作": ["select-plan", 148, 24],
  "添加训练动作": ["select-training", 148, 23], "编辑计划": ["edit-plan", 98, 24], "训练统计": ["stats", 99, 23], "训练日记": ["diary", 98, 23],
} as const;

export function GymTitle({ children }: { children: keyof typeof titleArtwork }) {
  const [file, width, height] = titleArtwork[children];
  return <h1><Image src={"/folio/gym-titles/" + file + ".svg"}
    alt={children} width={width} height={height} unoptimized /></h1>;
}
export function Thumb({ exercise }: { exercise?: Exercise }) {
  return (
    <span className="gym-thumb">
      {exercise?.imageId ? (
        <Image
          unoptimized
          src={"/api/gym/images/" + exercise.imageId}
          alt={exercise.name + "示意"}
          width={56}
          height={56}
          loading="lazy"
        />
      ) : (
        <span aria-label="示意图待补">—</span>
      )}
    </span>
  );
}
export function Sheet({
  title,
  close,
  children,
  message,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  message?: string;
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
      className="gym-sheet"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="sheet-heading">
        <h2>{title}</h2>
        <button onClick={close} aria-label="关闭弹层">
          关闭
        </button>
      </div>
      {children}
      {message && <p role="alert">{message}</p>}
    </dialog>
  );
}
export function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(since);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [since]);
  return <strong className="gym-clock">{clockTime(now - since)}</strong>;
}
export const modeLabels: Record<Mode, string> = {
  load: "总重量 × 次数",
  pair: "单只重量 × 次数 · 双手同步",
  sides: "左右分别记录",
  time: "持续时间 · 秒",
  body: "次数 · 可记额外负重",
  assist: "辅助配重 × 次数",
};
export function SetForm({
  row,
  mode,
  save,
  busy,
}: {
  row: SetRow;
  mode: Mode;
  save: (v: Values, done: boolean) => void;
  busy: boolean;
}) {
  const [values, setValues] = useState<Values>({
    kg: row.kg,
    reps: row.reps,
    rightKg: row.rightKg,
    rightReps: row.rightReps,
    seconds: row.seconds,
  });
  const field = (key: keyof Values, title: string, integer = false) => (
    <label key={key}>
      {title}
      <input
        type="number"
        min="0"
        max={key === "seconds" ? 86400 : 10000}
        step={integer ? "1" : "0.01"}
        inputMode={integer ? "numeric" : "decimal"}
        defaultValue={values[key] || ""}
        placeholder="0"
        onChange={(e) =>
          setValues({ ...values, [key]: Number(e.target.value) })
        }
      />
    </label>
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(values, true);
      }}
    >
      <p className="gym-muted">{modeLabels[mode]}</p>
      <div className="gym-fields">
        {mode === "time" ? (
          field("seconds", "时长（秒）", true)
        ) : (
          <>
            {field(
              "kg",
              mode === "assist"
                ? "辅助重量 kg"
                : mode === "pair"
                  ? "单只重量 kg"
                  : mode === "sides"
                    ? "左侧总负重 kg"
                    : mode === "body"
                      ? "额外负重 kg"
                      : "总重量 kg",
            )}
            {field("reps", mode === "sides" ? "左侧次数" : "实际次数", true)}
            {mode === "sides" && (
              <>
                {field("rightKg", "右侧总负重 kg")}
                {field("rightReps", "右侧次数", true)}
              </>
            )}
          </>
        )}
      </div>
      <div className="gym-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => save(values, false)}
        >
          {row.done ? "撤销完成" : "保存未完成"}
        </button>
        <button className="primary" disabled={busy}>
          完成这一组
        </button>
      </div>
    </form>
  );
}
