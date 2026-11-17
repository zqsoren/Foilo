import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { readWealth } from "@/lib/wealth/read";
import { WealthBoard } from "@/components/wealth/board";
import { productVersions } from "@/lib/product-versions";
import "./wealth.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "资产 · 在侧 Folio",
  other: { "folio-version": productVersions.wealth },
};
export default async function WealthDashboard({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; account?: string }>;
}) {
  const query = await searchParams;
  const view =
    query.view === "entry"
      ? "entry"
      : query.view === "wealth"
        ? "wealth"
        : "overview";
  const user = await requireUser(
    "/wealth/dashboard" + (view === "overview" ? "" : "?view=" + view),
  );
  return (
    <WealthBoard
      name={user.name}
      initial={await readWealth(sqlite, user.id)}
      initialView={view}
      initialAccountId={
        query.account && /^\d+$/.test(query.account)
          ? Number(query.account)
          : null
      }
    />
  );
}
