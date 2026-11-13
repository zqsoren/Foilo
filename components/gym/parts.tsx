"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import type { Exercise, Mode } from "@/lib/gym/model";
import { clockTime } from "@/lib/gym/model";
const titleArtwork = {
  "我的计划": ["plans", 98, 24], "动作库": ["library", 85, 27], "选择计划动作": ["select-plan", 148, 24],
  "添加训练动作": ["select-training", 148, 23], "编辑计划": ["edit-plan", 98, 24], "训练统计": ["stats", 99, 23], "训练日记": ["diary", 98, 23],
} as const;

export function GymTitle({ name }: { name: keyof typeof titleArtwork }) {
  const [file, width, height] = titleArtwork[name];
  return <h1><Image src={"/folio/gym-titles/" + file + ".svg"}
    alt={name} width={width} height={height} unoptimized /></h1>;
}
export function Thumb({ exercise, animated = false }: { exercise?: Exercise; animated?: boolean }) {
  return (
    <span className="gym-thumb">
      {exercise && (exercise.code || exercise.imageId) ? (
        <Image
          unoptimized
          src={exercise.code ? "/folio/gym-visual/" + exercise.code + (animated ? ".gif" : ".jpg") : "/api/gym/images/" + exercise.imageId}
          title={exercise.code ? "© Gym visual — https://gymvisual.com/" : undefined}
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
