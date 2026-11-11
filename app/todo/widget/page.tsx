import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { readTodo } from "@/lib/todo/store";
import { widgetSnapshot, widgetTokens } from "@/lib/todo/widget";
import { todoWebAppMetadata } from "@/lib/todo/web-app";
import { WidgetSetup } from "@/components/todo/widget-setup";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { ...todoWebAppMetadata, title: "日程小组件 · DIGTODO" };
export default async function WidgetPage() {
  const user = await requireUser("/todo/widget");
  return <WidgetSetup scriptSource={readFileSync(path.join(process.cwd(), "public/widgets/xipo-today.js"), "utf8")} initialStatus={widgetTokens(sqlite).status(user.id)} snapshot={widgetSnapshot(readTodo(user.id).events)} />;
}
