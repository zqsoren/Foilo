"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Settings, Search, X } from "lucide-react";
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
    base = useRef(initial.revision),
    [busy, setBusy] = useState(false),
    busyRef = useRef(false),
    [closing, setClosing] = useState(false),
    [fresh, setFresh] = useState<Widget | null>(null),
    [removing, setRemoving] = useState<Widget | null>(null),
    [editor, setEditor] = useState<Widget | "settings" | null>(null),
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
      if (e.key === "Escape") void finish();
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
    setDraft([...live.current.settings.layout]);
  }
  const columns = width >= 1170 ? 3 : width >= 740 ? 2 : 1,
    scale = width / (columns * 600 + (columns - 1) * 15),
    layout = draft ?? data.settings.layout,
    trayScale = Math.min(1, win / 1912);
  const face = (kind: Widget) => (
    <WidgetFace kind={kind} data={data} catalog={catalog} edit={setEditor} />
  );
  return (
    <main
      className={
        "gx" + (draft ? " gx-editing" : "") + (closing ? " gx-closing" : "")
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
            <section
              className="gx-grid"
              aria-label="健身数据概览"
              style={{
                gridTemplateColumns: `repeat(${columns},minmax(0,1fr))`,
                gridAutoRows: 200 * scale,
                columnGap: 15 * scale,
                rowGap: 20 * scale,
              }}
            >
              {layout.map((kind) => {
                const [, w, h] = widgets[kind],
                  localScale = w > 600 && columns === 1 ? width / w : scale;
                return (
                  <div
                    key={kind}
                    className={
                      "gx-slot" +
                      (fresh === kind ? " gx-fresh" : "") +
                      (removing === kind ? " gx-removing" : "")
                    }
                    style={{
                      gridColumn: `span ${w > 600 && columns > 1 ? 2 : 1}`,
                      gridRow: `span ${columns === 1 && w > 600 ? 1 : (h + 20) / 220}`,
                    }}
                  >
                    <div
                      inert={draft !== null}
                      className="gx-scaled"
                      style={{ transform: `scale(${localScale})` }}
                    >
                      {face(kind)}
                    </div>
                    {draft && (
                      <button
                        className="gx-remove"
                        disabled={busy || closing || !!removing}
                        aria-label={"移除" + widgets[kind][0]}
                        onClick={() => {
                          setRemoving(kind);
                          setTimeout(() => {
                            setDraft(
                              (old) => old?.filter((k) => k !== kind) ?? null,
                            );
                            setRemoving(null);
                          }, 160);
                        }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
              {!layout.length && (
                <button className="gx-add-empty" onClick={begin}>
                  ＋ 添加小组件
                </button>
              )}
            </section>
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
            className="gx-tray"
            aria-label="添加小组件"
            aria-busy={busy}
            style={{ "--tray-scale": trayScale } as CSSProperties}
          >
            <i className="gx-handle" />
            <h2>{busy ? "正在保存布局…" : "添加小组件"}</h2>
            <div
              className="gx-shelf"
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
          title={
            editor === "settings"
              ? "设置"
              : editor === "exercise"
                ? "选择关注动作"
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
