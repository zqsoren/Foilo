import catalog from "./catalog.seed.json";
import artwork from "./media.seed.json";

// Only the server migration imports the seed. The application reads the resulting tables.
const quote = (s: string) => "'" + s.replaceAll("'", "''") + "'";
export const gymMigration = {
  version: 8,
  name: "gym_catalog_plans_and_workouts",
  sql: `
    CREATE TABLE gym_media (
      id INTEGER PRIMARY KEY, mime TEXT NOT NULL, content BLOB NOT NULL,
      artist TEXT NOT NULL, source TEXT NOT NULL, license TEXT NOT NULL
    );
    CREATE TABLE gym_exercises (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, region TEXT NOT NULL, muscles TEXT NOT NULL,
      equipment TEXT NOT NULL, mode TEXT NOT NULL CHECK(mode IN ('load','pair','sides','time','body','assist')),
      aliases TEXT NOT NULL DEFAULT '', image_id INTEGER REFERENCES gym_media(id)
    );
    CREATE INDEX gym_exercises_region ON gym_exercises(region,equipment);
    CREATE TABLE gym_plans (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 50), revision INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0, UNIQUE(user_id,id)
    );
    CREATE INDEX gym_plans_owner ON gym_plans(user_id,archived,id);
    CREATE TABLE gym_plan_items (
      plan_id INTEGER NOT NULL REFERENCES gym_plans(id) ON DELETE CASCADE, exercise_id INTEGER NOT NULL REFERENCES gym_exercises(id),
      position INTEGER NOT NULL, sets INTEGER NOT NULL CHECK(sets BETWEEN 1 AND 30),
      PRIMARY KEY(plan_id,exercise_id), UNIQUE(plan_id,position)
    );
    CREATE TABLE gym_workouts (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_id INTEGER NOT NULL, name TEXT NOT NULL, day TEXT NOT NULL, started INTEGER NOT NULL,
      finished INTEGER CHECK(finished IS NULL OR finished>=started), note TEXT NOT NULL DEFAULT '',
      revision INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(user_id,plan_id) REFERENCES gym_plans(user_id,id)
    );
    CREATE UNIQUE INDEX gym_one_active ON gym_workouts(user_id) WHERE finished IS NULL;
    CREATE INDEX gym_diary ON gym_workouts(user_id,day,started) WHERE finished IS NOT NULL;
    CREATE TABLE gym_workout_items (
      id INTEGER PRIMARY KEY, workout_id INTEGER NOT NULL REFERENCES gym_workouts(id) ON DELETE CASCADE,
      exercise_id INTEGER NOT NULL REFERENCES gym_exercises(id), position INTEGER NOT NULL, name TEXT NOT NULL, mode TEXT NOT NULL,
      temporary INTEGER NOT NULL DEFAULT 0, UNIQUE(workout_id,position), UNIQUE(workout_id,exercise_id)
    );
    CREATE TABLE gym_sets (
      id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL REFERENCES gym_workout_items(id) ON DELETE CASCADE, position INTEGER NOT NULL,
      kg REAL NOT NULL DEFAULT 0 CHECK(kg>=0), reps INTEGER NOT NULL DEFAULT 0 CHECK(reps>=0),
      right_kg REAL NOT NULL DEFAULT 0 CHECK(right_kg>=0), right_reps INTEGER NOT NULL DEFAULT 0 CHECK(right_reps>=0),
      seconds INTEGER NOT NULL DEFAULT 0 CHECK(seconds>=0), done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0,1)),
      volume REAL NOT NULL DEFAULT 0 CHECK(volume>=0), UNIQUE(item_id,position)
    );
    CREATE TABLE gym_requests (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, request_id TEXT NOT NULL, result_id INTEGER,
      created INTEGER NOT NULL, PRIMARY KEY(user_id,request_id)
    );
    ${artwork.map((m) => `INSERT INTO gym_media VALUES (${m.id},'image/webp',X'${Buffer.from(m.bytes, "base64").toString("hex")}',${quote(m.artist)},${quote(m.source)},${quote(m.license)});`).join("\n")}
    ${catalog.map((e) => `INSERT INTO gym_exercises VALUES (${e.id},${[e.name, e.group, e.muscles, e.equipment, e.mode, e.aliases].map(quote).join(",")},${e.image ?? "NULL"});`).join("\n")}
  `,
} as const;
