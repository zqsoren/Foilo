import type { Metadata } from "next";
import { productVersions } from "@/lib/product-versions";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { dashboard, exercises, gymMonth } from "@/lib/gym/store";
import GymApp from "@/components/gym/gym-app";
import "./gym.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "健身 · 在侧 Folio",
  other: { "folio-version": productVersions.gym },
};
export default async function GymPage({
  searchParams,
}: {
  searchParams: Promise<{ device?: string }>;
}) {
  const [query, h] = await Promise.all([searchParams, headers()]);
  const handheld =
    h.get("sec-ch-ua-mobile") === "?1" ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(h.get("user-agent") ?? "");
  const device =
    query.device === "desktop" || query.device === "mobile"
      ? query.device
      : handheld
        ? "mobile"
        : "desktop";
  const user = await requireUser("/gym?device=" + device);
  const month = gymMonth();
  return (
    <GymApp
      device={device}
      initial={dashboard(sqlite, user.id, month)}
      catalog={exercises(sqlite)}
    />
  );
}
