import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { mcpAccess } from "@/lib/todo/mcp-access";
import { todoWebAppMetadata } from "@/lib/todo/web-app";
import { TodoSettings } from "@/components/todo/todo-settings";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { ...todoWebAppMetadata, title: "设置 · DIGTODO" };
export default async function TodoSettingsPage() {
  const user = await requireUser("/todo/settings");
  return <TodoSettings initialStatus={mcpAccess(sqlite).status(user.id)} />;
}
