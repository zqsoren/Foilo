"use client";
import { useMemo, useState } from "react";
import atlas from "@/lib/gym/muscle-atlas.json";
import { loadColor, summarizeLoad, type LoadEntry } from "@/lib/gym/muscle-load";

type Period = Parameters<typeof loadColor>[1];
type Layer = "surface" | "deep";
const muscles = Object.keys(atlas.structures);
const deepTargets = new Set(["肩胛下肌", "腹横肌", "菱形肌", "冈上肌", "冈下肌", "小圆肌", "大圆肌", "肱肌", "髋屈肌"]);
const bands = { session: [1,2,4], week: [3,6,12], month: [12,24,48] };
const creditUrl = "https://github.com/ArianArsenal/anatomy-explorer/blob/8375d6ce7fec36e677c0eda66cae829ba55a4717/CREDITS.md";

export function MuscleMap({ entries, period }: { entries: LoadEntry[]; period: Period }) {
  const scores = useMemo(() => summarizeLoad(entries), [entries]);
  const ranked = useMemo(() => [...scores.keys()].sort((a,b) => scores.get(b)!.sets - scores.get(a)!.sets), [scores]);
  const [choice, setChoice] = useState("");
  const [layer, setLayer] = useState<Layer>("surface");
  const selected = choice || ranked[0] || "胸中部";
  const detail = scores.get(selected);
  const limits = bands[period];
  function select(muscle: string, reveal: boolean) {
    setChoice(muscle);
    if (reveal) setLayer(deepTargets.has(muscle) ? "deep" : "surface");
  }
  return <section className="gm-map" aria-label="肌群训练量">
    <header><h2>肌群训练量</h2><div className="gm-toggle" aria-label="人体层次">
      {(["surface","deep"] as const).map(key => <button key={key} type="button" aria-pressed={key===layer} onClick={()=>setLayer(key)}>{key==="surface"?"表层":"深层"}</button>)}
    </div></header>
    <div className="gm-figures">{(["front","back"] as const).map(side=><figure key={side}>
      <svg viewBox={atlas.viewBox} aria-label={side==="front"?"人体正面":"人体背面"}>
        {Object.entries(atlas.layers[`${layer}-${side}`]).map(([m,d])=><path key={m}
          data-muscle={m || undefined} d={d} fillRule="evenodd"
          fill={m ? loadColor(scores.get(m)?.sets ?? 0,period) : "#eff0ef"}
          stroke={m===selected?"#333a37":m?"#fcfcfa":"#c9cdca"} strokeWidth={m===selected?2.8:1.45}
          onClick={m?()=>select(m,false):undefined}><title>{m ? m+" · "+(scores.get(m)?.sets ?? 0)+" 折算组" : "人体轮廓"}</title></path>)}
      </svg><figcaption>{side==="front"?"正面":"背面"}</figcaption>
    </figure>)}</div>
    <div className="gm-scale" aria-label="颜色对应折算组数">
      {[0, 0.5,...limits].map((n,i)=><span key={n}><i style={{background:loadColor(n,period)}}/>{["0",`<${limits[0]}`,`${limits[0]}–<${limits[1]}`,`${limits[1]}–<${limits[2]}`,`${limits[2]}+`][i]}</span>)}
    </div>
    <div className="gm-detail">
      <label>肌群 <select aria-label="选择肌群" value={selected} onChange={e=>select(e.target.value,true)}>
        {[...ranked,...muscles.filter(m=>!scores.has(m))].map(m=><option key={m}>{m}</option>)}
      </select></label>
      <span><b>{detail?.sets ?? 0}</b> 折算组</span>
    </div>
    {detail ? <p className="gm-source">{detail.workouts.size} 次训练 · {[...detail.sources].map(([n,s])=>n+" "+s+" 组").join("、")}</p>
      : <p className="gm-source">{scores.size?"所选肌群在此时段为 0 组。":"此时段暂无已完成且计入肌群的训练组。"}</p>}
    <details><summary>计算与模型来源</summary>
      <p>每个已完成组按主练 1、明显参与 0.5、顺带参与 0 折算。递减组按整组计一次。有氧和拉伸单列。颜色表示累计训练量，胸部三区表示训练侧重。</p>
      <p>正背面由 ArianArsenal 转换的 Z-Anatomy 模型投影、简化。作者 Gauthier Kervyn、Marcin Zielinski 等。衍生图形采用 <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>。上游 BodyParts3D © The Database Center for Life Science，<a href="https://creativecommons.org/licenses/by-sa/2.1/jp/">CC BY-SA 2.1 JP</a>。<a href={creditUrl}>完整素材署名</a></p>
    </details>
  </section>;
}
