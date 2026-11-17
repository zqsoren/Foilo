"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { ChevronDown, ChevronUp, Settings, X } from "lucide-react";
import {
  refreshBoard,
  updateBoard,
  type BoardCommand,
} from "@/app/todo/dashboard/actions";
import { shanghaiNow } from "@/lib/todo/model";
import { productVersions } from "@/lib/product-versions";
import {
  widgets,
  taskKey,
  type BoardData,
  type Widget,
} from "@/lib/todo/dashboard";
import { WidgetFace } from "./widgets";
import { TaskPopup, TaskSearch, AllTasks } from "./tasks";
import { type Editor } from "./controls";
import { useWidgetSort } from "./use-widget-sort";
import { reducedMotion, useAnimatedDismiss, useContentChange } from "./motion";

const choices: Widget[] = [
  "trend",
  "rates",
  "delays",
  "week",
  "today",
  "todo",
  "heat",
  "calendar",
];
type View = "board" | "tasks";
function measure(width: number) {
  const columns = width >= 1170 ? 3 : width >= 740 ? 2 : 1;
  return { columns, scale: width / (columns * 600 + (columns - 1) * 15) };
}
export function ScheduleBoard({
  name,
  initial,
  initialDay,
  initialView,
}: {
  name: string;
  initial: BoardData;
  initialDay: string;
  initialView: View;
}) {
  const [data, setData] = useState(initial),
    live = useRef(initial),
    queue = useRef(Promise.resolve());
  const [today, setToday] = useState(initialDay),
    [day, setDay] = useState(initialDay),
    [taskDay, setTaskDay] = useState(initialDay);
  const [view, setView] = useState<View>(initialView),
    [editor, setEditor] = useState<Editor | null>(null),
    [message, setMessage] = useState("");
  const [draft, setDraft] = useState<Widget[] | null>(null),
    layoutBase = useRef(0),
    closing = useRef(false);
  const [trayOpen, setTrayOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fresh, setFresh] = useState<Widget | null>(null),
    [highlight, setHighlight] = useState("");
  const [removing, setRemoving] = useState<Widget | null>(null);
  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (removeTimer.current) clearTimeout(removeTimer.current); }, []);
  const { exiting: trayExiting, requestDismiss: dismissTray } = useAnimatedDismiss(() => {
    setDraft(null);
    setFresh(null);
    closing.current = false;
  });
  const layout = draft ?? data.layout;
  const sort = useWidgetSort(layout, setDraft, draft !== null && !trayOpen && !saving && !trayExiting && !removing);
  const container = useRef<HTMLDivElement>(null),
    [width, setWidth] = useState(1200),
    [win, setWin] = useState(1440);
  useContentChange(container, view, ".dg-all, .dg-grid");
  const publish = useCallback((v: BoardData) => {
    live.current = v;
    setData(v);
  }, []);
  useEffect(() => {
    const host = container.current;
    if (!host) return;
    const size = () => {
      const style = getComputedStyle(host);
      setWidth(
        host.clientWidth -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight),
      );
      setWin(window.innerWidth);
    };
    const ro = new ResizeObserver(size);
    ro.observe(host);
    size();
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    // Old bookmarks arrive through a new URL to bypass cached reverse redirects.
    const current = new URL(location.href);
    if (current.searchParams.get("_folio_moved") === "1") {
      current.searchParams.delete("_folio_moved");
      history.replaceState(history.state, "", current);
    }
    const readView = () =>
      setView(
        new URLSearchParams(location.search).get("view") === "tasks"
          ? "tasks"
          : "board",
      );
    readView();
    window.addEventListener("popstate", readView);
    const sync = () => {
      if (document.visibilityState !== "visible") return;
      const nextDay = shanghaiNow().date;
      setToday((prev) => (prev === nextDay ? prev : nextDay));
      queue.current = queue.current
        .then(async () => publish(await refreshBoard()))
        .catch(() => {});
    };
    const timer = setInterval(sync, 60000);
    window.addEventListener("focus", sync);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", sync);
      window.removeEventListener("popstate", readView);
    };
  }, [publish]);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 6500);
    return () => clearTimeout(t);
  }, [message]);
  const commit = useCallback(
    (cmd: BoardCommand) => {
      let ok = false;
      const job = queue.current.then(async () => {
        try {
          const v = await updateBoard(
            cmd,
            cmd.action === "layout"
              ? layoutBase.current
              : live.current.revision,
            crypto.randomUUID(),
          );
          publish(v.data);
          if (v.error) {
            setMessage(v.error);
            return;
          }
          ok = true;
        } catch {
          setMessage("连接中断，请刷新后重试。");
        }
      });
      queue.current = job.catch(() => {});
      return job.then(() => ok);
    },
    [publish],
  );
  const finish = useCallback(async () => {
    if (!draft || closing.current || removing || sort.isDragging()) return;
    closing.current = true;
    setSaving(true);
    let dismissed = false;
    try {
      if (
        JSON.stringify(draft) === JSON.stringify(live.current.layout) ||
        (await commit({ action: "layout", layout: draft }))
      ) {
        dismissed = true;
        dismissTray();
      } else if (layoutBase.current !== live.current.layoutRevision) {
        layoutBase.current = live.current.layoutRevision;
        setDraft([...live.current.layout]);
      }
    } finally {
      if (!dismissed) closing.current = false;
      setSaving(false);
    }
  }, [draft, commit, sort, removing, dismissTray]);
  useEffect(() => {
    if (!draft) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") void finish();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [draft, finish]);
  const navigate = (next: View) => {
    if (next === view) return;
    setView(next);
    const url = new URL(location.href);
    if (next === "tasks") url.searchParams.set("view", "tasks");
    else url.searchParams.delete("view");
    history.pushState(null, "", url);
  };
  const begin = () => {
    layoutBase.current = live.current.layoutRevision;
    setDraft([...live.current.layout]);
    setTrayOpen(true);
  };
  const { columns, scale } = measure(width);
  const trayScale = Math.min(1, win / 1912),
    card = (kind: Widget) => (
      <WidgetFace
        kind={kind}
        data={data}
        today={today}
        day={day}
        select={setDay}
        commit={commit}
        edit={setEditor}
      />
    );
  const candidates = choices.filter((w) => !layout.includes(w));
  return (
    <main className={"dg dg-board" + (draft ? " dg-editing" : "") + (draft && !trayOpen ? " dg-sorting" : "")}>
      <div ref={container} className="dg-content" data-view={view}>
        <header className="dg-toolbar" inert={draft !== null}>
          <strong className="dg-user">{name}</strong>
          <nav className="dg-view-tabs" aria-label="日程页面" data-selected={view}>
            {(["board", "tasks"] as const).map((v, i) => (
              <button
                key={v}
                aria-pressed={view === v}
                onClick={() => navigate(v)}
              >
                {["数据概览", "所有任务"][i]}
              </button>
            ))}
          </nav>
          <div className="dg-tools">
            {view === "tasks" && (
              <TaskSearch
                data={data}
                day={taskDay}
                choose={(e) => {
                  setTaskDay(e.date);
                  setHighlight(taskKey(e));
                }}
              />
            )}
            <button
              className={view === "tasks" ? "dg-add-task" : "dg-edit"}
              onClick={() =>
                view === "tasks"
                  ? setEditor({ kind: "new", date: taskDay })
                  : begin()
              }
            >
              {view === "tasks" ? "添加任务" : "编辑页面"}
            </button>
            <button
              aria-label="设置"
              onClick={() => setEditor({ kind: "settings" })}
            >
              <Settings size={21} />
            </button>
          </div>
        </header>
        {view === "tasks" ? (
          <AllTasks
            data={data}
            today={today}
            day={taskDay}
            select={(d) => {
              setTaskDay(d);
              setHighlight("");
            }}
            highlight={highlight}
            commit={commit}
            edit={setEditor}
          />
        ) : (
          <>
            <section
              className="dg-grid"
              aria-label="数据概览小组件"
              style={{
                gridTemplateColumns: "repeat(" + columns + ", minmax(0,1fr))",
                gridAutoRows: 200 * scale,
                columnGap: 15 * scale,
                rowGap: 20 * scale,
              }}
            >
              {layout.map((kind) => {
                const [, w, h] = widgets[kind],
                  span = w > 600 && columns > 1 ? 2 : 1;
                const localScale = w > 600 && columns === 1 ? width / w : scale;
                return (
                  <div
                    key={kind}
                    ref={(node) => { if (node) sort.slots.current.set(kind, node); else sort.slots.current.delete(kind); }}
                    data-widget={kind}
                    className={
                      "dg-slot " + (fresh === kind ? "dg-appeared " : "") + (removing === kind ? "dg-removing " : "") + (sort.dragging === kind ? "dg-dragging" : "")
                    }
                    style={{
                      gridColumn: "span " + span,
                      gridRow: "span " + (h === 420 ? 2 : 1),
                    }}
                  >
                    <div className="dg-sortable">
                    <div
                      inert={draft !== null}
                      className="dg-scaled"
                      style={{ transform: "scale(" + localScale + ")" }}
                    >
                      {card(kind)}
                    </div>
                    {draft && !trayOpen && (
                      <button
                        className="dg-drag-handle"
                        aria-label={"拖动排序：" + widgets[kind][0]}
                        aria-describedby="dg-sort-help"
                        disabled={saving || trayExiting || removing !== null}
                        onPointerDown={(e) => sort.pointerDown(e, kind)}
                        onKeyDown={(e) => {
                          if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
                            e.preventDefault();
                            sort.keyboardMove(kind, e.key);
                          }
                        }}
                      />
                    )}
                    {draft && (
                      <button
                        className="dg-remove"
                        aria-label={"移除" + widgets[kind][0]}
                        disabled={saving || trayExiting || removing !== null || sort.dragging !== null}
                        onClick={() => {
                          if (closing.current || removeTimer.current) return;
                          setRemoving(kind);
                          removeTimer.current = setTimeout(() => {
                            sort.capture();
                            setDraft((v) => v?.filter((k) => k !== kind) ?? null);
                            setRemoving(null);
                            removeTimer.current = null;
                          }, reducedMotion() ? 0 : 160);
                        }}
                      >
                        <X size={14} />
                      </button>
                    )}
                    </div>
                  </div>
                );
              })}
            </section>
            {!layout.length && !draft && (
              <button className="dg-empty-board" onClick={begin}>
                ＋ 添加小组件
              </button>
            )}
          </>
        )}
        <footer className="dg-footer" inert={draft !== null}>
          <small className="dg-version">TODO | {productVersions.todo}</small>
        </footer>
      </div>
      {draft && (
        <>
          <div
            className={"dg-scrim" + (trayExiting ? " dg-scrim-exiting" : "")}
            onClick={() => { if (!sort.suppressClick.current) void finish(); }}
            aria-label="收起并保存布局"
          />
          <aside
            className={"dg-tray" + (!trayOpen ? " dg-tray-collapsed" : "") + (trayExiting ? " dg-tray-exiting" : "")}
            aria-label="添加小组件"
            aria-busy={saving || trayExiting}
            inert={trayExiting}
            style={{ "--tray-scale": trayScale } as CSSProperties}
          >
            <i className="dg-handle" />
            <div className="dg-tray-heading">
              <h2>添加小组件</h2>
              <span className="dg-edit-hint" role="status">{saving ? "正在保存…" : trayOpen ? "收起后可拖动排序" : "拖动排序，点空白保存"}</span>
              <button className="dg-tray-toggle" aria-expanded={trayOpen} aria-controls="dg-widget-shelf" disabled={saving || removing !== null || sort.dragging !== null} onClick={() => setTrayOpen((v) => !v)}>
                {trayOpen ? "收起" : "展开"}{trayOpen ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
              </button>
            </div>
            <div id="dg-widget-shelf" inert={!trayOpen || saving} aria-hidden={!trayOpen}>
            {candidates.length ? (
              <div
                className="dg-shelf"
                onWheel={(e) => {
                  if (!e.deltaX && e.deltaY)
                    e.currentTarget.scrollLeft += e.deltaY;
                }}
              >
                {candidates.map((kind) => {
                  const [, w, h] = widgets[kind],
                    zoom = 0.85 * trayScale;
                  return (
                    <div
                      className="dg-sample"
                      key={kind}
                      style={{
                        width: w * zoom,
                        height: h * zoom,
                        gridRow: "span " + (h === 420 ? 2 : 1),
                      }}
                    >
                      <div
                        inert
                        aria-hidden
                        className="dg-scaled"
                        style={{ transform: "scale(" + zoom + ")" }}
                      >
                        {card(kind)}
                      </div>
                      <button
                        aria-label={"添加" + widgets[kind][0]}
                        disabled={saving || removing !== null}
                        onClick={() => {
                          if (!closing.current) {
                            sort.capture();
                            setFresh(kind);
                            setDraft((v) =>
                              v && !v.includes(kind) ? [...v, kind] : v,
                            );
                          }
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="dg-empty">所有小组件均已添加</p>
            )}
            </div>
          </aside>
          <span id="dg-sort-help" className="dg-sr-only">拖动卡片调整顺序，或聚焦后按方向键移动、Home 置首、End 置尾。Escape 取消拖动；点空白处保存并退出编辑。</span>
          <span className="dg-sr-only" role="status" aria-live="polite">{sort.announcement}</span>
        </>
      )}
      {editor && (
        <TaskPopup
          key={editor.kind + ("event" in editor ? taskKey(editor.event) : "")}
          data={data}
          model={editor}
          close={() => setEditor(null)}
          commit={commit}
        />
      )}
      {message && (
        <button
          className="dg-notice"
          role="alert"
          onClick={() => setMessage("")}
        >
          {message}
        </button>
      )}
    </main>
  );
}
