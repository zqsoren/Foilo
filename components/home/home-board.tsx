"use client";

/* Native SVG images retain the exact exported Figma geometry. */
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { Check, LogOut, X } from "lucide-react";
import { logoutAction } from "@/app/auth-actions";
import { enableHomeModule } from "@/app/home-actions";
import { homeModules, moduleInfo, mondayOffset, type HeatDay, type HomeData, type HomeModule } from "@/lib/home/model";

function Heatmap({ days, monthly = false }: { days: HeatDay[]; monthly?: boolean }) {
  const offset = mondayOffset(days[0].date);
  const max = Math.max(1, ...days.map((day) => day.count));
  const label = monthly ? days[0].date.slice(0, 7) + " 当月训练热力图" : days[0].date.slice(0, 4) + " 年度生活记录热力图";
  return <div className={monthly ? "fh-month" : "fh-year"} role="img" aria-label={label} style={{ "--columns": Math.ceil((days.length + offset) / 7) } as CSSProperties}>
    {Array.from({ length: offset }, (_, i) => <i key={"empty" + i} className="fh-blank" aria-hidden="true" />)}
    {days.map((day) => <i key={day.date} data-date={day.date} data-future={day.future} data-level={day.count ? Math.max(1, Math.ceil(day.count / max * 4)) : 0}
      title={day.date + (day.future ? " · 尚未到来" : monthly ? (day.count ? " · 已训练" : " · 无训练记录") : ` · ${day.count}条记录`)} />)}
  </div>;
}

function AssetTrend({ points }: { points: HomeData["trend"] }) {
  const values = points.flatMap((point) => point.value === null ? [] : [point.value]);
  if (!values.length) return <p className="fh-no-trend">{points.length ? "资产走势暂不可用" : "尚无资产记录"}</p>;
  const min = Math.min(...values), max = Math.max(...values);
  const first = Date.parse(points[0].date), span = Math.max(1, Date.parse(points.at(-1)!.date) - first);
  const positions = points.map((point) => point.value === null ? null : {
    x: points.length === 1 ? 186 : 6 + (Date.parse(point.date) - first) / span * 360,
    y: min === max ? 126 : 225 - (point.value - min) / (max - min) * 180,
  });
  let path = "", connected = false;
  for (const p of positions) {
    if (!p) { connected = false; continue; }
    path += `${connected ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)} `;
    connected = true;
  }
  const last = [...positions].reverse().find((p) => p !== null);
  return <svg className="fh-trend" viewBox="0 0 372 253" role="img" aria-label="本年总资产变化">
    <path d={path} fill="none" stroke="currentColor" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    {last && <circle cx={last.x} cy={last.y} r="6" fill="#242424" />}
  </svg>;
}

export function HomeBoard({ name, data }: { name: string; data: HomeData }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false), [closing, setClosing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState<HomeModule | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const all = data.modules.length === homeModules.length;

  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; if (closeTimer.current) clearTimeout(closeTimer.current); };
  }, [open]);
  // Returning from a business module or another tab refreshes real account data,
  // including natural-month rollover. Never cache it in localStorage.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [router]);
  useEffect(() => {
    const nextMidnight = Date.parse(data.date + "T00:00:00+08:00") + 86400000;
    const timer = setTimeout(() => router.refresh(), Math.max(1000, nextMidnight - Date.now() + 1000));
    return () => clearTimeout(timer);
  }, [data.date, router]);

  function close() {
    if (closing) return;
    setClosing(true);
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180;
    closeTimer.current = setTimeout(() => { dialog.current?.close(); setOpen(false); setClosing(false); }, duration);
  }
  function enable(module: HomeModule) {
    if (pending) return;
    setAdding(module); setError("");
    startTransition(async () => {
      try {
        const result = await enableHomeModule(module);
        if (!result.ok) { setError(result.message ?? "添加失败，请重试"); return; }
        setMessage(`已添加${moduleInfo[module].name}`);
        router.refresh();
        close();
      } catch { setError("连接暂时中断，请重试"); }
      finally { setAdding(null); }
    });
  }

  return <div className="fh-shell">
    <header className="fh-header">
      <Link href="/" className="fh-brand" aria-label="在侧 Folio 主页"><img src="/folio/home/12-7789.svg" width="27" height="27" alt="" /><span>在侧 Folio</span></Link>
      <details className="fh-account"><summary aria-label={`${name}，账号菜单`}>{name}</summary><div><form action={logoutAction}><button type="submit"><LogOut size={16} />退出登录</button></form></div></details>
    </header>
    <main className="fh-board" data-full={all} data-count={data.modules.length} aria-label="个人主页">
      <section className="fh-card fh-life" aria-labelledby="fh-life-title">
        <h1 id="fh-life-title">生活留痕</h1>
        <Heatmap days={data.life} />
      </section>
      {data.modules.map((module) => {
        const info = moduleInfo[module];
        return <Link key={module} href={info.href} className={`fh-card fh-module fh-${module}`} aria-label={`打开${info.name}`}>
          <div className="fh-card-heading"><img src={info.icon} width="40" height="40" alt="" /><h2>{info.name}</h2><img className="fh-arrow" src={module === "gym" ? "/folio/home/12-8207.svg" : "/folio/home/12-8243.svg"} width="24" height="24" alt="" /></div>
          {module === "gym" ? <Heatmap days={data.gym} monthly /> : module === "wealth" ? <AssetTrend points={data.trend} /> : <span className="fh-count" aria-label={`本年已完成${data.completed}项日程`}>{data.completed.toLocaleString("en-US")}</span>}
          <span className="fh-open">打开{info.name}</span>
        </Link>;
      })}
      <button className="fh-card fh-add" onClick={() => { setError(""); setOpen(true); }} aria-haspopup="dialog">
        <img src="/folio/home/12-8265.svg" width="145" height="145" alt="" />
        <span><strong>添加板块</strong><span>让生活，继续展开。</span></span>
      </button>
    </main>
    <p className="fh-announcement" role="status" aria-live="polite">{message}</p>
    <dialog ref={dialog} className="fh-dialog" data-closing={closing} aria-labelledby="fh-picker-title" onCancel={(e) => { e.preventDefault(); close(); }} onClick={(e) => {
      if (e.target !== e.currentTarget) return;
      const rect = e.currentTarget.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) close();
    }}>
      <button className="fh-close" onClick={close} aria-label="关闭"><X size={22} /></button>
      <h2 id="fh-picker-title">添加板块</h2>
      <div className="fh-picker-list">{homeModules.map((module) => <button key={module} disabled={pending || data.modules.includes(module)} onClick={() => enable(module)}>
        <img src={moduleInfo[module].icon} width="40" height="40" alt="" className={module === "gym" ? "fh-picker-gym" : ""} />
        <span><strong>{moduleInfo[module].name}</strong><small>{moduleInfo[module].description}</small></span>
        {data.modules.includes(module) ? <span className="fh-enabled"><Check size={16} />已添加</span> : <span>{adding === module ? "添加中…" : "添加"}</span>}
      </button>)}</div>
      {all && <p className="fh-picker-note">已添加全部板块。</p>}
      {error && <p className="fh-error" role="alert">{error}</p>}
    </dialog>
  </div>;
}
