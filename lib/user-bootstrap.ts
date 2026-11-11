import { sqlite } from "./db";

export function seedSampleProject(userId: number): number {
  const existing = sqlite.prepare(
    "SELECT id FROM projects WHERE user_id = ? AND name = '人生工作台 V1' LIMIT 1",
  ).get(userId) as { id: number } | undefined;
  if (existing) return existing.id;

  const now = Date.now();
  return sqlite.transaction(() => {
    const projectResult = sqlite.prepare(
      `INSERT INTO projects(
        user_id, name, status, workflow_status, goal, completion_criteria,
        created_at, updated_at
      ) VALUES (?, '人生工作台 V1', 'active', 'active', ?, ?, ?, ?)`,
    ).run(
      userId,
      "做出一个真正可以自己使用的人生工作台。",
      "V1 软件完成并且自己实际使用。",
      now,
      now,
    );
    const projectId = Number(projectResult.lastInsertRowid);
    const stageTitles = ["产品定义", "功能设计", "视觉设计", "开发", "测试", "发布"];
    const stageIds: number[] = [];
    const insertStage = sqlite.prepare(
      `INSERT INTO project_stages(project_id, title, position, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    stageTitles.forEach((title, position) => {
      const result = insertStage.run(projectId, title, position, position === 0 ? now : null, now, now);
      stageIds.push(Number(result.lastInsertRowid));
    });
    sqlite.prepare("UPDATE projects SET current_stage_id = ? WHERE id = ?").run(stageIds[1], projectId);

    const insertTask = sqlite.prepare(
      `INSERT INTO project_stage_tasks(stage_id, title, position, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    ["明确产品目标", "整理功能范围", "完成技术方案"].forEach((title, position) => {
      insertTask.run(stageIds[0], title, position, now, now, now);
    });
    ["确定功能架构", "确定首页功能", "确定项目管理功能", "确定数据结构"].forEach(
      (title, position) => insertTask.run(stageIds[1], title, position, position === 0 ? now : null, now, now),
    );
    ["确定视觉风格", "完成首页视觉稿", "完成项目页视觉稿"].forEach((title, position) => {
      insertTask.run(stageIds[2], title, position, null, now, now);
    });

    const insertRecurring = sqlite.prepare(
      `INSERT INTO project_stage_recurring_tasks(
        stage_id, title, frequency, frequency_label, position, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    insertRecurring.run(stageIds[1], "每天检查开发进度", "daily", null, 0, now, now);
    insertRecurring.run(stageIds[1], "每天阅读一篇相关资料", "daily", null, 1, now, now);
    return projectId;
  })();
}

export function seedOwnerTimelines(userId: number): void {
  const now = Date.now();
  const insert = sqlite.prepare(
    `INSERT INTO life_timelines(user_id, name, start_date, end_date, created_at, updated_at)
     SELECT ?, ?, ?, ?, ?, ?
     WHERE NOT EXISTS (
       SELECT 1 FROM life_timelines WHERE user_id = ? AND name = ?
     )`,
  );
  const rows = [
    ["读研", "2026-07-02", "2027-06-17"],
    ["暑假", "2026-08-01", "2026-09-05"],
    ["本学期", "2026-09-05", "2027-01-15"],
  ] as const;
  sqlite.transaction(() => {
    for (const [name, start, end] of rows) {
      insert.run(userId, name, start, end, now, now, userId, name);
    }
  })();
}
