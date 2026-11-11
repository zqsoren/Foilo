import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrations } from "../lib/db/migrations";

describe("计时数据库约束", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(migrations[0].sql);
  });

  afterEach(() => db.close());

  const insert = (kind: "work" | "entertainment", start: number, end: number | null) =>
    db.prepare(
      `INSERT INTO time_sessions(
        kind, record_date, started_at, ended_at, source,
        is_manually_edited, created_at, updated_at
      ) VALUES (?, '2026-08-21', ?, ?, 'manual', 0, 1, 1)`,
    ).run(kind, start, end);

  it("允许首尾相接的工作和娱乐记录", () => {
    expect(() => insert("work", 100, 200)).not.toThrow();
    expect(() => insert("entertainment", 200, 300)).not.toThrow();
  });

  it("拒绝任意种类之间的时间重叠", () => {
    insert("work", 100, 300);
    expect(() => insert("entertainment", 200, 400)).toThrow(/SESSION_OVERLAP/);
  });

  it("全局只允许一个未结束计时", () => {
    insert("work", 100, null);
    expect(() => insert("entertainment", 200, null)).toThrow();
  });
});

describe("项目阶段数据库约束", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(migrations[0].sql);
    db.exec(migrations[1].sql);
  });

  afterEach(() => db.close());

  function createProjectAndStage() {
    const project = db
      .prepare(
        `INSERT INTO projects(name, status, created_at, updated_at)
         VALUES ('测试项目', 'active', 1, 1)`,
      )
      .run();
    const projectId = Number(project.lastInsertRowid);
    const stage = db
      .prepare(
        `INSERT INTO project_stages(project_id, title, position, created_at, updated_at)
         VALUES (?, '阶段一', 0, 1, 1)`,
      )
      .run(projectId);
    return { projectId, stageId: Number(stage.lastInsertRowid) };
  }

  it("同一个项目的阶段顺序不能重复", () => {
    const { projectId } = createProjectAndStage();
    expect(() =>
      db
        .prepare(
          `INSERT INTO project_stages(project_id, title, position, created_at, updated_at)
           VALUES (?, '重复阶段', 0, 1, 1)`,
        )
        .run(projectId),
    ).toThrow();
  });

  it("删除阶段会同步删除一次性任务和阶段周期任务", () => {
    const { stageId } = createProjectAndStage();
    db.prepare(
      `INSERT INTO project_stage_tasks(stage_id, title, position, created_at, updated_at)
       VALUES (?, '一次性任务', 0, 1, 1)`,
    ).run(stageId);
    db.prepare(
      `INSERT INTO project_stage_recurring_tasks(
        stage_id, title, frequency, position, created_at, updated_at
      ) VALUES (?, '每日任务', 'daily', 0, 1, 1)`,
    ).run(stageId);

    db.prepare("DELETE FROM project_stages WHERE id = ?").run(stageId);

    expect((db.prepare("SELECT count(*) AS count FROM project_stage_tasks").get() as { count: number }).count).toBe(0);
    expect((db.prepare("SELECT count(*) AS count FROM project_stage_recurring_tasks").get() as { count: number }).count).toBe(0);
  });

  it("同一阶段周期任务每天只能产生一条完成记录", () => {
    const { stageId } = createProjectAndStage();
    const recurring = db.prepare(
      `INSERT INTO project_stage_recurring_tasks(
        stage_id, title, frequency, position, created_at, updated_at
      ) VALUES (?, '每日任务', 'daily', 0, 1, 1)`,
    ).run(stageId);
    const recurringId = Number(recurring.lastInsertRowid);
    const insert = () => db.prepare(
      `INSERT INTO project_stage_recurring_checkins(
        recurring_task_id, record_date, completed_at, created_at
      ) VALUES (?, '2026-08-27', 1, 1)`,
    ).run(recurringId);

    expect(insert).not.toThrow();
    expect(insert).toThrow();
  });
});

