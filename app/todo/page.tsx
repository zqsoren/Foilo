import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getStoredAiProviderConfig } from "@/lib/ai/project-agent";
import { readTodo } from "@/lib/todo/store";
import { shanghaiNow } from "@/lib/todo/model";
import { TodoApp } from "@/components/todo/todo-app";
import { WebAppRegistration } from "@/components/todo/web-app-registration";
import { todoWebAppMetadata } from "@/lib/todo/web-app";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { ...todoWebAppMetadata, title: "在侧TODO", description: "说出今天要做的事，让 AI 帮你安排时间。" };

export default async function TodoPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const isChat = (await searchParams).tab === "chat";
  const user = await requireUser(isChat ? "/todo?tab=chat" : "/todo");
  return <><WebAppRegistration /><TodoApp initialTab={isChat ? "chat" : "schedule"} initialState={readTodo(user.id)} today={shanghaiNow().date} aiConfigured={Boolean(getStoredAiProviderConfig(user.id))} /></>;
}
