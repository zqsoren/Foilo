import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { readDesktop } from "@/lib/gym/desktop-store";
import { exercises } from "@/lib/gym/store";
import { productVersions } from "@/lib/product-versions";
import { GymDesktop } from "@/components/gym/desktop/board";
import "./desktop.css";
import "./widgets.css";
import "./editor.css";
import "./picker.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "健身 · 在侧 Folio",
  other: { "folio-version": productVersions.gym },
};
export default async function GymDashboard({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const query = await searchParams;
  const user = await requireUser(
    query.view === "plans" ? "/gym/dashboard?view=plans" : "/gym/dashboard",
  );
  return (
    <GymDesktop
      name={user.name}
      initial={readDesktop(sqlite, user.id)}
      catalog={exercises(sqlite)}
      initialView={query.view === "plans" ? "plans" : "board"}
    />
  );
}
