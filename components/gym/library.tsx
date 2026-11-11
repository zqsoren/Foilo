"use client";
import { useMemo, useState } from "react";
import type { Exercise } from "@/lib/gym/model";
import { Thumb, Sheet, modeLabels } from "./parts";
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
      <header className="gym-heading">
        <div>
          {!browse && (
            <button className="text" onClick={onBack}>
              ‹ 返回
            </button>
          )}
          <h1>
            {browse
              ? "动作库"
              : purpose === "plan"
                ? "选择计划动作"
                : "添加训练动作"}
          </h1>
        </div>
        {!browse && (
          <button
            className="primary compact"
            disabled={!selected.length || busy}
            onClick={onDone}
          >
            {purpose === "plan" ? "完成" : "加入本次"}
            {selected.length ? " · " + selected.length : ""}
          </button>
        )}
      </header>
      <input
        className="gym-search"
        type="search"
        aria-label="搜索动作"
        placeholder="搜索动作、肌群或器械"
        value={q}
        onChange={(e) => search(e.target.value)}
      />
      <div className="gym-chips">
        {regions.map((r) => (
          <button
            key={r}
            className={region === r ? "chosen" : ""}
            onClick={() => {
              setRegion(r);
              setMuscle("全部");
              setTool("全部");
            }}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="gym-filters">
        <select
          aria-label="器械"
          value={tool}
          onChange={(e) => setTool(e.target.value)}
        >
          <option value="全部">全部器械</option>
          {gears.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        {region !== "全部" && (
          <select
            aria-label="肌群"
            value={muscle}
            onChange={(e) => setMuscle(e.target.value)}
          >
            <option value="全部">全部肌群</option>
            {muscles.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        )}
        <small>{found.length} 项</small>
      </div>
      <div className="gym-list">
        {found.map((e) => {
          const already = blocked.includes(e.id),
            checked = selected.includes(e.id);
          return (
            <button
              key={e.id}
              className="gym-ex"
              disabled={already}
              aria-pressed={browse ? undefined : checked}
              onClick={() => (browse ? setDetail(e) : onToggle(e.id))}
            >
              <Thumb exercise={e} />
              <span className="fill">
                <b>{e.name}</b>
                <small>
                  {e.region} · {e.equipment}
                </small>
              </span>
              <span className={checked ? "tick marked" : "tick"}>
                {browse ? "›" : already ? "已有" : checked ? "✓" : "○"}
              </span>
            </button>
          );
        })}
        {!found.length && (
          <p className="gym-muted">没有匹配的动作。试试别名，或清除筛选。</p>
        )}
      </div>
      <a className="gym-credit" href="/gym/credits">
        插图来源与署名
      </a>
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
        </Sheet>
      )}
    </>
  );
}
