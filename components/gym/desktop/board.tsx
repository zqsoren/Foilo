"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Settings, Search, X, ChevronDown, ChevronUp } from "lucide-react";
import { refreshGymDesktop, saveGymDesktop } from "@/app/gym/dashboard/actions";
import { logoutAction } from "@/app/auth-actions";
import { productVersions } from "@/lib/product-versions";
import {
  widgets,
  widgetKeys,
  type Widget,
  type DesktopData,
  type DesktopSettings,
} from "@/lib/gym/desktop";
import type { Exercise } from "@/lib/gym/model";
import { WidgetFace } from "./widgets";
import { PlanView } from "./plans";
import { SettingsForm } from "./settings";
import { Modal, Empty } from "./shared";
import { EditableGrid } from "./editable-grid";
import { boardDimensions } from "@/lib/gym/desktop-layout";
export function GymDesktop({
  name,
  initial,
  catalog,
  initialView,
}: {
  name: string;
  initial: DesktopData;
  catalog: Exercise[];
  initialView: "board" | "plans";
}) {
  const [data, setData] = useState(initial),
    live = useRef(initial),
    [view, setView] = useState(initialView),
    [draft, setDraft] = useState<Widget[] | null>(null),
    [trayCollapsed, setTrayCollapsed] = useState(false),
    base = useRef(initial.revision),
    [busy, setBusy] = useState(false),
    busyRef = useRef(false),
    [closing, setClosing] = useState(false),
    [fresh, setFresh] = useState<Widget | null>(null),
    [removing, setRemoving] = useState<Widget | null>(null),
    [editor, setEditor] = useState<Widget | "settings" | null>(null),
    [editorPeriod, setEditorPeriod] = useState<string | undefined>(),
    [message, setMessage] = useState(""),
    [creating, setCreating] = useState(false),
    [search, setSearch] = useState(""),
    container = useRef<HTMLDivElement>(null),
    [width, setWidth] = useState(1830),
    [win, setWin] = useState(1912);
  const publish = useCallback((d: DesktopData) => {
      live.current = d;
      setData(d);
    }, []),
    notify = useCallback((s: string) => setMessage(s), []);
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setWidth(el.clientWidth);
      setWin(window.innerWidth);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const read = () =>
      setView(
        new URLSearchParams(location.search).get("view") === "plans"
          ? "plans"
          : "board",
      );
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 7000);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    if (draft || editor || busy) return;
    let cancelled = false;
    const refresh = () => {
      if (document.visibilityState === "visible")
        refreshGymDesktop()
          .then((d) => {
            if (!cancelled) publish(d);
          })
          .catch(() => {});
    };
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, 60000);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
    };
  }, [draft, editor, busy, publish]);
  const save = useCallback(
    async (settings: DesktopSettings, revision = live.current.revision) => {
      if (busyRef.current) return false;
      busyRef.current = true;
      setBusy(true);
      try {
        const result = await saveGymDesktop(
          settings,
          revision,
          crypto.randomUUID(),
        );
        publish(result.data);
        if (!result.ok) {
          notify(result.error);
          return false;
        }
        notify("已保存");
        return true;
      } catch {
        notify("连接中断，修改尚未保存，请重试");
        return false;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [publish, notify],
  );
  const finish = useCallback(async () => {
    if (!draft || closing || busyRef.current) return;
    const ok =
      JSON.stringify(draft) === JSON.stringify(live.current.settings.layout) ||
      (await save({ ...live.current.settings, layout: draft }, base.current));
    if (ok) {
      setClosing(true);
      setTimeout(() => {
        setDraft(null);
        setClosing(false);
        setFresh(null);
      }, 180);
    } else {
      base.current = live.current.revision;
    }
  }, [draft, closing, save]);
  useEffect(() => {
    if (!draft) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) void finish();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [draft, finish]);
  function navigate(next: "board" | "plans") {
    setView(next);
    setCreating(false);
    setSearch("");
    const url = new URL(location.href);
    if (next === "plans") url.searchParams.set("view", "plans");
    else url.searchParams.delete("view");
    history.pushState(null, "", url);
  }
  function begin() {
    base.current = live.current.revision;
    setTrayCollapsed(false);
    setDraft([...live.current.settings.layout]);
  }
  const openWidget = useCallback((kind: Widget, period?: string) => {
    setEditorPeriod(period);
    setEditor(kind);
  }, []);
  const { columns, scale, canvasWidth } = boardDimensions(width);
  const layout = draft ?? data.settings.layout,
    trayScale = Math.min(1, win / 1912);
  const face = (kind: Widget) => (
    <WidgetFace kind={kind} data={data} catalog={catalog} edit={openWidget} />
  );
  return (
    <main
      className={
        "gx" +
        (draft ? " gx-editing" : "") +
        (closing ? " gx-closing" : "") +
        (draft && trayCollapsed ? " gx-tray-collapsed" : "")
      }
    >
      <div className="gx-content">
        <header className="gx-toolbar">
          <strong className="gx-user">{name}</strong>
          <nav className="gx-tabs" aria-label="健身页面">
            <i
              style={{
                transform: `translateX(${view === "plans" ? "100%" : "0"})`,
              }}
            />
            {(["board", "plans"] as const).map((v, i) => (
              <button
                key={v}
                aria-pressed={view === v}
                onClick={() => navigate(v)}
              >
                {["数据概览", "训练计划"][i]}
              </button>
            ))}
          </nav>
          <div className="gx-tools">
            {view === "plans" && (
              <label className="gx-search">
                <Search size={16} />
                <input
                  aria-label="搜索计划或动作"
                  placeholder="搜索计划或动作"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            )}
            <button
              className="gx-edit-button"
              onClick={() => (view === "board" ? begin() : setCreating(true))}
            >
              {view === "board" ? "编辑页面" : "新建计划"}
            </button>
            <button aria-label="设置" onClick={() => setEditor("settings")}>
              <Settings size={21} />
            </button>
          </div>
        </header>
        <div ref={container}>
          {view === "board" ? (
            <EditableGrid
              layout={layout}
              columns={columns}
              scale={scale}
              canvasWidth={canvasWidth}
              editing={draft !== null}
              editable={
                draft !== null &&
                trayCollapsed &&
                !busy &&
                !closing &&
                !removing
              }
              busy={busy || closing}
              fresh={fresh}
              removing={removing}
              face={face}
              change={(next) => setDraft((old) => (old ? next : old))}
              empty={begin}
              remove={(kind) => {
                setRemoving(kind);
                setTimeout(() => {
                  setDraft((old) => old?.filter((k) => k !== kind) ?? null);
                  setRemoving(null);
                }, 160);
              }}
            />
          ) : (
            <PlanView
              data={data}
              catalog={catalog}
              publish={publish}
              notify={notify}
              creating={creating}
              onCreate={() => setCreating(true)}
              onCancel={() => setCreating(false)}
              search={search}
            />
          )}
        </div>
        <footer className="gx-footer">
          <small>GYM | {productVersions.gym}</small>
          <nav aria-label="模块导航">
            <a href="/todo/dashboard">日程</a>
            <a href="/gym?device=mobile">手机训练</a>
          </nav>
        </footer>
      </div>
      {draft && (
        <>
          <button
            className="gx-scrim"
            disabled={busy}
            onClick={() => void finish()}
            aria-label="收起并保存布局"
          />
          <aside
            className={"gx-tray" + (trayCollapsed ? " gx-tray--collapsed" : "")}
            aria-label="添加小组件"
            aria-busy={busy}
            style={{ "--tray-scale": trayScale } as CSSProperties}
          >
            <i className="gx-handle" />
            <div className="gx-tray-heading">
              <h2>{busy ? "正在保存布局…" : "添加小组件"}</h2>
              {trayCollapsed && (
                <small className="gx-edit-hint">拖动卡片调整位置</small>
              )}
              <button
                className="gx-tray-toggle"
                aria-label={trayCollapsed ? "展开组件栏" : "收起组件栏"}
                aria-expanded={!trayCollapsed}
                aria-controls="gx-widget-shelf"
                disabled={busy || closing}
                onClick={() => setTrayCollapsed((old) => !old)}
              >
                {trayCollapsed ? (
                  <ChevronUp size={17} />
                ) : (
                  <ChevronDown size={17} />
                )}
                {trayCollapsed ? "展开" : "收起"}
              </button>
            </div>
            <div
              id="gx-widget-shelf"
              className="gx-shelf"
              inert={trayCollapsed}
              onWheel={(e) => {
                if (!e.deltaX && e.deltaY)
                  e.currentTarget.scrollLeft += e.deltaY;
              }}
            >
              {widgetKeys
                .filter((k) => !layout.includes(k))
                .map((kind) => {
                  const [, w, h] = widgets[kind],
                    zoom = Math.min(0.85, 357 / h) * trayScale;
                  return (
                    <div
                      key={kind}
                      className="gx-sample"
                      style={{
                        width: w * zoom,
                        height: h * zoom,
                        gridRow: `span ${h <= 200 ? 1 : 2}`,
                      }}
                    >
                      <div
                        inert
                        className="gx-scaled"
                        aria-hidden
                        style={{ transform: `scale(${zoom})` }}
                      >
                        {face(kind)}
                      </div>
                      <button
                        aria-label={"添加" + widgets[kind][0]}
                        disabled={busy || closing}
                        onClick={() => {
                          setFresh(kind);
                          setDraft((old) =>
                            old && !old.includes(kind) ? [...old, kind] : old,
                          );
                        }}
                      />
                    </div>
                  );
                })}
              {layout.length === widgetKeys.length && (
                <Empty>所有小组件均已添加</Empty>
              )}
            </div>
          </aside>
        </>
      )}
      {editor && (
        <Modal
          busy={busy}
          variant={editor === "exercise" ? "focus" : undefined}
          description={
            editor === "exercise"
              ? "从动作库浏览，也可以从自己的计划里快速找到"
              : undefined
          }
          title={
            editor === "settings"
              ? "设置"
              : editor === "exercise"
                ? "选择关注动作"
                : editor === "week"
                  ? "周训练目标"
                  : widgets[editor][0]
          }
          close={() => {
            if (!busy) setEditor(null);
          }}
        >
          {message && message !== "已保存" && (
            <p className="gx-form-error" role="alert">
              {message}
            </p>
          )}
          {editor === "settings" ? (
            <div className="gx-account">
              <p>{name}</p>
              <p>健身 {productVersions.gym}</p>
              <a href="/gym?device=mobile">打开手机训练</a>
              <a href="/gym/credits">动作图片与模型署名</a>
              <form action={logoutAction}>
                <button>退出登录</button>
              </form>
            </div>
          ) : (
            <SettingsForm
              kind={editor}
              period={editorPeriod}
              data={data}
              catalog={catalog}
              busy={busy}
              save={async (s) => {
                const ok = await save(s);
                if (ok) setEditor(null);
                return ok;
              }}
            />
          )}
        </Modal>
      )}
      {message && (
        <div className="gx-notice" role="status">
          {message}
          <button aria-label="关闭提示" onClick={() => setMessage("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </main>
  );
}