describe("AI 项目管理数据库约束", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    for (const migration of migrations) db.exec(migration.sql);
  });

  afterEach(() => db.close());

  function createPlanningProject() {
    const result = db.prepare(
      `INSERT INTO projects(name, status, workflow_status, created_at, updated_at)
       VALUES ('AI 测试项目', 'active', 'planning', 1, 1)`,
    ).run();
    return Number(result.lastInsertRowid);
  }

  it("新项目支持规划中、进行中和已完成三种工作流状态", () => {
    const projectId = createPlanningProject();
    expect((db.prepare("SELECT workflow_status AS status FROM projects WHERE id = ?").get(projectId) as { status: string }).status).toBe("planning");
    db.prepare("UPDATE projects SET workflow_status = 'active' WHERE id = ?").run(projectId);
    db.prepare("UPDATE projects SET workflow_status = 'completed' WHERE id = ?").run(projectId);
    expect(() => db.prepare("UPDATE projects SET workflow_status = 'unknown' WHERE id = ?").run(projectId)).toThrow();
  });

  it("每个项目可以永久保存多段独立对话", () => {
    const projectId = createPlanningProject();
    const addConversation = db.prepare(
      `INSERT INTO project_ai_conversations(project_id, title, created_at, updated_at)
       VALUES (?, ?, 1, 1)`,
    );
    const first = Number(addConversation.run(projectId, "对话 1").lastInsertRowid);
    const second = Number(addConversation.run(projectId, "对话 2").lastInsertRowid);
    db.prepare(
      `INSERT INTO project_ai_messages(conversation_id, role, content, created_at)
       VALUES (?, 'user', '第一段对话', 1), (?, 'user', '第二段对话', 2)`,
    ).run(first, second);
    expect((db.prepare("SELECT count(*) AS count FROM project_ai_conversations WHERE project_id = ?").get(projectId) as { count: number }).count).toBe(2);
    expect((db.prepare("SELECT count(*) AS count FROM project_ai_messages").get() as { count: number }).count).toBe(2);
  });

  it("同一个项目只保留一次处于可撤销状态的 AI 修改", () => {
    const projectId = createPlanningProject();
    const add = db.prepare(
      `INSERT INTO project_ai_change_sets(
         project_id, change_kind, status, title, operations_json, created_at
       ) VALUES (?, 'ordinary', 'applied', ?, '[]', 1)`,
    );
    expect(() => add.run(projectId, "第一次修改")).not.toThrow();
    expect(() => add.run(projectId, "第二次修改")).toThrow();
    db.prepare("UPDATE project_ai_change_sets SET status = 'superseded' WHERE project_id = ?").run(projectId);
    expect(() => add.run(projectId, "第二次修改")).not.toThrow();
  });

  it("每个进行中项目每周只能有一条周检记录", () => {
    const projectId = createPlanningProject();
    const insert = () => db.prepare(
      `INSERT INTO project_weekly_checks(
         project_id, week_key, scheduled_at, status, created_at
       ) VALUES (?, '2026-08-24', 1, 'pending', 1)`,
    ).run(projectId);
    expect(insert).not.toThrow();
    expect(insert).toThrow();
  });
});

describe("多用户数据隔离约束", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    for (const migration of migrations) db.exec(migration.sql);
    db.prepare(
      `UPDATE users SET name = '用户一', phone = '13800000001', password_hash = 'hash',
       is_active = 1, updated_at = 1 WHERE id = 1`,
    ).run();
    db.prepare(
      `INSERT INTO users(name, phone, password_hash, created_at, updated_at)
       VALUES ('用户二', '13800000002', 'hash', 1, 1)`,
    ).run();
  });

  afterEach(() => db.close());

  it("不同用户可以拥有同一天的独立记录", () => {
    const insert = db.prepare(
      `INSERT INTO daily_records(
         user_id, record_date, work_target_minutes, weekly_workout_target, created_at, updated_at
       ) VALUES (?, '2026-08-27', 330, 3, 1, 1)`,
    );
    expect(() => insert.run(1)).not.toThrow();
    expect(() => insert.run(2)).not.toThrow();
    expect(() => insert.run(1)).toThrow();
  });

  it("不同用户可以同时运行各自的计时器", () => {
    const insert = db.prepare(
      `INSERT INTO time_sessions(
         user_id, kind, record_date, started_at, ended_at, source,
         is_manually_edited, created_at, updated_at
       ) VALUES (?, 'work', '2026-08-27', 100, NULL, 'timer', 0, 1, 1)`,
    );
    expect(() => insert.run(1)).not.toThrow();
    expect(() => insert.run(2)).not.toThrow();
    expect(() => insert.run(1)).toThrow();
  });

  it("删除用户会级联删除其顶层数据且不影响其他用户", () => {
    db.prepare(
      `INSERT INTO projects(user_id, name, status, workflow_status, created_at, updated_at)
       VALUES (1, '用户一项目', 'active', 'planning', 1, 1),
              (2, '用户二项目', 'active', 'planning', 1, 1)`,
    ).run();
    db.prepare("DELETE FROM users WHERE id = 2").run();
    const rows = db.prepare("SELECT user_id AS userId, name FROM projects").all() as Array<{ userId: number; name: string }>;
    expect(rows).toEqual([{ userId: 1, name: "用户一项目" }]);
  });
});
