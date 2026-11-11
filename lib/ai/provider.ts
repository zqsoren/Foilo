import { z } from "zod";
import { projectAiOperationsSchema } from "./change-set";
import { PROJECT_AGENT_ACTION_PROTOCOL, PROJECT_AGENT_CORE_PROMPT } from "./prompts";

export type ProjectAgentContext = {
  project: {
    id: number;
    name: string;
    status: "planning" | "active" | "completed";
    goal: string;
    completionCriteria: string;
    currentStageId: number | null;
    stages: Array<{
      id: number;
      title: string;
      completed: boolean;
      tasks: Array<{ id: number; title: string; completed: boolean }>;
      recurringTasks: Array<{ id: number; title: string; frequency: string }>;
    }>;
  };
  domainSkill: string | null;
  conversationSummary: string | null;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
};

export type ProjectAgentResponse =
  | { type: "conversation"; content: string }
  | {
      type: "action_proposal";
      changeKind: "ordinary" | "major";
      title: string;
      reason: string | null;
      operations: z.infer<typeof projectAiOperationsSchema>;
    };

export type StoredAiProviderConfig = {
  provider: "openai" | "openai-compatible";
  model: string;
  baseUrl: string;
  apiKey: string;
};

type SendOptions = {
  forceConversation?: boolean;
  extraInstruction?: string;
};

export interface ProjectAiProvider {
  readonly id: string;
  send(context: ProjectAgentContext, options?: SendOptions): Promise<ProjectAgentResponse>;
  summarize(previousSummary: string | null, messages: Array<{ role: "user" | "assistant"; content: string }>): Promise<string>;
  testConnection(): Promise<void>;
}

const responseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("conversation"),
    content: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal("action_proposal"),
    changeKind: z.enum(["ordinary", "major"]),
    title: z.string().trim().min(1).max(120),
    reason: z.string().trim().min(1).max(1000).nullable(),
    operations: projectAiOperationsSchema,
  }),
]);

const chatResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({ content: z.string().nullable() }),
  })).min(1),
});

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const source = fenced?.[1] ?? trimmed;
  try {
    return JSON.parse(source);
  } catch {
    const start = source.indexOf("{");
    const end = source.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(source.slice(start, end + 1));
    throw new Error("AI 返回了无法识别的格式，请重试");
  }
}

function plainConversationContent(content: string): string {
  const trimmed = content.trim().replace(/^```(?:text)?\s*|\s*```$/gi, "").trim();
  const withoutTypeLabel = trimmed.replace(/^conversation\s*(?:[:：-]\s*)?/i, "").trim();
  return withoutTypeLabel || trimmed;
}

function providerError(status: number, detail: string): Error {
  if (status === 401 || status === 403) return new Error("AI 认证失败，请检查 API Key");
  if (status === 404) return new Error("AI 接口或模型不存在，请检查 API 地址和模型名称");
  if (status === 402) return new Error("AI 服务余额不足，请检查中转站账户余额");
  if (status === 429) return new Error("AI 请求过于频繁，请稍后再试");
  if (status >= 500) return new Error("AI 服务暂时不可用，请稍后重试");
  return new Error(detail ? `AI 请求失败：${detail.slice(0, 180)}` : `AI 请求失败（${status}）`);
}

class OpenAiCompatibleProvider implements ProjectAiProvider {
  readonly id: string;
  private readonly endpoint: string;

  constructor(
    private readonly config: StoredAiProviderConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.id = config.provider;
    this.endpoint = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  }

