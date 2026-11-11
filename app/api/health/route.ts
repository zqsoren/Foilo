import { NextResponse } from "next/server";
import { sqlite } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    sqlite.prepare("SELECT 1").get();
    return NextResponse.json({ ok: true, service: "life-workbench" });
  } catch {
    return NextResponse.json(
      { ok: false, service: "life-workbench" },
      { status: 503 },
    );
  }
}
