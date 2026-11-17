"use client";
import { useEffect, useState } from "react";
import { Thumb } from "../parts";
import { readWorkout } from "@/app/gym/actions";
import { saveDesktopPlan } from "@/app/gym/dashboard/actions";
import {
  calendarDays,
  dateLabel,
  exerciseSeries,
  number,
  type DesktopData,
} from "@/lib/gym/desktop";
import {
  setLabel,
  type Exercise,
  type PlanItem,
  type Workout,
} from "@/lib/gym/model";
import { Chart, Empty } from "./shared";
export function PlanView({
  data,
  catalog,
  publish,
  notify,
  creating,
  onCreate,
  onCancel,
  search,
}: {
  data: DesktopData;
  catalog: Exercise[];
  publish: (d: DesktopData) => void;
  notify: (s: string) => void;
  creating: boolean;
  onCreate: () => void;
  onCancel: () => void;
  search: string;
}) {
  const [planId, setPlanId] = useState(data.plans[0]?.id ?? 0),
    [exerciseId, setExerciseId] = useState(0),
    [month, setMonth] = useState(data.today.slice(0, 7)),
    [version, setVersion] = useState("all"),
    [selectedDay, setSelectedDay] = useState(""),
    [selectedSessionId, setSelectedSessionId] = useState(0),
    [librarySearch, setLibrarySearch] = useState(""),
    [detail, setDetail] = useState<Workout | null>(null),
    [failedId, setFailedId] = useState(0),
    [name, setName] = useState(""),
    [items, setItems] = useState<PlanItem[]>([]),
    [region, setRegion] = useState("全部"),
    [busy, setBusy] = useState(false);
  const plan = data.plans.find((p) => p.id === planId),
    exId = exerciseId || plan?.items[0]?.exerciseId || 0,
    ex = catalog.find((e) => e.id === exId);
  const versions = [
    ...new Set(
      data.sessions
        .filter((w) => w.planId === planId)
        .map((w) => w.planRevision),
    ),
  ];
  const allSeries = exerciseSeries(data, exId, planId).filter(
    (r) =>
      r.session.day.startsWith(month) &&
      (version === "all" || String(r.session.planRevision) === version),
  );
  const completed = allSeries.filter((r) => r.sets > 0),
    last = completed.at(-1),
    previous = completed.at(-2),
    selected =
      allSeries.find((r) => r.session.id === selectedSessionId) ??
      [...allSeries].reverse().find((r) => r.session.day === selectedDay) ??
      last;
  const wid = selected?.session.id;
  const loading = !!wid && detail?.id !== wid && failedId !== wid;
  useEffect(() => {
    let cancelled = false;
    if (!wid) return;
    readWorkout(wid)
      .then((w) => {
        if (!cancelled) setDetail(w);
      })
      .catch(() => {
        if (!cancelled) {
          setFailedId(wid);
          notify("读取记录失败，请重新选择日期");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [wid, notify]);
  const record = detail?.id === wid ? detail : null,
    recordItems = record?.items.filter((i) => i.exerciseId === exId) ?? [];
  const selectPlan = (id: number) => {
    setPlanId(id);
    setExerciseId(0);
    setVersion("all");
    setSelectedDay("");
    setSelectedSessionId(0);
    onCancel();
  };
  async function save() {
    setBusy(true);
    try {
      const result = await saveDesktopPlan(
        { type: "savePlan", name, items },
        crypto.randomUUID(),
      );
      if (result.ok) {
        publish(result.data);
        setPlanId(result.id);
        setName("");
        setItems([]);
        onCancel();
        notify("计划已保存");
      } else notify(result.error);
    } catch {
      notify("连接中断，计划尚未保存");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="gx-plan-view">
      <aside className="gx-card gx-plan-list">
        <h2>我的计划</h2>
        <p className="gx-muted">全部计划</p>
        <button className="gx-outline" onClick={onCreate}>
          ＋ 新建计划
        </button>
        <div>
          {data.plans
            .filter(
              (p) =>
                p.name.includes(search) ||
                p.items.some((i) =>
                  catalog
                    .find((e) => e.id === i.exerciseId)
                    ?.name.includes(search),
                ),
            )
            .map((p) => (
              <button
                key={p.id}
                aria-pressed={!creating && planId === p.id}
                onClick={() => selectPlan(p.id)}
              >
                <strong>{p.name}</strong>
                <small>
                  {p.items.length} 个动作{p.archived ? " · 已归档" : ""} ·{" "}
                  {data.sessions.find((w) => w.planId === p.id)
                    ? "最近 " +
                      dateLabel(
                        data.sessions.find((w) => w.planId === p.id)!.day,
                      )
                    : "暂无训练"}
                </small>
              </button>
            ))}
        </div>
      </aside>
      <section className="gx-card gx-plan-actions">
        <h2>{creating ? "新计划" : (plan?.name ?? "选择计划")}</h2>
        {creating ? (
          <>
            <label>
              计划名称
              <input
                aria-label="计划名称"
                maxLength={50}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="gx-selected-actions">
              {items.map((i) => {
                const e = catalog.find((e) => e.id === i.exerciseId)!;
                return (
                  <div key={i.exerciseId}>
                    <Thumb exercise={e} />
                    <div>
                      <h3>{e.name}</h3>
                      <label>
                        组数
                        <input
                          aria-label={e.name + "组数"}
                          type="number"
                          min={1}
                          max={30}
                          value={i.sets}
                          onChange={(ev) =>
                            setItems((old) =>
                              old.map((x) =>
                                x.exerciseId === i.exerciseId
                                  ? { ...x, sets: Number(ev.target.value) }
                                  : x,
                              ),
                            )
                          }
                        />
                      </label>
                    </div>
                    <button
                      onClick={() =>
                        setItems((old) =>
                          old.filter((x) => x.exerciseId !== i.exerciseId),
                        )
                      }
                    >
                      移除
                    </button>
                  </div>
                );
              })}
            </div>
            <footer>
              <p>已选 {items.length} 个动作</p>
              <button onClick={onCancel}>取消</button>
              <button
                className="gx-primary"
                disabled={
                  busy ||
                  !name.trim() ||
                  !items.length ||
                  items.some((i) => i.sets < 1 || i.sets > 30)
                }
                onClick={() => void save()}
              >
                {busy ? "保存中…" : "保存计划"}
              </button>
            </footer>
          </>
        ) : (
          <>
            <p className="gx-muted">选择动作查看个人训练记录</p>
            <div>
              {[
                ...new Set([
                  ...(plan?.items.map((i) => i.exerciseId) ?? []),
                  ...data.items
                    .filter((i) =>
                      data.sessions.some(
                        (w) => w.id === i.workoutId && w.planId === planId,
                      ),
                    )
                    .map((i) => i.exerciseId),
                ]),
              ].map((id) => {
                const e = catalog.find((e) => e.id === id);
                return (
                  <button
                    className="gx-action-row"
                    key={id}
                    aria-pressed={exId === id}
                    onClick={() => {
                      setExerciseId(id);
                      setSelectedDay("");
                    }}
                  >
                    <Thumb exercise={e} />
                    <span>
                      <small>主练 · {e?.region}</small>
                      <strong>{e?.name ?? "历史动作"}</strong>
                    </span>
                  </button>
                );
              })}
            </div>
            <small className="gx-muted">历史数据以当前计划为范围</small>
          </>
        )}
      </section>
      <section className="gx-card gx-plan-detail" aria-busy={loading}>
        {creating ? (
          <>
            <header>
              <h1>动作库</h1>
              <small>© Gym visual · gymvisual.com</small>
            </header>
            <p className="gx-muted">为「{name || "新计划"}」选择动作</p>
            <div className="gx-library-search">
              <label>
                搜索动作
                <input
                  aria-label="搜索计划动作库"
                  placeholder="搜索动作、肌群或器械"
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                />
              </label>
              <div className="gx-filters">
                {[
                  "全部",
                  "胸部",
                  "背部",
                  "肩部",
                  "臀腿",
                  "手臂",
                  "腰腹／核心",
                  "有氧",
                ].map((r) => (
                  <button
                    key={r}
                    aria-pressed={region === r}
                    onClick={() => setRegion(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div className="gx-library-grid">
              {catalog
                .filter(
                  (e) =>
                    (region === "全部" || e.region === region) &&
                    `${e.name} ${e.aliases} ${e.muscles} ${e.equipment}`
                      .toLowerCase()
                      .includes((librarySearch || search).toLowerCase()),
                )
                .map((e) => (
                  <button
                    key={e.id}
                    aria-pressed={items.some((i) => i.exerciseId === e.id)}
                    onClick={() =>
                      setItems((old) =>
                        old.some((i) => i.exerciseId === e.id)
                          ? old.filter((i) => i.exerciseId !== e.id)
                          : [...old, { exerciseId: e.id, sets: 3 }],
                      )
                    }
                  >
                    <Thumb exercise={e} />
                    <span>
                      <strong>{e.name}</strong>
                      <small>
                        {e.muscles} · {e.equipment}
                      </small>
                    </span>
                    <small>
                      {items.some((i) => i.exerciseId === e.id)
                        ? "✓ 已选"
                        : "＋ 选择"}
                    </small>
                  </button>
                ))}
            </div>
          </>
        ) : ex ? (
          <>
            <header>
              <div>
                <h1>{ex.name}</h1>
                <p className="gx-muted">{plan?.name} 内的个人训练记录</p>
              </div>
              <label>
                月份
                <input
                  aria-label="详情月份"
                  type="month"
                  value={month}
                  onChange={(e) => {
                    if (e.target.value) {
                      setMonth(e.target.value);
                      setSelectedDay("");
                      setSelectedSessionId(0);
                    }
                  }}
                />
              </label>
            </header>
            <label className="gx-version">
              计划版本
              <select
                aria-label="计划版本"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              >
                <option value="all">全部版本</option>
                {versions.map((v) => (
                  <option key={String(v)} value={String(v)}>
                    {v === null ? "历史版本未记录" : "版本 " + v}
                  </option>
                ))}
              </select>
            </label>
            <div className="gx-detail-metrics">
              {[
                ["最近容量", last ? number(last.volume) : "–", "kg"],
                [
                  "较上次",
                  last && previous
                    ? number(last.volume - previous.volume)
                    : "–",
                  "kg",
                ],
                ["有完成组", completed.length, "场"],
                ["最近完成", last ? dateLabel(last.session.day) : "–", ""],
              ].map(([k, v, u]) => (
                <div key={k}>
                  <small>{k}</small>
                  <p>
                    <strong>{v}</strong> {u}
                  </p>
                </div>
              ))}
            </div>
            <div className="gx-detail-middle">
              <div>
                <h2>每次训练容量</h2>
                <p className="gx-muted">完成组外部容量 · kg</p>
                <Chart
                  points={completed
                    .slice(-8)
                    .map((r) => ({ day: r.session.day, volume: r.volume }))}
                />
              </div>
              <div>
                <h2>这个动作，哪天练了</h2>
                <div className="gx-record-calendar">
                  {"一二三四五六日".split("").map((d) => (
                    <b key={d}>{d}</b>
                  ))}
                  {calendarDays(month).map((day) => {
                    const matches = allSeries.filter(
                        (r) => r.session.day === day,
                      ),
                      done = matches.some((r) => r.sets > 0);
                    return (
                      <button
                        key={day}
                        disabled={!matches.length}
                        className={
                          (done ? "done " : matches.length ? "missed " : "") +
                          (day === selected?.session.day ? "selected " : "") +
                          (day.startsWith(month) ? "" : "outside")
                        }
                        title={
                          day +
                          (done
                            ? " · 有完成组"
                            : matches.length
                              ? " · 零完成组"
                              : " · 无本计划记录")
                        }
                        onClick={() => {
                          setSelectedDay(day);
                          setSelectedSessionId(0);
                        }}
                      >
                        {Number(day.slice(8))}
                      </button>
                    );
                  })}
                </div>
                <small className="gx-muted">
                  深灰：完成组 · 浅灰：零完成组
                </small>
              </div>
            </div>
            <div className="gx-detail-bottom">
              <div>
                <h2>
                  {selected
                    ? dateLabel(selected.session.day) + " · 逐组记录"
                    : "逐组记录"}
                </h2>
                {selected && (
                  <label className="gx-version">
                    当日训练
                    <select
                      aria-label="当日训练场次"
                      value={selected.session.id}
                      onChange={(e) =>
                        setSelectedSessionId(Number(e.target.value))
                      }
                    >
                      {allSeries
                        .filter((r) => r.session.day === selected.session.day)
                        .map((r) => (
                          <option key={r.session.id} value={r.session.id}>
                            {r.session.name} ·{" "}
                            {new Date(r.session.started).toLocaleTimeString(
                              "zh-CN",
                              {
                                timeZone: "Asia/Shanghai",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                {loading ? (
                  <Empty>正在读取…</Empty>
                ) : recordItems.length ? (
                  recordItems.map((i) => (
                    <div key={i.id}>
                      {i.sets
                        .filter((s) => s.done)
                        .map((s, j) => (
                          <p key={s.id}>
                            ● 第 {j + 1} 组 <span>{setLabel(i.mode, s)}</span>
                            {s.stages.map((v, k) => (
                              <small key={k}>↳ {setLabel(i.mode, v)}</small>
                            ))}
                          </p>
                        ))}
                      {!i.sets.some((s) => s.done) && (
                        <Empty>本次该动作零完成组</Empty>
                      )}
                    </div>
                  ))
                ) : (
                  <Empty />
                )}
              </div>
              <div>
                <h2>这次的动作心得</h2>
                {recordItems.some((i) => i.note) ? (
                  recordItems
                    .filter((i) => i.note)
                    .map((i) => <p key={i.id}>{i.note}</p>)
                ) : (
                  <Empty>本次没有填写心得</Empty>
                )}
              </div>
            </div>
          </>
        ) : (
          <Empty>选择计划中的动作，查看训练记录</Empty>
        )}
      </section>
    </div>
  );
}
