"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Settings, X } from "lucide-react";
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
  const [fresh, setFresh] = useState<Widget | null>(null),
    [highlight, setHighlight] = useState("");
  const container = useRef<HTMLDivElement>(null),
    [width, setWidth] = useState(1200),
    [win, setWin] = useState(1440);
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
    if (!draft || closing.current) return;
    closing.current = true;
    try {
      if (
        JSON.stringify(draft) === JSON.stringify(live.current.layout) ||
        (await commit({ action: "layout", layout: draft }))
      ) {
        setDraft(null);
        setFresh(null);
      } else {
        layoutBase.current = live.current.layoutRevision;
        setDraft([...live.current.layout]);
      }
    } finally {
      closing.current = false;
    }
  }, [draft, commit]);
  useEffect(() => {
    if (!draft) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") void finish();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [draft, finish]);
  const navigate = (next: View) => {
    setView(next);
    const url = new URL(location.href);
    if (next === "tasks") url.searchParams.set("view", "tasks");
    else url.searchParams.delete("view");
    history.pushState(null, "", url);
  };
  const begin = () => {
    layoutBase.current = live.current.layoutRevision;
    setDraft([...live.current.layout]);
  };
  const layout = draft ?? data.layout,
    { columns, scale } = measure(width);
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
    <main className={"dg dg-board" + (draft ? " dg-editing" : "")}>
      <div ref={container} className="dg-content" data-view={view}>
        <header className="dg-toolbar">
          <strong className="dg-user">{name}</strong>
          <nav className="dg-view-tabs" aria-label="日程页面">
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
                    className={
                      "dg-slot " + (fresh === kind ? "dg-appeared" : "")
                    }
                    style={{
                      gridColumn: "span " + span,
                      gridRow: "span " + (h === 420 ? 2 : 1),
                    }}
                  >
                    <div
                      inert={draft !== null}
                      className="dg-scaled"
                      style={{ transform: "scale(" + localScale + ")" }}
                    >
                      {card(kind)}
                    </div>
                    {draft && (
                      <button
                        className="dg-remove"
                        aria-label={"移除" + widgets[kind][0]}
                        onClick={() => {
                          if (!closing.current)
                            setDraft(
                              (v) => v?.filter((k) => k !== kind) ?? null,
                            );
                        }}
                      >
                        <X size={14} />
                      </button>
                    )}
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
        <footer className="dg-footer">
          <small className="dg-version">TODO | {productVersions.todo}</small>
          {view === "board" && (
            <nav className="dg-bottom" aria-label="模块导航">
              {["日程", "健康", "饮食", "记账", "＋"].map((s) => (
                <button aria-disabled="true" key={s}>
                  {s}
                </button>
              ))}
            </nav>
          )}
        </footer>
      </div>
      {draft && (
        <>
          <div
            className="dg-scrim"
            onClick={() => void finish()}
            aria-label="收起并保存布局"
          />
          <aside
            className="dg-tray"
            aria-label="添加小组件"
            style={{ "--tray-scale": trayScale } as CSSProperties}
          >
            <i className="dg-handle" />
            <h2>添加小组件</h2>
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
                        onClick={() => {
                          if (!closing.current) {
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
          </aside>
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
