"use client";
import Image from "next/image";
import { CalendarDays, Dumbbell, LayoutGrid, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { changeGym, readGym, readWorkout } from "@/app/gym/actions";
import { loginUrl } from "@/lib/login-routing";
import type { Command } from "@/lib/gym/commands";
import type {
  Dashboard,
  Exercise,
  Plan,
  PlanItem,
  Workout,
} from "@/lib/gym/model";
import { TrainingSet } from "./training-set";
import { totals } from "@/lib/gym/model";
import { Diary, Overview } from "./diary";
import { Library } from "./library";
import { GymTitle, Elapsed, Sheet, Thumb } from "./parts";
type View =
  | "home"
  | "browse"
  | "plan"
  | "append"
  | "edit"
  | "work"
  | "diary"
  | "stats"
  | "overview";
type Dialog = "name" | "note" | "delete" | "finish" | null;

export default function GymApp({
  initial,
  catalog,
  device,
}: {
  initial: Dashboard;
  catalog: Exercise[];
  device: "mobile" | "desktop";
}) {
  const [data, update] = useState(initial),
    [view, setView] = useState<View>(device === "desktop" ? "stats" : "home");
  const [selectedDay, selectDay] = useState(initial.today);
  const [dialog, show] = useState<Dialog>(null),
    [busy, setBusy] = useState(false),
    [message, say] = useState("");
  const [picked, select] = useState<number[]>([]),
    [draftItems, setDraftItems] = useState<PlanItem[]>([]),
    [draftName, setName] = useState(""),
    [editId, setEditId] = useState<number | null>(null);
  const [note, setNote] = useState(""),
    [detail, setDetail] = useState<Workout | null>(null),
    [finished, setFinished] = useState(false);
  const [focused, focus] = useState<number | null>(null);
  const inflight = useRef(false),
    pending = useRef<{ payload: string; key: string } | null>(null),
    generation = useRef(0);
  const active = data.active;
  const byId = new Map(catalog.map((e) => [e.id, e]));
  const go = (v: View) => {
    generation.current++;
    show(null);
    say("");
    setView(v);
    window.scrollTo(0, 0);
  };
  const login = () => window.location.assign(loginUrl("/gym?device=" + device));
  const report = (e: unknown) => {
    say(e instanceof Error ? e.message : "连接失败，请重试");
  };
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => say(""), 7000);
    return () => clearTimeout(id);
  }, [message]);
  async function send(
    command: Command,
    after?: (id: number, next: Dashboard) => void | Promise<void>,
  ) {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    say("");
    generation.current++;
    const payload = JSON.stringify(command);
    if (pending.current?.payload !== payload)
      pending.current = { payload, key: crypto.randomUUID() };
    try {
      const result = await changeGym(pending.current.key, data.month, command);
      pending.current = null;
      if (!result.ok) {
        say(result.message);
        if (result.login) login();
        else if (result.message.includes("已更新")) {
          const fresh = await readGym(data.month);
          update(fresh);
          show(null);
          if (!fresh.active && view === "work") setView("home");
        }
        return;
      }
      update(result.data);
      await after?.(result.id, result.data);
    } catch (e) {
      report(e);
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }
  async function changeMonth(month: string) {
    const gen = ++generation.current;
    try {
      const next = await readGym(month);
      if (gen === generation.current) update(next);
    } catch (e) {
      report(e);
    }
  }
  async function openRecord(id: number, justFinished = false) {
    const gen = ++generation.current;
    try {
      const w = await readWorkout(id);
      if (gen !== generation.current) return;
      setDetail(w);
      selectDay(w.day);
      setFinished(justFinished);
      go("overview");
    } catch (e) {
      report(e);
    }
  }
  function openPicker(v: "plan" | "append", edit = false) {
    select(edit ? draftItems.map((i) => i.exerciseId) : []);
    if (v === "plan" && !edit) {
      setEditId(null);
      setName("");
      setDraftItems([]);
    }
    go(v);
  }
  function openEdit(p: Plan) {
    setEditId(p.id);
    setName(p.name);
    setDraftItems(p.items);
    go("edit");
  }
  async function savePlan(items: PlanItem[]) {
    const previous = data.plans.find((p) => p.id === editId);
    await send(
      {
        type: "savePlan",
        name: draftName,
        items,
        planId: previous?.id,
        revision: previous?.revision,
      },
      () => {
        go("home");
        say("计划已保存");
      },
    );
  }
  async function selectedDone() {
    if (!picked.length) return;
    if (view === "append" && active) {
      await send(
        {
          type: "append",
          workoutId: active.id,
          revision: active.revision,
          exerciseIds: picked,
        },
        (_, next) => {
          go("work");
          focus(
            next.active?.items.find((i) => i.exerciseId === picked[0])?.id ??
              null,
          );
        },
      );
      return;
    }
    const items = picked.map((exerciseId) => ({
      exerciseId,
      sets: draftItems.find((i) => i.exerciseId === exerciseId)?.sets ?? 3,
    }));
    setDraftItems(items);
    if (editId) {
      go("edit");
    } else {
      show("name");
    }
  }
  function begin(p: Plan) {
    if (active) {
      if (active.planId !== p.id) {
        say("已有进行中的训练，可从「继续训练」恢复");
        return;
      }
      go("work");
      return;
    }
    void send({ type: "start", planId: p.id }, (_, next) => {
      focus(next.active?.items[0]?.id ?? null);
      go("work");
    });
  }
  function toggle(id: number) {
    select((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  }
  function planItems(index: number, delta: number) {
    const next = [...draftItems],
      dest = index + delta;
    if (dest < 0 || dest >= next.length) return;
    [next[index], next[dest]] = [next[dest], next[index]];
    setDraftItems(next);
  }
  const planBusy = busy || !draftName.trim() || !draftItems.length;
  const isDiary = view === "diary" || view === "stats";
  const navVisible = view === "home" || isDiary;
  return (
    <main className="gym" data-device={device}>
      <section className="gym-page" aria-busy={busy}>
        {view === "home" && (
          <>
            <header className="gym-home-heading">
              <Image src="/folio/gym-mark.svg" alt="在侧健身" width={49} height={53} unoptimized />
              <GymTitle name="我的计划" />
            </header>
            <div className="gym-plans">
              {data.plans.map((p) => (
                <article className="plan-card" key={p.id}>
                  <button
                    className="plan-start"
                    disabled={busy}
                    onClick={() => begin(p)}
                    aria-label={"开始" + p.name}
                  >
                    <strong>{p.name}</strong>
                    <small>
                      {p.items.length} 个动作 ·{" "}
                      {p.items.reduce((n, i) => n + i.sets, 0)} 组
                    </small>
                    <span className="plan-examples">
                      {p.items.slice(0, 3).map((i) => (
                        <span key={i.exerciseId}>
                          {byId.get(i.exerciseId)?.name}
                        </span>
                      ))}
                    </span>
                    <span className="plan-play">▶</span>
                  </button>
                  <button
                    className="plan-edit"
                    aria-label={"编辑" + p.name}
                    onClick={() => openEdit(p)}
                  >
                    <Pencil size={15} aria-hidden="true" />
                  </button>
                </article>
              ))}
            </div>
            {!data.plans.length && (
              <p className="gym-muted">把常练的动作放进第一个计划。</p>
            )}
            <button
              className="primary new-plan"
              onClick={() => openPicker("plan")}
            >
              ＋　新建计划
            </button>
            {active && (
              <button className="gym-resume" onClick={() => go("work")}>
                <span>{active.name} · 训练中</span>
                <b>继续训练 ›</b>
              </button>
            )}
          </>
        )}
        {(view === "browse" || view === "plan" || view === "append") && (
          <Library
            key={view}
            purpose={view === "append" ? "training" : view}
            catalog={catalog}
            selected={picked}
            blocked={
              view === "append"
                ? (active?.items.map((i) => i.exerciseId) ?? [])
                : []
            }
            onToggle={toggle}
            busy={busy}
            onDone={selectedDone}
            onBack={() =>
              go(
                view === "append"
                  ? "work"
                  : view === "plan" && editId
                    ? "edit"
                    : "home",
              )
            }
          />
        )}
        {view === "edit" && (
          <>
            <button className="text" onClick={() => go("home")}>
              ‹ 我的计划
            </button>
            <header className="gym-heading">
              <GymTitle name="编辑计划" />
              <button
                className="primary compact"
                disabled={planBusy}
                onClick={() => savePlan(draftItems)}
              >
                保存
              </button>
            </header>
            <label className="gym-input">
              计划名称
              <input
                maxLength={50}
                value={draftName}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <h2>动作与目标组数</h2>
            {draftItems.map((it, i) => (
              <div className="gym-edit-row" key={it.exerciseId}>
                <b>{byId.get(it.exerciseId)?.name}</b>
                <div>
                  <button
                    aria-label="上移"
                    disabled={i === 0}
                    onClick={() => planItems(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    aria-label="下移"
                    disabled={i === draftItems.length - 1}
                    onClick={() => planItems(i, 1)}
                  >
                    ↓
                  </button>
                  <label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={it.sets}
                      onChange={(e) =>
                        setDraftItems(
                          draftItems.map((v, j) =>
                            j === i
                              ? { ...v, sets: Number(e.target.value) }
                              : v,
                          ),
                        )
                      }
                    />{" "}
                    组
                  </label>
                  <button
                    onClick={() =>
                      setDraftItems(draftItems.filter((_, j) => j !== i))
                    }
                  >
                    移除
                  </button>
                </div>
              </div>
            ))}
            <button className="wide" onClick={() => openPicker("plan", true)}>
              选择动作
            </button>
          </>
        )}
        {view === "work" && active && (
          <>
            <div className="gym-heading">
              <span className="gym-eyebrow">训练中</span>
              <button
                className="primary compact"
                onClick={() => show("finish")}
              >
                完成训练
              </button>
            </div>
            <header className="gym-heading">
              <h1>{active.name}</h1>
              <Elapsed since={active.started} />
            </header>
            <div className="gym-progress">
              <span>
                已完成 {totals(active).done} / {totals(active).total} 组
              </span>
              <b>{totals(active).volume.toLocaleString()} kg 容量</b>
            </div>
            {active.items.map((item) => {
              const expanded = item.id === (focused ?? active.items[0]?.id);
              return (
                <section className="gym-movement" key={item.id}>
                  <button
                    className="gym-ex"
                    onClick={() => focus(expanded ? -1 : item.id)}
                    aria-expanded={expanded}
                  >
                    <Thumb exercise={byId.get(item.exerciseId)} />
                    <span className="fill">
                      <b>{item.name}</b>
                      <small>
                        {item.temporary ? "本次新增 · " : ""}
                        {item.sets.filter((s) => s.done).length} /{" "}
                        {item.sets.length} 组
                      </small>
                    </span>
                    <span>{expanded ? "−" : "＋"}</span>
                  </button>
                  {expanded && (
                    <>
                      {item.sets.map((row, i) => <TrainingSet key={row.id} row={row}
                        number={i+1} mode={item.mode} busy={busy} message={message} canCopy={item.sets.length<30}
                        copy={() => send({ type:"copySet", workoutId:active.id, revision:active.revision, setId:row.id })}
                        save={(stages,done,after) => send({ type:"recordStages", workoutId:active.id,
                          revision:active.revision, setId:row.id, stages, done }, after)} />)}
                      <button
                        className="text"
                        disabled={busy || item.sets.length >= 30}
                        onClick={() =>
                          send({
                            type: "addSet",
                            itemId: item.id,
                            workoutId: active.id,
                            revision: active.revision,
                          })
                        }
                      >
                        ＋ 新增一组
                      </button>
                    </>
                  )}
                </section>
              );
            })}
            <div className="gym-dock">
              <button onClick={() => go("home")}>最小化</button>
              <button className="primary" onClick={() => openPicker("append")}>
                ＋ 加动作
              </button>
              <button
                onClick={() => {
                  setNote(active.note);
                  show("note");
                }}
              >
                写心得
              </button>
            </div>
          </>
        )}
        {isDiary && (
          <Diary
            data={data}
            selected={selectedDay}
            pick={selectDay}
            stats={view === "stats"}
            switchTab={(v) => go(v ? "stats" : "diary")}
            monthChange={changeMonth}
            open={(id) => openRecord(id)}
            busy={busy}
          />
        )}
        {view === "overview" && detail && (
          <Overview
            work={detail}
            catalog={catalog}
            remove={() => show("delete")}
            justFinished={finished}
            back={() => {
              go("diary");
              if (detail.day.slice(0, 7) !== data.month)
                void changeMonth(detail.day.slice(0, 7));
            }}
            home={() => go("home")}
          />
        )}
        {navVisible && (
          <nav className="gym-dock" aria-label="健身导航">
            {(["home", "diary", "browse"] as const).map((v, i) => (
              <button
                key={v}
                className={
                  view === v || (v === "diary" && isDiary) ? "current" : ""
                }
                onClick={() => go(v)}
              >
                {i === 0 ? (
                  <Dumbbell size={18} aria-hidden="true" />
                ) : i === 1 ? (
                  <CalendarDays size={18} aria-hidden="true" />
                ) : (
                  <LayoutGrid size={18} aria-hidden="true" />
                )}
                {["训练", "日历", "动作库"][i]}
              </button>
            ))}
          </nav>
        )}
        {dialog === "name" && (
          <Sheet title="计划名称" message={message} close={() => show(null)}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void savePlan(draftItems);
              }}
            >
              <label className="gym-input">
                已选 {draftItems.length} 个动作
                <input
                  autoFocus
                  required
                  maxLength={50}
                  placeholder="例如：上肢 A"
                  value={draftName}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <button className="primary wide" disabled={planBusy}>
                保存计划
              </button>
            </form>
          </Sheet>
        )}
        {dialog === "delete" && detail && <Sheet title="删除这次训练记录？" close={() => show(null)} message={message}>
          <p>{detail.day} · {detail.name}</p><p className="gym-muted">删除后无法恢复，当天的训练统计会同步更新。</p>
          <div className="gym-actions"><button disabled={busy} onClick={() => show(null)}>取消</button>
            <button disabled={busy} className="primary" onClick={() => send({ type:"deleteHistory",workoutId:detail.id,revision:detail.revision },
              () => { selectDay(detail.day); setDetail(null); go("diary"); })}>确认删除</button></div>
        </Sheet>}
        {dialog === "note" && active && (
          <Sheet title="训练心得" message={message} close={() => show(null)}>
            <textarea
              maxLength={2000}
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="记下这次训练的感受"
            />
            <button
              className="primary wide"
              disabled={busy}
              onClick={() =>
                send(
                  {
                    type: "note",
                    text: note,
                    workoutId: active.id,
                    revision: active.revision,
                  },
                  () => show(null),
                )
              }
            >
              保存心得
            </button>
          </Sheet>
        )}
        {dialog === "finish" && active && (
          <Sheet
            message={message}
            title={totals(active).done ? "完成本次训练？" : "还没有完成的组"}
            close={() => show(null)}
          >
            <p>
              {totals(active).done
                ? "将保存已完成的 " +
                  totals(active).done +
                  " 组，并保留未训练的动作。"
                : "可以继续记录，也可以放弃这次空训练。"}
            </p>
            <div className="gym-actions">
              <button onClick={() => show(null)}>继续训练</button>
              <button
                className="primary"
                disabled={busy}
                onClick={() => {
                  const finish = !!totals(active).done;
                  void send(
                    {
                      type: finish ? "finish" : "discard",
                      workoutId: active.id,
                      revision: active.revision,
                    },
                    async (id) => {
                      if (finish) await openRecord(id, true);
                      else go("home");
                    },
                  );
                }}
              >
                {totals(active).done ? "完成并查看总结" : "放弃空训练"}
              </button>
            </div>
          </Sheet>
        )}
        {message && !dialog && (
          <p className="gym-feedback" role="status">
            {message}
          </p>
        )}
      </section>
    </main>
  );
}
