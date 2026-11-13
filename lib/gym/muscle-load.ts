export type LoadEntry = {
  workoutId: number;
  name: string;
  muscle: string;
  weight: number;
  sets: number;
};

export function summarizeLoad(entries: LoadEntry[]) {
  const totals = new Map<string, { sets: number; workouts: Set<number>; sources: Map<string, number> }>();
  for (const entry of entries) {
    const amount = entry.sets * entry.weight;
    if (amount <= 0) continue;
    const total = totals.get(entry.muscle) ?? { sets: 0, workouts: new Set<number>(), sources: new Map<string, number>() };
    total.sets += amount;
    total.workouts.add(entry.workoutId);
    total.sources.set(entry.name, (total.sources.get(entry.name) ?? 0) + amount);
    totals.set(entry.muscle, total);
  }
  return totals;
}

/** Bins are fixed within a reporting period; adjacent weeks/months stay comparable. */
export function loadColor(sets: number, period: "session" | "week" | "month") {
  if (sets <= 0) return "#e1e3e3";
  const thresholds = period === "session" ? [1, 2, 4] : period === "week" ? [3, 6, 12] : [12, 24, 48];
  return ["#fbd7b7", "#f49c70", "#d95b45", "#942f37"][thresholds.filter(value => sets >= value).length];
}
