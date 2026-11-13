"use client";
import Image from "next/image";
import { GymNavigation } from "./navigation";
import { Pencil } from "lucide-react";
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
import { WorkoutLedger } from "./workout-ledger";
import { totals } from "@/lib/gym/model";
import { Diary, Overview } from "./diary";
import { Library } from "./library";
import { GymTitle, Sheet, Thumb } from "./parts";
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
  const [preview, setPreview] = useState<Plan | null>(null);
  const [noteItemId, setNoteItemId] = useState<number | null>(null);
  const [focused, focus] = useState<number | null>(null);
  const writeQueue = useRef(Promise.resolve()),
    lastWrite = useRef<{id:number;revision:number} | null>(null),
    failure = useRef(0),
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
    quiet = false,
  ) {
    const epoch = failure.current;
    if (!quiet) setBusy(true);
    const run = async () => {
      if (epoch !== failure.current) return;
      if ("workoutId" in command && lastWrite.current?.id === command.workoutId && command.revision < lastWrite.current.revision)
        command = {...command, revision:lastWrite.current.revision};

      say("");
      generation.current++;
      const payload = JSON.stringify(command);
      if (pending.current?.payload !== payload)
        pending.current = { payload, key: crypto.randomUUID() };
      try {
        const result = await changeGym(pending.current.key, data.month, command);
        pending.current = null;
        if (!result.ok) {
          failure.current++; lastWrite.current=null;
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
        lastWrite.current = result.data.active;
        update(result.data);
        await after?.(result.id, result.data);
      } catch (e) {
        report(e);
        failure.current++;
      }
    };
    const task = writeQueue.current.then(run);
    writeQueue.current = task.catch(() => {});
    try { await task; } finally { if (!quiet) setBusy(false); }
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
                    onClick={() => active ? begin(p) : setPreview(p)}
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
              <span aria-hidden="true">＋</span><Image unoptimized src="/folio/gym-titles/new-plan.svg" alt="新建计划" width={67} height={16}/>
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
            editing={!!editId}
            catalog={catalog}
            selected={picked}
            blocked={
              view === "append"
                ? (active?.items.map((i) => i.exerciseId) ?? [])
                : []
            }
            onToggle={toggle}
            busy={busy}
            navigate={go}
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
        {view === "work" && active && <WorkoutLedger active={active} catalog={byId} focused={focused} focus={focus}
          busy={busy} message={message} send={send} finish={()=>show("finish")} minimize={()=>go("home")}
          append={()=>openPicker("append")} note={(id,text)=>{setNoteItemId(id);setNote(text);show("note");}}/>}
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
          <GymNavigation current={isDiary ? "diary" : "home"} navigate={go} />
        )}
        {preview && <Sheet iconClose title={preview.name} close={()=>setPreview(null)}>
          <div className="plan-preview">
            <small>{preview.items.length} 个动作 | {preview.items.reduce((n,i)=>n+i.sets,0)} 组训练</small>
            {preview.items.map(i=><article key={i.exerciseId}><Thumb exercise={byId.get(i.exerciseId)}/><div><b>{byId.get(i.exerciseId)?.name}</b><small>{byId.get(i.exerciseId)?.region}</small></div><span className="preview-sets"><b>{i.sets}</b> 组</span></article>)}
          </div>
          <button disabled={busy} className="primary wide" aria-label="开始训练" onClick={()=>{setPreview(null);begin(preview);}}>STAR　→</button>
        </Sheet>}
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
        {dialog === "note" && active && noteItemId!==null && (
          <Sheet title={active.items.find(i=>i.id===noteItemId)?.name+" · 动作心得"} message={message} close={() => show(null)}>
            <textarea
              maxLength={2000}
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="记下本次做这个动作的感受"
            />
            <button
              className="primary wide"
              disabled={busy}
              onClick={() =>
                send(
                  {
                    type: "itemNote", itemId:noteItemId,
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
