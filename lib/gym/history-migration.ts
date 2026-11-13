import media from "./history-media.json";

export const historyImportMigration = {
  version: 13,
  name: "gym_history_plans_repeated_items_and_cardio",
  sql: `
    -- The old per-workout exercise UNIQUE constraint is part of the table definition.
    -- Dropping its table cascades to the three child tables. Preserve them and their IDs
    -- inside the same migration transaction, with foreign keys enabled throughout.
    CREATE TEMP TABLE keep_sets AS SELECT * FROM gym_sets;
    CREATE TEMP TABLE keep_stages AS SELECT * FROM gym_set_stages;
    CREATE TEMP TABLE keep_muscles AS SELECT * FROM gym_muscle_history;
    CREATE TABLE gym_items_v13 (
      id INTEGER PRIMARY KEY, workout_id INTEGER NOT NULL REFERENCES gym_workouts(id) ON DELETE CASCADE,
      exercise_id INTEGER NOT NULL REFERENCES gym_exercises(id), position INTEGER NOT NULL,
      name TEXT NOT NULL, mode TEXT NOT NULL, temporary INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '',
      UNIQUE(workout_id,position)
    );
    INSERT INTO gym_items_v13 SELECT id,workout_id,exercise_id,position,name,mode,temporary,note FROM gym_workout_items;
    DROP TABLE gym_workout_items;
    ALTER TABLE gym_items_v13 RENAME TO gym_workout_items;
    INSERT INTO gym_sets SELECT * FROM keep_sets;
    INSERT INTO gym_set_stages SELECT * FROM keep_stages;
    INSERT INTO gym_muscle_history SELECT * FROM keep_muscles;
    DROP TABLE keep_sets;
    DROP TABLE keep_stages;
    DROP TABLE keep_muscles;
    CREATE INDEX gym_item_exercise_history ON gym_workout_items(exercise_id,workout_id);
    ALTER TABLE gym_plans ADD COLUMN import_source TEXT;
    CREATE UNIQUE INDEX gym_import_plan ON gym_plans(user_id,import_source,name) WHERE import_source IS NOT NULL;
    ALTER TABLE gym_workouts ADD COLUMN import_source TEXT;
    ALTER TABLE gym_workouts ADD COLUMN source_id TEXT;
    ALTER TABLE gym_workouts ADD COLUMN source_payload TEXT;
    ALTER TABLE gym_workouts ADD COLUMN heart_rate TEXT;
    CREATE UNIQUE INDEX gym_import_workout ON gym_workouts(user_id,import_source,source_id);
    ALTER TABLE gym_sets ADD COLUMN measure REAL CHECK(measure>=0);
    ALTER TABLE gym_sets ADD COLUMN measure_unit TEXT CHECK(measure_unit IN ('km','层'));
    ALTER TABLE gym_sets ADD COLUMN heart_rate TEXT;
    ALTER TABLE gym_set_stages ADD COLUMN measure REAL CHECK(measure>=0);
    ALTER TABLE gym_set_stages ADD COLUMN measure_unit TEXT CHECK(measure_unit IN ('km','层'));
    UPDATE gym_exercises SET mode='sides' WHERE source_code='0571';
    UPDATE gym_exercises SET mode='load' WHERE source_code IN ('0300','0430');
    UPDATE gym_exercises SET name='平板支撑',listed=1,region='腰腹／核心',muscles='腹横肌 腹直肌',main_muscle='腹横肌',also_muscles='腹直肌' WHERE id=87 AND source_code IS NULL;
    DELETE FROM gym_exercise_weights WHERE exercise_id=87;
    INSERT INTO gym_exercise_weights VALUES (87,'腹横肌',1),(87,'腹直肌',0.5);
    ${media.map((bytes,i)=>`INSERT INTO gym_media VALUES(${41001+i},'image/webp',X'${Buffer.from(bytes,"base64").toString("hex")}','在侧 Folio','generated:folio','AI 生成示意图');`).join("\n")}
    INSERT INTO gym_exercises (id,name,region,muscles,equipment,mode,aliases,image_id,main_muscle,also_muscles)
      VALUES(41001,'面拉','肩部','后束 菱形肌 斜方肌中束','绳索','load','站姿面拉 face pull',41001,'后束','菱形肌 斜方肌中束'),
      (41002,'哈克机反向深蹲','臀腿','臀大肌 股四头肌','哈克机','load','反向哈克深蹲',41002,'臀大肌','股四头肌');
    INSERT INTO gym_exercise_weights VALUES (41001,'后束',1),(41001,'菱形肌',0.5),(41001,'斜方肌中束',0.5),(41002,'臀大肌',1),(41002,'股四头肌',0.5);
  `,
} as const;
