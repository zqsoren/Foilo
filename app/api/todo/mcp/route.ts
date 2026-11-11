import { sqlite } from "@/lib/db";
import { handleTodoMcp } from "@/lib/todo/mcp-server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const POST = (request: Request) => handleTodoMcp(request, sqlite);
export const GET = POST;
export const DELETE = POST;
