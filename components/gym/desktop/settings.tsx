"use client";
import { useState } from "react";
import { Check, Search } from "lucide-react";
import { Thumb } from "../parts";
import {
  shiftMonth,
  shiftDay,
  weekStart,
  type DesktopData,
  type DesktopSettings,
  type Widget,
} from "@/lib/gym/desktop";
import type { Exercise } from "@/lib/gym/model";
import { Empty, useModalClose } from "./shared";
export function SettingsForm({
  kind,
  data,
  catalog,
  busy,
  save,
  period,
}: {
  kind: Widget;
  data: DesktopData;
  catalog: Exercise[];
  busy: boolean;
  save: (settings: DesktopSettings) => Promise<boolean>;
  period?: string;
}) {
  const dismiss = useModalClose();
  const [settings, setSettings] = useState(() =>
      structuredClone(data.settings),
    ),
    [source, setSource] = useState<number | null>(
      data.settings.focus?.planId ?? null,
    ),
    [search, setSearch] = useState(""),
    [region, setRegion] = useState("全部"),
    [exerciseId, setExerciseId] = useState(
      data.settings.focus?.exerciseId ?? 0,
    );
  const month = period?.length === 7 ? period : data.today.slice(0, 7),
    week = period?.length === 10 ? period : weekStart(data.today),
    plans = data.plans;
  const selectedPlan = plans.find((p) => p.id === source),
    ids = selectedPlan
      ? new Set([
          ...selectedPlan.items.map((i) => i.exerciseId),
          ...data.items
            .filter((i) =>
              data.sessions.some(
                (w) => w.id === i.workoutId && w.planId === source,
              ),
            )
            .map((i) => i.exerciseId),
        ])
      : null;
  const choices = catalog.filter(
    (e) =>
      (!ids || ids.has(e.id)) &&
      (region === "全部" || e.region === region) &&
      `${e.name} ${e.aliases} ${e.muscles} ${e.equipment}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  if (ids) {
    const order = new Map([...ids].map((id, index) => [id, index]));
    choices.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  }
  function setGoal(
    bucket: "monthGoals" | "weekGoals" | "planGoals",
    key: string,
    value: string,
  ) {
    setSettings((s) => {
      const next = { ...s[bucket] };
      if (value) next[key] = Number(value);
      else delete next[key];
      return { ...s, [bucket]: next };
    });
  }
  return (
    <form
      className={
        "gx-settings-form" + (kind === "exercise" ? " gx-focus-form" : "")
      }
      onSubmit={(e) => {
        e.preventDefault();
        void save(
          kind === "exercise"
            ? { ...settings, focus: { exerciseId, planId: source } }
            : settings,
        );
      }}
    >
      {kind === "exercise" ? (
        <>
          <div className="gx-picker">
            <aside>
              <small className="gx-picker-source-label">选择来源</small>
              <button
                type="button"
                aria-pressed={source === null}
                onClick={() => {
                  setSource(null);
                  setExerciseId(0);
                }}
              >
                动作库 <span aria-hidden>›</span>
              </button>
              <small className="gx-picker-plans-label">我的计划</small>
              <div className="gx-picker-plans">
                {plans.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    aria-pressed={source === p.id}
                    onClick={() => {
                      setSource(p.id);
                      setExerciseId(0);
                    }}
                  >
                    {p.name}
                    {p.archived ? " · 历史" : ""}
                  </button>
                ))}
              </div>
              <small className="gx-picker-hint">从计划快速找到常练动作</small>
            </aside>
            <section>
              <div className="gx-picker-heading">
                <h3>{selectedPlan?.name ?? "动作库"}</h3>
                <span>
                  {selectedPlan
                    ? `${selectedPlan.items.length} 个计划动作`
                    : "浏览全部动作"}
                </span>
                <label className="gx-search">
                  <Search size={17} />
                  <input
                    aria-label="搜索动作"
                    placeholder="搜索动作名称 / 器械"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              <div className="gx-filters">
                {[
                  "全部",
                  "胸部",
                  "背部",
                  "臀腿",
                  "肩部",
                  "手臂",
                  "腰腹／核心",
                  "有氧",
                ].map((r) => (
                  <button
                    type="button"
                    key={r}
                    aria-pressed={region === r}
                    onClick={() => setRegion(r)}
                  >
                    {r === "腰腹／核心" ? "核心" : r}
                  </button>
                ))}
              </div>
              <div className="gx-exercise-choices">
                {choices.map((ex) => (
                  <button
                    type="button"
                    key={ex.id}
                    aria-pressed={exerciseId === ex.id}
                    onClick={() => setExerciseId(ex.id)}
                  >
                    <Thumb exercise={ex} />
                    <span>
                      <strong>{ex.name}</strong>
                      <small>
                        {ex.region} · {ex.equipment}
                      </small>
                      <small>
                        {data.items.some((i) => i.exerciseId === ex.id)
                          ? `最近训练 ${
                              data.sessions
                                .find((w) =>
                                  data.items.some(
                                    (i) =>
                                      i.exerciseId === ex.id &&
                                      i.workoutId === w.id,
                                  ),
                                )
                                ?.day.slice(5)
                                .replace("-", ".") ?? ""
                            }`
                          : "暂无训练记录"}
                      </small>
                    </span>
                    {exerciseId === ex.id && (
                      <i className="gx-picker-check">
                        <Check size={12} />
                      </i>
                    )}
                  </button>
                ))}
                {!choices.length && <Empty>没有匹配的动作</Empty>}
              </div>
            </section>
          </div>
        </>
      ) : kind === "plans" ? (
        <>
          <p>选择最多三个计划，每行使用独立容量刻度。</p>
          {plans.map((p) => (
            <label className="gx-check" key={p.id}>
              <input
                type="checkbox"
                checked={(
                  settings.planIds ??
                  plans
                    .filter((p) => !p.archived)
                    .slice(0, 3)
                    .map((p) => p.id)
                ).includes(p.id)}
                onChange={(e) =>
                  setSettings((s) => {
                    const ids =
                      s.planIds ??
                      plans
                        .filter((p) => !p.archived)
                        .slice(0, 3)
                        .map((p) => p.id);
                    return {
                      ...s,
                      planIds: e.target.checked
                        ? [...ids, p.id].slice(0, 3)
                        : ids.filter((id) => id !== p.id),
                    };
                  })
                }
              />
              {p.name}
              {p.archived ? " · 历史" : ""}
            </label>
          ))}
        </>
      ) : kind === "phase" ? (
        <div className="gx-form-fields">
          <label>
            开始日期
            <input
              type="date"
              required
              value={settings.phase?.start ?? month + "-01"}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  phase: {
                    start: e.target.value,
                    end: s.phase?.end ?? shiftMonth(month, 3) + "-01",
                    target: s.phase?.target ?? 36,
                  },
                }))
              }
            />
          </label>
          <label>
            结束日期
            <input
              type="date"
              required
              value={settings.phase?.end ?? shiftMonth(month, 3) + "-01"}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  phase: {
                    start: s.phase?.start ?? month + "-01",
                    end: e.target.value,
                    target: s.phase?.target ?? 36,
                  },
                }))
              }
            />
          </label>
          <label>
            阶段训练次数
            <input
              type="number"
              min="1"
              max="10000"
              required
              value={settings.phase?.target ?? ""}
              placeholder="例如 36"
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  phase: {
                    start: s.phase?.start ?? month + "-01",
                    end: s.phase?.end ?? shiftMonth(month, 3) + "-01",
                    target: Number(e.target.value),
                  },
                }))
              }
            />
          </label>
          <small>最多设置一年；只统计阶段日期内已结束的训练。</small>
        </div>
      ) : kind === "planGoals" ? (
        <div className="gx-form-fields">
          {plans
            .filter((p) => !p.archived)
            .map((p) => (
              <label key={p.id}>
                {p.name} · 本月次数
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={settings.planGoals[month + ":" + p.id] ?? ""}
                  onChange={(e) =>
                    setGoal("planGoals", month + ":" + p.id, e.target.value)
                  }
                  placeholder="未设置"
                />
              </label>
            ))}
        </div>
      ) : (
        <label className="gx-form-fields">
          {kind === "week"
            ? `${week.slice(5).replace("-", ".")} 至 ${shiftDay(week, 6).slice(5).replace("-", ".")}`
            : "本月"}
          训练次数
          <input
            type="number"
            min="1"
            max="10000"
            required
            value={
              kind === "week"
                ? (settings.weekGoals[week] ?? "")
                : (settings.monthGoals[month] ?? "")
            }
            onChange={(e) =>
              setGoal(
                kind === "week" ? "weekGoals" : "monthGoals",
                kind === "week" ? week : month,
                e.target.value,
              )
            }
          />
        </label>
      )}
      <footer>
        {kind === "exercise" && (
          <>
            <div className="gx-picked">
              <small>已选动作</small>
              <strong>
                {catalog.find((e) => e.id === exerciseId)?.name ?? "请选择动作"}
              </strong>
            </div>
            <div className="gx-picker-scope">
              <small>动作图：Gym visual</small>
              <p>统计范围：{selectedPlan?.name ?? "全部计划"}</p>
            </div>
            <button
              type="button"
              className="gx-picker-cancel"
              disabled={busy}
              onClick={dismiss}
            >
              取消
            </button>
          </>
        )}
        <button
          className="gx-primary"
          disabled={busy || (kind === "exercise" && !exerciseId)}
        >
          {busy ? "正在保存…" : kind === "exercise" ? "关注此动作" : "保存设置"}
        </button>
      </footer>
    </form>
  );
}
