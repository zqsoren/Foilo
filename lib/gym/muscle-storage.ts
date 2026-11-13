import type Database from "better-sqlite3";
import profiles from "./muscle-profiles.seed.json";
import type { LoadEntry } from "./muscle-load";

// Seed only the scoring roles. An omitted incidental muscle contributes zero.
const values = profiles.flatMap(p => p.main ? [
  [p.main, 1] as const, ...p.also.map(m => [m, 0.5] as const),
].map(([m, w]) => `(${p.id},'${m.replaceAll("'", "''")}',${w})`) : []);

export const muscleLoadMigration = {
  version: 11,
  name: "gym_muscle_load_snapshots",
  sql: `
    CREATE TABLE gym_exercise_weights (
      exercise_id INTEGER NOT NULL REFERENCES gym_exercises(id) ON DELETE CASCADE,
      muscle TEXT NOT NULL, weight REAL NOT NULL CHECK(weight IN (0.5,1)),
      PRIMARY KEY(exercise_id,muscle)
    );
    INSERT INTO gym_exercise_weights VALUES ${values.join(",")};
    CREATE TABLE gym_muscle_history (
      item_id INTEGER NOT NULL REFERENCES gym_workout_items(id) ON DELETE CASCADE,
      muscle TEXT NOT NULL, weight REAL NOT NULL, sets INTEGER NOT NULL CHECK(sets>0),
      PRIMARY KEY(item_id,muscle)
    );
    INSERT INTO gym_muscle_history
      SELECT i.id, m.muscle, m.weight, count(*)
      FROM gym_workout_items i JOIN gym_workouts w ON w.id=i.workout_id
      JOIN gym_sets s ON s.item_id=i.id AND s.done=1
      JOIN gym_exercise_weights m ON m.exercise_id=i.exercise_id
      WHERE w.finished IS NOT NULL GROUP BY i.id,m.muscle;
  `,
} as const;

export function snapshotMuscles(db: Database.Database, workoutId: number) {
  // The caller owns the same transaction as the finish operation.
  db.prepare(`INSERT INTO gym_muscle_history(item_id,muscle,weight,sets)
    SELECT i.id,m.muscle,m.weight,count(*)
    FROM gym_workout_items i JOIN gym_exercise_weights m ON m.exercise_id=i.exercise_id
    JOIN gym_sets s ON s.item_id=i.id AND s.done=1
    WHERE i.workout_id=? GROUP BY i.id,m.muscle`).run(workoutId);
}

export function readMuscleLoad(db: Database.Database, user: number, filter: { id: number } | { start: string; end: string }) {
  const clause = "id" in filter ? "w.id=?" : "w.day BETWEEN ? AND ?";
  const params = "id" in filter ? [filter.id] : [filter.start, filter.end];
  return db.prepare(`SELECT w.id AS workoutId,i.name,h.muscle,h.weight,h.sets
    FROM gym_workouts w JOIN gym_workout_items i ON i.workout_id=w.id
    JOIN gym_muscle_history h ON h.item_id=i.id
    WHERE w.user_id=? AND w.finished IS NOT NULL AND ${clause}
    ORDER BY w.started,i.position,h.muscle`).all(user, ...params) as LoadEntry[];
}
