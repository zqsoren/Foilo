"use client";
import { useMemo, useState } from "react";
import atlas from "@/lib/gym/muscle-atlas.json";
import { loadColor, summarizeLoad, type LoadEntry } from "@/lib/gym/muscle-load";

type Period = Parameters<typeof loadColor>[1];
type Layer = "surface" | "deep";
const bands = { session: [1,2,4], week: [3,6,12], month: [12,24,48] };
export function MuscleMap({ entries, period }: { entries: LoadEntry[]; period: Period }) {
  const scores = useMemo(() => summarizeLoad(entries), [entries]);
  const ranked = useMemo(() => [...scores.keys()].sort((a,b) => scores.get(b)!.sets - scores.get(a)!.sets), [scores]);
  const [choice, setChoice] = useState("");
  const [layer, setLayer] = useState<Layer>("surface");
  const selected = choice || ranked[0] || "胸中部";
  const limits = bands[period];
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
          onClick={m?()=>setChoice(m):undefined}><title>{m ? m+" · "+(scores.get(m)?.sets ?? 0)+" 折算组" : "人体轮廓"}</title></path>)}
      </svg><figcaption>{side==="front"?"正面":"背面"}</figcaption>
    </figure>)}</div>
    <div className="gm-scale" aria-label="颜色对应折算组数">
      {[0, 0.5,...limits].map((n,i)=><span key={n}><i style={{background:loadColor(n,period)}}/>{["0",`<${limits[0]}`,`${limits[0]}–<${limits[1]}`,`${limits[1]}–<${limits[2]}`,`${limits[2]}+`][i]}</span>)}
    </div>
  </section>;
}
