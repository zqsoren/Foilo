import { sqlite } from "../db";
import { buildProjectAgentContext, getStoredAiProviderConfig } from "./project-agent";
import { createProjectAiProvider } from "./provider";

const RETRY_AFTER_MS = 6 * 60 * 60 * 1000;

export async function runPendingProjectWeeklyChecks(userId: number): Promise<{ completed: number; failed: number }> {
  const provider = createProjectAiProvider(getStoredAiProviderConfig(userId));
  if (!provider) return { completed: 0, failed: 0 };
  const now = Date.now();
  const retryBefore = now - RETRY_AFTER_MS;
  const checks = sqlite.prepare(
    `SELECT c.id, c.project_id AS projectId
     FROM project_weekly_checks c
     JOIN projects p ON p.id = c.project_id
     WHERE c.status = 'pending' AND p.workflow_status = 'active'
       AND p.archived_at IS NULL AND p.user_id = ?
       AND (c.attempted_at IS NULL OR c.attempted_at < ?)
     ORDER BY c.scheduled_at LIMIT 10`,
  ).all(userId, retryBefore) as Array<{ id: number; projectId: number }>;
  let completed = 0;
  let failed = 0;
  for (const check of checks) {
    const claimed = sqlite.prepare(
      `UPDATE project_weekly_checks SET attempted_at = ?
       WHERE id = ? AND status = 'pending'
         AND (attempted_at IS NULL OR attempted_at < ?)`,
    ).run(now, check.id, retryBefore);
    if (!claimed.changes) continue;
    try {
      const conversation = sqlite.prepare(
        `SELECT id FROM project_ai_conversations
         WHERE project_id = ? ORDER BY updated_at DESC LIMIT 1`,
      ).get(check.projectId) as { id: number } | undefined;
      if (!conversation) {
        failed += 1;
        continue;
      }
      const context = buildProjectAgentContext(userId, check.projectId, conversation.id);
      const response = await provider.send(context, {
        forceConversation: true,
        extraInstruction: "现在执行每周项目检查。比较项目目标、当前阶段、任务完成情况和最近对话，只提供简洁的事实判断、风险和下周建议；不得提出或执行数据库修改。",
      });
      if (response.type !== "conversation") {
        failed += 1;
        continue;
      }
      const completedAt = Date.now();
      sqlite.transaction(() => {
        const message = sqlite.prepare(
          `INSERT INTO project_ai_messages(
             conversation_id, role, message_type, content, created_at
           ) VALUES (?, 'assistant', 'weekly_report', ?, ?)`,
        ).run(conversation.id, response.content, completedAt);
        sqlite.prepare(
          `UPDATE project_weekly_checks SET status = 'completed', report_message_id = ?,
           completed_at = ? WHERE id = ? AND status = 'pending'`,
        ).run(Number(message.lastInsertRowid), completedAt, check.id);
        sqlite.prepare(
          "UPDATE project_ai_conversations SET updated_at = ? WHERE id = ?",
        ).run(completedAt, conversation.id);
      })();
      completed += 1;
    } catch {
      failed += 1;
    }
  }
  return { completed, failed };
}
