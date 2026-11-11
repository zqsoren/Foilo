import { sqlite } from "../db";
import type { ProjectAgentContext, ProjectAiProvider, StoredAiProviderConfig } from "./provider";

const RECENT_MESSAGE_LIMIT = 24;

export function buildProjectAgentContext(
  userId: number,
  projectId: number,
  conversationId: number,
): ProjectAgentContext {
  const project = sqlite.prepare(
    `SELECT id, name, workflow_status AS status, COALESCE(goal, '') AS goal,
            COALESCE(completion_criteria, '') AS completionCriteria,
            current_stage_id AS currentStageId
     FROM projects WHERE id = ? AND user_id = ?`,
  ).get(projectId, userId) as ProjectAgentContext["project"] | undefined;
  if (!project) throw new Error("找不到这个项目");

  const conversation = sqlite.prepare(
    `SELECT summary FROM project_ai_conversations
     WHERE id = ? AND project_id = ?`,
  ).get(conversationId, projectId) as { summary: string | null } | undefined;
  if (!conversation) throw new Error("找不到这段对话");

  const domainSkill = sqlite.prepare(
    `SELECT content FROM project_ai_domain_skills
     WHERE project_id = ? ORDER BY version DESC LIMIT 1`,
  ).get(projectId) as { content: string } | undefined;

  const stages = sqlite.prepare(
    `SELECT id, title, completed_at AS completedAt
     FROM project_stages WHERE project_id = ? ORDER BY position`,
  ).all(projectId) as Array<{ id: number; title: string; completedAt: number | null }>;
  const tasks = sqlite.prepare(
    `SELECT id, title, completed_at AS completedAt
     FROM project_stage_tasks WHERE stage_id = ? ORDER BY position`,
  );
  const recurring = sqlite.prepare(
    `SELECT id, title, frequency, frequency_label AS frequencyLabel
     FROM project_stage_recurring_tasks WHERE stage_id = ? ORDER BY position`,
  );
  project.stages = stages.map((stage) => ({
    id: stage.id,
    title: stage.title,
    completed: stage.completedAt !== null,
    tasks: (tasks.all(stage.id) as Array<{ id: number; title: string; completedAt: number | null }>).map((task) => ({
      id: task.id,
      title: task.title,
      completed: task.completedAt !== null,
    })),
    recurringTasks: (recurring.all(stage.id) as Array<{ id: number; title: string; frequency: string; frequencyLabel: string | null }>).map((task) => ({
      id: task.id,
      title: task.title,
      frequency: task.frequency === "custom" ? task.frequencyLabel ?? "自定义" : task.frequency,
    })),
  }));

  const recentMessages = sqlite.prepare(
    `SELECT role, content FROM (
       SELECT id, role, content FROM project_ai_messages
       WHERE conversation_id = ? ORDER BY id DESC LIMIT ?
     ) ORDER BY id`,
  ).all(conversationId, RECENT_MESSAGE_LIMIT) as ProjectAgentContext["recentMessages"];

  return {
    project,
    domainSkill: domainSkill?.content ?? null,
    conversationSummary: conversation.summary,
    recentMessages,
  };
}

export function getStoredAiProviderConfig(userId: number): StoredAiProviderConfig | null {
  const row = sqlite.prepare(
    `SELECT ai_provider AS provider, ai_model AS model,
            ai_base_url AS baseUrl, ai_api_key AS apiKey
     FROM app_settings WHERE user_id = ?`,
  ).get(userId) as {
    provider: "none" | "openai" | "openai-compatible";
    model: string | null;
    baseUrl: string | null;
    apiKey: string | null;
  };
  if (!row || row.provider === "none" || !row.model || !row.baseUrl || !row.apiKey) return null;
  let url: URL;
  try {
    url = new URL(row.baseUrl);
  } catch {
    throw new Error("AI API 地址格式不正确");
  }
  if (url.protocol !== "https:") throw new Error("AI API 地址必须使用 HTTPS");
  return {
    provider: row.provider,
    model: row.model,
    baseUrl: row.baseUrl,
    apiKey: row.apiKey,
  };
}

export async function maybeSummarizeConversation(
  conversationId: number,
  provider: ProjectAiProvider,
): Promise<boolean> {
  const conversation = sqlite.prepare(
    `SELECT summary, COALESCE(summarized_through_message_id, 0) AS summarizedThrough
     FROM project_ai_conversations WHERE id = ?`,
  ).get(conversationId) as { summary: string | null; summarizedThrough: number } | undefined;
  if (!conversation) return false;
  const unsummarized = sqlite.prepare(
    `SELECT id, role, content FROM project_ai_messages
     WHERE conversation_id = ? AND id > ? ORDER BY id`,
  ).all(conversationId, conversation.summarizedThrough) as Array<{
    id: number;
    role: "user" | "assistant";
    content: string;
  }>;
  if (unsummarized.length < 36) return false;
  const source = unsummarized.slice(0, -20);
  const summary = await provider.summarize(
    conversation.summary,
    source.map(({ role, content }) => ({ role, content })),
  );
  const summarizedThrough = source.at(-1)?.id;
  if (!summarizedThrough) return false;
  sqlite.prepare(
    `UPDATE project_ai_conversations SET summary = ?,
       summarized_through_message_id = ?, updated_at = ? WHERE id = ?`,
  ).run(summary, summarizedThrough, Date.now(), conversationId);
  return true;
}
