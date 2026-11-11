import { getCurrentUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getCurrentUser())) return new Response(null, { status: 401 });
  const { id } = await params;
  if (!/^\d{1,8}$/.test(id)) return new Response(null, { status: 404 });
  const row = sqlite
    .prepare("SELECT mime,content FROM gym_media WHERE id=?")
    .get(Number(id)) as { mime: string; content: Buffer } | undefined;
  if (!row) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(row.content), {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
