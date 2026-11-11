import { requireUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function Credits() {
  await requireUser("/gym");
  const rows = sqlite
    .prepare(
      "SELECT e.name,m.artist,m.source,m.license FROM gym_media m JOIN gym_exercises e ON e.image_id=m.id ORDER BY e.id",
    )
    .all() as {
    name: string;
    artist: string;
    source: string;
    license: string;
  }[];
  return (
    <main style={{ padding: 24, maxWidth: 680, margin: "auto" }}>
      <Link href="/gym">‹ 返回健身</Link>
      <h1>动作插图署名</h1>
      <p>
        Everkinetic 插图经 wger 提供，转为灰度 WebP，使用{" "}
        <a href="https://creativecommons.org/licenses/by-sa/3.0/">
          CC BY-SA 3.0
        </a>{" "}
        许可。由在侧生成的动作示意图在下方单独标注。
      </p>
      <ul>
        {rows.map((r) => (
          <li key={r.name}>
            {r.source === "generated:folio" ? r.name : <a href={r.source}>{r.name} · 原图</a>} — {r.artist} · {r.license}
          </li>
        ))}
      </ul>
    </main>
  );
}
