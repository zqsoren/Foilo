import { requireUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function Credits() {
  await requireUser("/gym");
  const rows = sqlite
    .prepare(
      "SELECT e.name,m.artist,m.source,m.license FROM gym_media m JOIN gym_exercises e ON e.image_id=m.id WHERE e.listed=1 ORDER BY e.id",
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
      <p>精选动作缩略图与动画来自 <a href="https://gymvisual.com/">© Gym visual — https://gymvisual.com/</a>。</p>
      <h2>肌群模型</h2>
      <p>正背面由 ArianArsenal 转换的 Z-Anatomy 模型投影、简化。作者 Gauthier Kervyn、Marcin Zielinski 等。衍生图形采用 <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>。上游 BodyParts3D © The Database Center for Life Science，<a href="https://creativecommons.org/licenses/by-sa/2.1/jp/">CC BY-SA 2.1 JP</a>。<a href="https://github.com/ArianArsenal/anatomy-explorer/blob/8375d6ce7fec36e677c0eda66cae829ba55a4717/CREDITS.md">完整素材署名</a></p>
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
