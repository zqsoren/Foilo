"use client";
import { useMemo, useRef, useState } from "react";
import type { Exercise } from "@/lib/gym/model";
import { Check, Search } from "lucide-react";
import { GymTitle, Thumb, Sheet, modeLabels } from "./parts";
export function Library({
  catalog,
  purpose,
  selected,
  blocked,
  onToggle,
  onDone,
  onBack,
  busy,
}: {
  catalog: Exercise[];
  purpose: "browse" | "plan" | "training";
  selected: number[];
  blocked: number[];
  onToggle: (id: number) => void;
  onDone: () => void;
  onBack: () => void;
  busy: boolean;
}) {
  const [q, search] = useState(""),
    [region, setRegion] = useState("全部"),
    [tool, setTool] = useState("全部"),
    [muscle, setMuscle] = useState("全部"),
    [detail, setDetail] = useState<Exercise | null>(null);
  const results = useRef<HTMLDivElement>(null);
  const regions = useMemo(
    () => ["全部", ...new Set(catalog.map((e) => e.region))],
    [catalog],
  );
  const candidates = catalog.filter(
    (e) => region === "全部" || e.region === region,
  );
  const gears = [...new Set(candidates.map((e) => e.equipment))],
    muscles = [...new Set(candidates.flatMap((e) => e.muscles.split(" ")))];
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
  return (
    <>
      <section className="gym-library">
        <header className="gym-heading library-heading">
          <div>
            {!browse && <button className="text" onClick={onBack}>‹ 返回</button>}
            <GymTitle name={browse ? "动作库" : purpose === "plan" ? "选择计划动作" : "添加训练动作"} />
          </div>
          {!browse && <button className="library-done primary" aria-label={(purpose === "plan" ? "完成" : "加入本次") + " · " + selected.length}
            disabled={!selected.length || busy} onClick={onDone}><Check size={20} aria-hidden="true" /></button>}
        </header>
        <label className="library-search"><Search size={17} aria-hidden="true" />
          <input className="gym-search" type="search" aria-label="搜索动作" placeholder="搜索动作、肌群或器械" value={q}
            onChange={(e) => { search(e.target.value); results.current?.scrollTo(0, 0); }} />
        </label>
        <div className="library-body">
          <nav className="library-rail" aria-label="按部位筛选">
            {regions.map((r) => <button key={r} aria-pressed={region === r}
              onClick={() => { setRegion(r); setMuscle("全部"); setTool("全部"); results.current?.scrollTo(0, 0); }}>{r}</button>)}
          </nav>
          <div className="library-results" ref={results} role="region" aria-label="动作列表" tabIndex={0}>
            <div className="library-count"><strong>{q.trim() ? "搜索结果" : region === "全部" ? "全部动作" : region}</strong>
              <small aria-live="polite">{browse ? found.length + " 项" : "已选 " + selected.length + " 项"}</small></div>
            <details className="library-options">
              <summary>{tool === "全部" && muscle === "全部" ? "筛选" : "已筛选"}</summary>
              <div className="gym-filters library-filters">
              <select aria-label="器械" value={tool} onChange={(e) => setTool(e.target.value)}>
                <option value="全部">全部器械</option>{gears.map((s) => <option key={s}>{s}</option>)}
              </select>
              {region !== "全部" && <select aria-label="肌群" value={muscle} onChange={(e) => setMuscle(e.target.value)}>
                <option value="全部">全部肌群</option>{muscles.map((s) => <option key={s}>{s}</option>)}
              </select>}
            </div>
            </details>
            <div className="library-grid">
              {found.map((e) => {
                const already = blocked.includes(e.id), checked = selected.includes(e.id);
                return <button key={e.id} className="exercise-card" disabled={already}
                  aria-pressed={browse ? undefined : checked} onClick={() => browse ? setDetail(e) : onToggle(e.id)}>
                  <Thumb exercise={e} />
                  <b>{e.name}</b><small>{e.equipment}</small>
                  {!browse && <span className={already ? "card-mark existing" : "card-mark"} aria-hidden="true">{already ? "已有" : checked ? <Check size={13} /> : ""}</span>}
                </button>;
              })}
            </div>
            {!found.length && <p className="gym-muted">没有匹配的动作。试试别名，或清除筛选。</p>}
          </div>
        </div>
      </section>
      {browse && (
        <button className="gym-orb" aria-label="返回训练首页" onClick={onBack}>
          训练
        </button>
      )}
      {detail && (
        <Sheet title={detail.name} close={() => setDetail(null)}>
          <div className="large-art">
            <Thumb exercise={detail} />
          </div>
          <p>
            {detail.region} · {detail.muscles} · {detail.equipment}
          </p>
          <p className="gym-muted">{modeLabels[detail.mode]}</p>
          {detail.imageId && <a className="gym-credit" href="/gym/credits">插图来源与署名</a>}
        </Sheet>
      )}
    </>
  );
}
