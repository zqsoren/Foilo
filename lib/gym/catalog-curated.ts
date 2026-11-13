import curated from "./catalog.curated.json";
import seed from "./catalog.seed.json";

const q = (s: string) => "'" + s.replaceAll("'", "''") + "'";
const legacyNames = new Map(seed.map(e=>[e.id,e.name]));
legacyNames.set(103,"宽握拉杆坐姿划船");
legacyNames.set(104,"弹力带单臂斜上推");
legacyNames.set(106,"哑铃硬拉");

// Preserve identifiers used in plans and item foreign keys. The stable four-digit
// source code is separate from both the SQLite key and the user-facing name.
const upserts = curated.map(row => {
  const displayName = row.code === "0383" ? row.name + "（0383）" : row.name;
  const aliases = [legacyNames.get(row.dbId),row.old,row.english,row.code,seed.find(e=>e.id===row.dbId)?.aliases].filter(Boolean).join(" ");
  const args = [row.dbId,q(displayName),q(row.region),q([row.stretchRegion || row.main,...row.also].filter(Boolean).join(" ")),q(row.equipment),q(row.mode),q(aliases),q(row.code),q(row.main),q(row.also.join(" ")),q(row.minor.join(" ")),Number(row.star),q(row.stretch)];
  return `INSERT INTO gym_exercises(id,name,region,muscles,equipment,mode,aliases,source_code,main_muscle,also_muscles,minor_muscles,star,stretch_target)
    VALUES(${args.join(",")}) ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,region=excluded.region,muscles=excluded.muscles,equipment=excluded.equipment,
      mode=excluded.mode,aliases=excluded.aliases,source_code=excluded.source_code,main_muscle=excluded.main_muscle,
      also_muscles=excluded.also_muscles,minor_muscles=excluded.minor_muscles,star=excluded.star,stretch_target=excluded.stretch_target,image_id=NULL,listed=1;`;
});

export const curatedMigration = {
  version: 12, name: "gym_curated_catalog_and_item_notes",
  sql: `
    ALTER TABLE gym_exercises ADD COLUMN source_code TEXT;
    ALTER TABLE gym_exercises ADD COLUMN listed INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE gym_exercises ADD COLUMN main_muscle TEXT NOT NULL DEFAULT '';
    ALTER TABLE gym_exercises ADD COLUMN also_muscles TEXT NOT NULL DEFAULT '';
    ALTER TABLE gym_exercises ADD COLUMN minor_muscles TEXT NOT NULL DEFAULT '';
    ALTER TABLE gym_exercises ADD COLUMN stretch_target TEXT NOT NULL DEFAULT '';
    ALTER TABLE gym_exercises ADD COLUMN star INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE gym_workout_items ADD COLUMN note TEXT NOT NULL DEFAULT '';
    CREATE UNIQUE INDEX gym_external_exercise ON gym_exercises(source_code);
    UPDATE gym_exercises SET listed=0,name='〔旧目录 '||id||'〕'||name WHERE id NOT IN (101,102,105);
    ${upserts.join("\n")}
    UPDATE gym_exercises SET region='肩部',main_muscle='后束',also_muscles='菱形肌 斜方肌中束' WHERE id=101;
    UPDATE gym_exercises SET region='腰腹／核心',main_muscle='腹直肌' WHERE id=102;
    UPDATE gym_exercises SET region='臀腿',main_muscle='臀大肌',also_muscles='腘绳肌' WHERE id=105;
    UPDATE gym_exercises SET muscles=trim(main_muscle||' '||also_muscles) WHERE id IN (101,102,105);
    DELETE FROM gym_exercise_weights WHERE exercise_id IN (SELECT id FROM gym_exercises WHERE listed=1);
    ${[...curated,{dbId:101,main:"后束",also:["菱形肌","斜方肌中束"]},{dbId:102,main:"腹直肌",also:[]},{dbId:105,main:"臀大肌",also:["腘绳肌"]}].flatMap(r=>r.main ? [r.main,...r.also].map((m,i)=>`INSERT INTO gym_exercise_weights VALUES(${r.dbId},${q(m)},${i===0?1:0.5});`) : []).join("\n")}
  `,
} as const;
