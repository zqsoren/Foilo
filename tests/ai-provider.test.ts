import { describe, expect, it, vi } from "vitest";
import { createProjectAiProvider, type ProjectAgentContext } from "../lib/ai/provider";

const config = {
  provider: "openai-compatible" as const,
  model: "gpt-5.6-luna",
  baseUrl: "https://cdn.12ai.org/v1/",
  apiKey: "sk-test-only",
};

const context: ProjectAgentContext = {
  project: {
    id: 1,
    name: "测试项目",
    status: "planning",
    goal: "完成测试",
    completionCriteria: "测试通过",
    currentStageId: null,
    stages: [],
  },
  domainSkill: null,
  conversationSummary: null,
  recentMessages: [{ role: "user", content: "你好" }],
};

function jsonResponse(content: string, status = 200) {
  return new Response(JSON.stringify({
    choices: [{ message: { content } }],
  }), { status, headers: { "Content-Type": "application/json" } });
}

describe("OpenAI 兼容项目 AI Provider", () => {
  it("使用正确的 12API 地址、Bearer 认证和模型名称", async () => {
    const fetcher = vi.fn(async () => jsonResponse(JSON.stringify({
      type: "conversation",
      content: "连接正常",
    }))) as unknown as typeof fetch;
    const provider = createProjectAiProvider(config, fetcher);
    const result = await provider!.send(context);
    expect(result).toEqual({ type: "conversation", content: "连接正常" });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, request] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://cdn.12ai.org/v1/chat/completions");
    expect((request.headers as Record<string, string>).Authorization).toBe("Bearer sk-test-only");
    const body = JSON.parse(request.body as string);
    expect(body.model).toBe("gpt-5.6-luna");
    expect(body.response_format).toBeUndefined();
  });

  it("校验并返回结构化修改建议", async () => {
    const fetcher = vi.fn(async () => jsonResponse(`\`\`\`json\n${JSON.stringify({
      type: "action_proposal",
      changeKind: "ordinary",
      title: "补充项目目标",
      reason: null,
      operations: [{ type: "update_project_definition", goal: "完成一个可用版本" }],
    })}\n\`\`\``)) as unknown as typeof fetch;
    const provider = createProjectAiProvider(config, fetcher);
    const result = await provider!.send(context);
    expect(result.type).toBe("action_proposal");
    if (result.type === "action_proposal") expect(result.operations[0].type).toBe("update_project_definition");
  });

  it("中转模型忽略 JSON 要求时把纯文本安全降级为普通回复", async () => {
    const fetcher = vi.fn(async () => jsonResponse("conversation\n先明确项目的最终交付物。")) as unknown as typeof fetch;
    const provider = createProjectAiProvider(config, fetcher);
    await expect(provider!.send(context)).resolves.toEqual({
      type: "conversation",
      content: "先明确项目的最终交付物。",
    });
  });

  it("把认证错误转换为用户可理解的提示", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ error: { message: "invalid key" } }),
      { status: 401 },
    )) as unknown as typeof fetch;
    const provider = createProjectAiProvider(config, fetcher);
    await expect(provider!.send(context)).rejects.toThrow("AI 认证失败，请检查 API Key");
  });

  it("连接被临时重置时自动重试一次", async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(jsonResponse(JSON.stringify({
        type: "conversation",
        content: "重试成功",
      }))) as unknown as typeof fetch;
    const provider = createProjectAiProvider(config, fetcher);
    await expect(provider!.send(context)).resolves.toEqual({
      type: "conversation",
      content: "重试成功",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
