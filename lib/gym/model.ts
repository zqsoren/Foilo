import type { LoadEntry } from "./muscle-load";
export type Mode = "load" | "pair" | "sides" | "time" | "body" | "assist";
export type Exercise = {
  id: number;
  name: string;
  region: string;
  muscles: string;
  equipment: string;
  mode: Mode;
  aliases: string;
  imageId: number | null;
  code: string | null;
  mainMuscle: string;
  alsoMuscles: string;
  minorMuscles: string;
  stretchTarget: string;
  star: number;
};
export type PlanItem = { exerciseId: number; sets: number };
export type Plan = {
  id: number;
  name: string;
  revision: number;
  items: PlanItem[];
};
export type Values = {
  kg: number;
  reps: number;
  rightKg: number;
  rightReps: number;
  seconds: number;
};
export type SetRow = Values & { id: number; done: number; volume: number; kind: string; stages: Values[] };
export type WorkoutItem = {
  id: number;
  exerciseId: number;
  name: string;
  mode: Mode;
  temporary: number;
  note: string;
  sets: SetRow[];
};
export type Workout = {
  id: number;
  planId: number;
  name: string;
  day: string;
  started: number;
  finished: number | null;
  revision: number;
  note: string;
  items: WorkoutItem[];
  muscleLoad: LoadEntry[];
};
export type Summary = {
  id: number;
  name: string;
  day: string;
  started: number;
  finished: number;
  volume: number;
  count: number;
};
export type Dashboard = {
  plans: Plan[];
  active: Workout | null;
  history: Summary[];
  muscleLoad: LoadEntry[];
  today: string;
  month: string;
};
export const emptyValues: Values = {
  kg: 0,
  reps: 0,
  rightKg: 0,
  rightReps: 0,
  seconds: 0,
};
export function capacity(mode: Mode, v: Values) {
  if (mode === "time" || mode === "assist") return 0;
  const left = v.kg * v.reps;
  const total =
    mode === "sides"
      ? left + v.rightKg * v.rightReps
      : mode === "pair"
        ? 2 * left
        : left;
  return Math.round(total * 100) / 100;
}
export function setLabel(mode: Mode, v: Values) {
  if (mode === "time") return v.seconds + " 秒";
  if (mode === "sides")
    return (
      "左 " +
      v.kg +
      " kg × " +
      v.reps +
      " / 右 " +
      v.rightKg +
      " kg × " +
      v.rightReps
    );
  if (mode === "body" && !v.kg) return v.reps + " 次";
  const unit =
    mode === "pair"
      ? "单只 "
      : mode === "assist"
        ? "辅助 "
        : mode === "body"
          ? "额外 "
          : "";
  return unit + v.kg + " kg × " + v.reps;
}
export function clockTime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 60), s % 60]
    .map((v) => String(v).padStart(2, "0"))
    .join(":");
}
export function totals(w: Workout) {
  const sets = w.items.flatMap((item) => item.sets);
  return {
    done: sets.filter((s) => s.done).length,
    total: sets.length,
    volume: Math.round(sets.reduce((n, s) => n + s.volume, 0) * 100) / 100,
  };
}
