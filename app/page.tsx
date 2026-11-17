import type { Metadata } from "next";
import { after } from "next/server";
import { HomeBoard } from "@/components/home/home-board";
import { requireUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { readHome } from "@/lib/home/store";
import { productVersions } from "@/lib/product-versions";
import { maybeAutoBackup } from "@/lib/backup";
import "./home.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "在侧 Folio · 主页",
  description: "生活在侧，生活在册，生活在策。",
  icons: { icon: "/folio/home/12-7789.svg" },
  other: { "folio-version": productVersions.home },
};
export default async function Home() {
  const user = await requireUser("/");
  after(() => maybeAutoBackup().catch(() => undefined));
  return <HomeBoard name={user.name} data={await readHome(sqlite, user.id)} />;
}
