"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { productVersions } from "@/lib/product-versions";
import { Plus, RefreshCw, ArrowLeft } from "lucide-react";
import { refreshWealth, writeWealth } from "@/app/wealth/dashboard/actions";
import type { WealthData } from "@/lib/wealth/read";
import type { WealthCommand } from "@/lib/wealth/store";
import { WealthOverview } from "./overview";
import { WealthList } from "./list";
import { WealthEntryForm, BalanceDialog } from "./entry";

export type View = "overview" | "wealth" | "entry";
export type Save = (command: WealthCommand) => Promise<boolean>;
export function WealthBoard({
  name,
  initial,
  initialView,
  initialAccountId,
}: {
  name: string;
  initial: WealthData;
  initialView: View;
  initialAccountId: number | null;
}) {
  const [data, setData] = useState(initial),
    [view, setView] = useState<View>(initialView);
  const [selected, setSelected] = useState<number | null>(
    initial.positions[0]?.id ?? null,
  );
  const [addTo, setAddTo] = useState<number | null>(
      initial.accounts.some((a) => a.id === initialAccountId)
        ? initialAccountId
        : null,
    ),
    [record, setRecord] = useState<number | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const request = useRef<{ payload: string; id: string } | null>(null);
  const locked = useRef(false);
  const dirty = useRef(false);
  const [entryKey, setEntryKey] = useState(0);
  const onDirty = useCallback((v: boolean) => {
    dirty.current = v;
  }, []);
  function navigate(next: View, accountId: number | null = null) {
    if (locked.current) return;
    if (dirty.current && !window.confirm("放弃尚未保存的内容？")) return;
    dirty.current = false;
    if (next === "entry") {
      setEntryKey((k) => k + 1);
      setAddTo(accountId);
    }
    setView(next);
    setError("");
    setMessage("");
    window.history.pushState(
      null,
      "",
      "/wealth/dashboard" +
        (next === "overview" ? "" : "?view=" + next) +
        (next === "entry" && accountId ? "&account=" + accountId : ""),
    );
  }
  useEffect(() => {
    function beforeUnload(e: BeforeUnloadEvent) {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", beforeUnload);
    function back() {
      if (dirty.current && !window.confirm("放弃尚未保存的内容？")) {
        window.history.pushState(null, "", "/wealth/dashboard?view=entry");
        return;
      }
      dirty.current = false;
      const v = new URLSearchParams(location.search).get("view");
      setView(v === "entry" ? "entry" : v === "wealth" ? "wealth" : "overview");
      const account = Number(
        new URLSearchParams(location.search).get("account"),
      );
      setAddTo(account || null);
    }
    window.addEventListener("popstate", back);
    return () => {
      window.removeEventListener("popstate", back);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);
  async function refresh() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      setData(await refreshWealth());
      setMessage("已刷新最新记录，表单内容已保留");
    } catch {
      setError("刷新失败，请检查网络或重新登录；当前填写内容已保留");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  const save: Save = async (command) => {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    const payload = JSON.stringify(command);
    if (request.current?.payload !== payload)
      request.current = { payload, id: crypto.randomUUID() };
    try {
      const result = await writeWealth(command, request.current!.id);
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      setData(result.data);
      if (
        command.type === "create-account" ||
        command.type === "edit-account"
      ) {
        setAddTo(result.accountId);
        window.history.replaceState(
          null,
          "",
          "/wealth/dashboard?view=entry&account=" + result.accountId,
        );
      } else if (command.type === "delete-asset") {
        setSelected(
          result.data.positions.find((p) => p.id !== result.positionId)?.id ??
            null,
        );
      } else {
        dirty.current = false;
        setSelected(result.positionId || null);
        setRecord(null);
        setAddTo(null);
        setView("wealth");
        window.history.pushState(null, "", "/wealth/dashboard?view=wealth");
      }
      request.current = null;
      return true;
    } catch {
      setError("网络暂时不可用，填写内容已保留，请重试保存");
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const hasForeign = data.positions.some((p) => p.currency_code !== "CNY");
  return (
    <main className="ax">
      <header className="ax-header">
        <Link className="ax-identity" href="/" aria-label="返回在侧首页">
          <strong>{name}</strong>
          <span>资产</span>
        </Link>
        <nav className="ax-nav" aria-label="资产页面">
          <button
            aria-current={view === "overview" ? "page" : undefined}
            disabled={busy}
            onClick={() => navigate("overview")}
          >
            数据概览
          </button>
          <button
            aria-current={view !== "overview" ? "page" : undefined}
            disabled={busy}
            onClick={() => navigate("wealth")}
          >
            财富总览
          </button>
        </nav>
        <div className="ax-header-actions">
          <button
            className="ax-icon-button"
            title="刷新数据与汇率"
            aria-label="刷新数据与汇率"
            disabled={busy}
            onClick={refresh}
          >
            <RefreshCw size={17} />
          </button>
          {view !== "overview" && (
            <button
              className="ax-primary"
              disabled={busy}
              onClick={() => {
                navigate("entry");
              }}
            >
              <Plus size={16} />
              录入资产
            </button>
          )}
        </div>
      </header>
      {error && (
        <div className="ax-notice ax-error" role="alert">
          {error}{" "}
          <button onClick={refresh} disabled={busy}>
            刷新最新记录
          </button>
          {error.includes("登录") && (
            <a href="/login?next=%2Fwealth%2Fdashboard%3Fview%3Dwealth">
              重新登录
            </a>
          )}
        </div>
      )}
      {message && (
        <div className="ax-notice" role="status">
          {message}
        </div>
      )}
      {hasForeign && (data.fx.unavailable || data.missing > 0) && (
        <div className="ax-notice" role="status">
          {data.fx.date
            ? `汇率更新暂不可用，使用 ${data.fx.date} 的已缓存参考汇率。`
            : "暂未取得汇率，原币余额已保存。"}
          {data.missing > 0 &&
            ` ${data.missing} 笔计入汇总的明细待折算，以下显示已折算部分。`}
        </div>
      )}
      {view === "overview" ? (
        <WealthOverview
          data={data}
          onWealth={() => navigate("wealth")}
          onCreate={() => {
            navigate("entry");
          }}
        />
      ) : view === "wealth" ? (
        <WealthList
          data={data}
          selected={selected}
          onSelect={setSelected}
          onRecord={setRecord}
          busy={busy}
          save={save}
          onAdd={(id) => {
            navigate("entry", id);
          }}
          onCreate={() => {
            navigate("entry");
          }}
        />
      ) : (
        <>
          <button
            className="ax-back"
            disabled={busy}
            onClick={() => navigate("wealth")}
          >
            <ArrowLeft size={16} />
            返回财富总览
          </button>
          <WealthEntryForm
            key={entryKey}
            onDirty={onDirty}
            data={data}
            accountId={addTo}
            save={save}
            busy={busy}
          />
        </>
      )}
      <footer className="ax-footer">
        <span>
          {hasForeign
            ? data.fx.date
              ? `汇率日期 ${data.fx.date} · ECB / Frankfurter · 每日参考汇率`
              : "汇率待获取"
            : "默认折合人民币"}
        </span>
        <span>WEALTH | {productVersions.wealth}</span>
      </footer>
      {record !== null && (
        <BalanceDialog
          key={record}
          data={data}
          positionId={record}
          busy={busy}
          save={save}
          error={error}
          onRefresh={refresh}
          onClose={() => {
            if (!busy) {
              setRecord(null);
              setError("");
            }
          }}
        />
      )}
    </main>
  );
}
