"use client";
import { Fragment, useRef, useState } from "react";
import type { Exercise } from "@/lib/gym/model";
import { Check, ChevronDown, ChevronUp, Star } from "lucide-react";
import taxonomy from "@/lib/gym/muscle-taxonomy.json";
import { GymNavigation } from "./navigation";
import { GymTitle, Thumb, Sheet, modeLabels } from "./parts";
export function Library({
  catalog,
  purpose,
  editing,
  selected,
  blocked,
  onToggle,
  onDone,
  onBack,
  navigate,
  busy,
}: {
  catalog: Exercise[];
  editing: boolean;
  purpose: "browse" | "plan" | "training";
  selected: number[];
  blocked: number[];
  onToggle: (id: number) => void;
  onDone: () => void;
  onBack: () => void;
  navigate: (tab: "home" | "diary" | "browse") => void;
  busy: boolean;
}) {
  const [q, search] = useState(""),
    [region, setRegion] = useState("全部"),
    [tool, setTool] = useState("全部"),
    [muscle, setMuscle] = useState("全部"),
    [detail, setDetail] = useState<Exercise | null>(null);
  const results = useRef<HTMLDivElement>(null);
  const regions = ["全部", "胸部", "背部", "肩部", "臀腿", "手臂", "腰腹／核心", "有氧", "拉伸与活动度"];
  const regionLabel = (r: string) => r === "腰腹／核心" ? "核心" : r === "拉伸与活动度" ? "拉伸" : r;
  const [filterOpen, setFilterOpen] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const muscles: string[] = taxonomy[region as keyof typeof taxonomy] ?? [];
  const candidates = catalog.filter(e => region === "全部" || e.region === region ||
    e.muscles.split(" ").some(tag => muscles.includes(tag)));
  const gears = [...new Set(candidates.map(e => e.equipment))];
  const found = candidates.filter(
    (e) =>
      (tool === "全部" || e.equipment === tool) &&
      (muscle === "全部" || e.muscles.split(" ").includes(muscle)) &&
      q
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .every((term) =>
          [e.name, e.region, e.muscles, e.equipment, e.aliases]
            .join(" ")
            .toLowerCase()
            .includes(term),
        ),
  );
  const browse = purpose === "browse";
  const action = purpose === "training" ? "加入本次" : editing ? "加入计划" : "下一步 · 命名";
  const credit = <a className="visual-credit" href="https://gymvisual.com/">© Gym visual · gymvisual.com</a>;
  return <>
    <section className="gym-library" hidden={!!detail} data-purpose={purpose}>
      {!browse && <div className="pick-route"><button onClick={onBack} aria-label="返回">‹</button>
        {purpose === "training" ? "训练中 / 临时添加" : editing ? "我的计划 / 编辑" : "我的计划 / 新建"}
        <button className="pick-check" disabled={!selected.length || busy} onClick={onDone}
          aria-label={(purpose === "training" ? "加入本次" : "完成") + " · " + selected.length}><Check/></button></div>}
      <header className="library-heading">
        <GymTitle name={browse ? "动作库" : purpose === "plan" ? "选择计划动作" : "添加训练动作"}/>
        {browse && credit}
      </header>
      <div className="library-searchbar">
        <label className="library-search">
          <img src="/folio/gym-titles/search.svg" alt="" width="17" height="17"/>
          <input className="gym-search" type="search" aria-label="搜索动作" placeholder="搜索动作、肌群" value={q}
            onChange={e=>{search(e.target.value);results.current?.scrollTo(0,0);}}/>
        </label>
        {browse && <button className="filter-trigger" aria-label="筛选器械" aria-pressed={tool!=="全部"} onClick={()=>setFilterOpen(true)}>
          <img alt="" width="20" height="20" src="/folio/gym-titles/filter.svg"/></button>}
      </div>
      <div className="library-body">
        <nav className="library-rail" aria-label="按部位筛选">
          {regions.map(r=><Fragment key={r}><button aria-pressed={region===r} onClick={()=>{
            setExpanded(region===r ? !expanded : true);setRegion(r);setMuscle("全部");setTool("全部");results.current?.scrollTo(0,0);
          }}>{regionLabel(r)}{region===r && muscles.length>0 && (expanded?<ChevronUp size={11}/>:<ChevronDown size={11}/>)}</button>
          {region===r && expanded && muscles.length>0 && <div className="library-subnav">
            {["全部",...muscles].map(tag=><button key={tag} aria-pressed={muscle===tag} onClick={()=>{setMuscle(tag);results.current?.scrollTo(0,0);}}>{tag}</button>)}
          </div>}</Fragment>)}
        </nav>
        <div className="library-results" ref={results} role="region" aria-label="动作列表" tabIndex={0}>
          <h2>{q.trim() ? "搜索结果" : region==="全部" ? "全部动作" : muscle==="全部" ? regionLabel(region) : muscle}</h2>
          <div className="library-grid">{found.map(e=>{
            const already=blocked.includes(e.id), checked=selected.includes(e.id);
            return <button key={e.id} className="exercise-card" disabled={already} aria-pressed={browse?undefined:checked}
              onClick={()=>browse?setDetail(e):onToggle(e.id)}>
              <Thumb exercise={e}/><b>{e.name}</b><small>{[e.mainMuscle,e.equipment].filter(Boolean).join(" · ")}</small>
              {browse ? !!e.star && <Star className="catalog-star" size={12} fill="currentColor" aria-label="星标"/>
                : <span className={"card-mark"+(already?" existing":"")}>{already?"已有":checked?<Check size={14}/>:""}</span>}
            </button>})}</div>
          {!found.length && <p className="gym-muted">没有匹配的动作。</p>}
        </div>
      </div>
      {!browse && <footer className="picker-footer">{credit}<div><b>已选 {selected.length} 项</b>
        <button disabled={!selected.length || busy} className="primary" onClick={onDone}>{action}</button></div></footer>}
    </section>
    {browse && !detail && <GymNavigation current="browse" navigate={navigate}/>}
    {filterOpen && <Sheet title="筛选器械" close={()=>setFilterOpen(false)}><select aria-label="器械" value={tool} onChange={e=>{setTool(e.target.value);results.current?.scrollTo(0,0);}}>
      <option value="全部">全部器械</option>{gears.map(g=><option key={g}>{g}</option>)}</select>
      <button className="primary wide" onClick={()=>setFilterOpen(false)}>完成</button></Sheet>}
    {detail && <section className="exercise-details">
      <div className="pick-route"><button aria-label="返回" onClick={()=>setDetail(null)}>‹</button>动作库 / 动作详情</div>
      <h1>{detail.name}</h1><div className="exercise-hero">{detail.code && <small>No. {detail.code}</small>}<Thumb exercise={detail} animated/>
        {detail.code ? credit : <a className="visual-credit" href="/gym/credits">插图来源与署名</a>}</div>
      {detail.english && <p className="exercise-en" lang="en">{detail.english}</p>}
      <h3>{regionLabel(detail.region)}　 /　 {detail.equipment}</h3>
      <dl>{[["拉伸／活动",detail.stretchTarget],["主练",detail.mainMuscle],["明显参与",detail.alsoMuscles],["顺带参与",detail.minorMuscles],["记录方式",modeLabels[detail.mode]]].map(([label,value])=>value && <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <button className="details-back" onClick={()=>setDetail(null)}>返回动作库</button>
    </section>}
  </>;
}