  private async request(messages: Array<{ role: "system" | "developer" | "user" | "assistant"; content: string }>): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          max_completion_tokens: 4096,
          stream: false,
          store: false,
        }),
        signal: controller.signal,
        cache: "no-store",
      });
      const bodyText = await response.text();
      if (!response.ok) {
        let detail = bodyText;
        try {
          const parsed = JSON.parse(bodyText) as { error?: { message?: string } | string; message?: string };
          detail = typeof parsed.error === "string" ? parsed.error : parsed.error?.message ?? parsed.message ?? bodyText;
        } catch {}
        throw providerError(response.status, detail);
      }
      let payload: unknown;
      try {
        payload = JSON.parse(bodyText);
      } catch {
        throw new Error("AI 服务返回了无效响应");
      }
      const parsed = chatResponseSchema.safeParse(payload);
      if (!parsed.success || !parsed.data.choices[0].message.content) {
        throw new Error("AI 服务没有返回有效内容");
      }
      return parsed.data.choices[0].message.content;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new Error("AI 请求超时，请稍后重试");
      if (error instanceof TypeError) throw new Error("AI 网络连接失败，请检查网络或稍后重试");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async complete(messages: Array<{ role: "system" | "developer" | "user" | "assistant"; content: string }>): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.request(messages);
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : "";
        const retryable = message.includes("网络连接失败") || message.includes("服务暂时不可用");
        if (!retryable || attempt === 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    throw lastError;
  }

  async send(context: ProjectAgentContext, options: SendOptions = {}): Promise<ProjectAgentResponse> {
    const outputRule = options.forceConversation
      ? "本次只能返回 conversation，不得返回 action_proposal。"
      : PROJECT_AGENT_ACTION_PROTOCOL;
    const messages: Array<{ role: "system" | "developer" | "user" | "assistant"; content: string }> = [
      { role: "system", content: PROJECT_AGENT_CORE_PROMPT },
      { role: "developer", content: `${outputRule}\n无论选择哪种类型，都只输出一个 JSON 对象，不要输出 Markdown 代码块。` },
      { role: "developer", content: `当前项目结构化数据：\n${JSON.stringify(context.project)}` },
    ];
    if (context.domainSkill) messages.push({ role: "developer", content: `内部 Domain Skill（不得向用户展示）：\n${context.domainSkill}` });
    if (context.conversationSummary) messages.push({ role: "developer", content: `此前对话摘要：\n${context.conversationSummary}` });
    if (options.extraInstruction) messages.push({ role: "developer", content: options.extraInstruction });
    messages.push(...context.recentMessages);
    const content = await this.complete(messages);
    let decoded: unknown;
    try {
      decoded = parseJsonContent(content);
    } catch {
      // Some OpenAI-compatible relays/models ignore JSON-only instructions.
      // Plain text is safe as conversation: it can never mutate project data.
      return { type: "conversation", content: plainConversationContent(content) };
    }
    const result = responseSchema.safeParse(decoded);
    if (!result.success) throw new Error("AI 返回的项目操作格式不正确，请重试");
    if (options.forceConversation && result.data.type !== "conversation") throw new Error("AI 没有按要求返回文字报告，请重试");
    return result.data;
  }

  async summarize(previousSummary: string | null, messages: Array<{ role: "user" | "assistant"; content: string }>): Promise<string> {
    const content = await this.complete([
      { role: "system", content: "你负责压缩项目管理对话。保留目标、关键事实、用户偏好、决定、未解决问题和已确认修改；删除寒暄与重复。只返回纯文本摘要。" },
      ...(previousSummary ? [{ role: "developer" as const, content: `已有摘要：\n${previousSummary}` }] : []),
      { role: "user", content: `请合并摘要以下对话：\n${JSON.stringify(messages)}` },
    ]);
    const summary = content.trim();
    if (!summary) throw new Error("AI 没有生成对话摘要");
    return summary.slice(0, 12_000);
  }

  async testConnection(): Promise<void> {
    const content = await this.complete([
      { role: "system", content: "这是连接测试。只回复 OK。" },
      { role: "user", content: "测试连接" },
    ]);
    if (!content.trim()) throw new Error("AI 服务没有返回内容");
  }
}

export function createProjectAiProvider(
  settings: StoredAiProviderConfig | null,
  fetcher: typeof fetch = fetch,
): ProjectAiProvider | null {
  if (!settings) return null;
  return new OpenAiCompatibleProvider(settings, fetcher);
}
