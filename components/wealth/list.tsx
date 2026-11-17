import { useState } from "react";
import Image from "next/image";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { categories, currencies, typeFor } from "@/lib/wealth/catalog";
import { money } from "@/lib/wealth/money";
import type { WealthData } from "@/lib/wealth/read";
export function AccountIcon({ code }: { code: string }) {
  const type = typeFor(code);
  // Local, pre-audited SVGs and original-resolution brand assets from Figma's master directory.
  return (
    <Image
      className="ax-account-icon"
      src={type?.icon ?? "/folio/assets/icons/generic-07.svg"}
      unoptimized
      width="40"
      height="40"
      alt=""
    />
  );
}
export function WealthList({
  data,
  selected,
  onSelect,
  onRecord,
  onAdd,
  onCreate,
}: {
  data: WealthData;
  selected: number | null;
  onSelect: (id: number) => void;
  onRecord: (id: number) => void;
  onAdd: (id: number) => void;
  onCreate: () => void;
}) {
  const [query, setQuery] = useState(""),
    [currency, setCurrency] = useState(""),
    [grouping, setGrouping] = useState("account"),
    [closed, setClosed] = useState<number[]>([]);
  const p = data.positions.find((p) => p.id === selected),
    a = data.accounts.find((a) => a.id === p?.account_id);
  const rows = data.positions.filter((p) => {
    const a = data.accounts.find((a) => a.id === p.account_id)!;
    return (
      (!currency || p.currency_code === currency) &&
      [p.name, a.name, a.institution, a.card_last4].some((v) =>
        v.toLowerCase().includes(query.toLowerCase()),
      )
    );
  });
  const groups =
    grouping === "account"
      ? data.accounts.map((a) => ({
          key: a.id,
          name: [a.name, a.card_last4].filter(Boolean).join(" · "),
          account: a,
          rows: rows.filter((p) => p.account_id === a.id),
        }))
      : Object.entries(categories).map(([key, name], i) => ({
          key: -i - 1,
          name,
          account: null,
          rows: rows.filter((p) => p.category_code === key),
        }));
  return (
    <div className="ax-wealth-grid">
      <section className="ax-card ax-ledger">
        <div className="ax-list-tools">
          <div className="ax-list-tabs">
            <button
              aria-pressed={grouping === "account"}
              onClick={() => setGrouping("account")}
            >
              按账户
            </button>
            <button
              aria-pressed={grouping === "category"}
              onClick={() => setGrouping("category")}
            >
              按类别
            </button>
          </div>
          <input
            aria-label="搜索账户或资产名称"
            placeholder="搜索账户或资产名称…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label="筛选币种"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option value="">全部币种</option>
            {Object.entries(currencies).map(([c, n]) => (
              <option key={c} value={c}>
                {n} {c}
              </option>
            ))}
          </select>
        </div>
        {!data.accounts.length ? (
          <div className="ax-empty ax-first-account">
            <strong>还没有账户</strong>
            <p>先添加一个账户，再逐笔记录里面的资产或负债。</p>
            <button className="ax-primary" onClick={onCreate}>
              录入资产
            </button>
          </div>
        ) : !rows.length ? (
          <div className="ax-empty">
            没有找到匹配的明细
            <button
              onClick={() => {
                setQuery("");
                setCurrency("");
              }}
            >
              清除筛选
            </button>
          </div>
        ) : (
          <div className="ax-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>名称</th>
                  <th>类别</th>
                  <th>原币金额</th>
                  <th>折合人民币</th>
                  <th>记录日期</th>
                </tr>
              </thead>
              <tbody>
                {groups
                  .filter((g) => g.rows.length)
                  .map((g) => {
                    const total = g.rows.some((p) => p.cny === null)
                      ? null
                      : g.rows
                          .reduce(
                            (s, p) =>
                              s +
                              (p.side === "asset" ? 1n : -1n) * BigInt(p.cny!),
                            0n,
                          )
                          .toString();
                    return (
                      <GroupRows
                        key={g.key}
                        closed={closed.includes(g.key)}
                        onToggle={() =>
                          setClosed((prev) =>
                            prev.includes(g.key)
                              ? prev.filter((k) => k !== g.key)
                              : [...prev, g.key],
                          )
                        }
                        name={g.name}
                        total={total}
                        rows={g.rows}
                        selected={selected}
                        onSelect={onSelect}
                        onAdd={
                          g.account ? () => onAdd(g.account!.id) : undefined
                        }
                      />
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <aside className="ax-card ax-detail">
        {p && a ? (
          <>
            <div className="ax-detail-title">
              <AccountIcon code={a.type_code} />
              <div>
                <h1>{p.name}</h1>
                <p>
                  {[a.name, a.institution, a.card_last4]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>
            <small>{p.side === "liability" ? "当前欠款" : "当前余额"}</small>
            <div className="ax-metric">
              <strong>
                {money(p.value?.amount_minor ?? null, p.currency_code)}
              </strong>
              <small>{p.currency_code}</small>
            </div>
            <dl className="ax-facts">
              <div>
                <dt>资产类别</dt>
                <dd>{categories[p.category_code]}</dd>
              </div>
              <div>
                <dt>记录日期</dt>
                <dd>{p.value?.as_of_date ?? "暂无记录"}</dd>
              </div>
              <div>
                <dt>折合人民币</dt>
                <dd>
                  {p.currency_code === "CNY"
                    ? "人民币 · 无需折算"
                    : "¥" + money(p.cny)}
                </dd>
              </div>
              <div>
                <dt>计入汇总</dt>
                <dd>
                  {p.include_in_totals
                    ? "计入" + (p.side === "liability" ? "总负债" : "总资产")
                    : "不计入"}
                </dd>
              </div>
              <div>
                <dt>记账可选</dt>
                <dd>{a.bookkeeping_enabled ? "已开启" : "已关闭"}</dd>
              </div>
              {a.note && (
                <div>
                  <dt>账户备注</dt>
                  <dd>{a.note}</dd>
                </div>
              )}
            </dl>
            <div className="ax-section-heading">
              <h2>余额历史</h2>
              <small>
                {data.valuations.filter((v) => v.position_id === p.id).length}{" "}
                条记录
              </small>
            </div>
            <ol className="ax-history">
              {data.valuations
                .filter((v) => v.position_id === p.id)
                .map((v) => (
                  <li key={v.id}>
                    <span>
                      <time>{v.as_of_date}</time>
                      <small>
                        录入于{" "}
                        {new Date(v.recorded_at).toLocaleString("zh-CN", {
                          timeZone: "Asia/Shanghai",
                          hour12: false,
                        })}
                      </small>
                      {v.note && <small>{v.note}</small>}
                    </span>
                    <strong>{money(v.amount_minor, p.currency_code)}</strong>
                  </li>
                ))}
            </ol>
            <div className="ax-detail-actions">
              <button onClick={() => onAdd(a.id)}>
                <Plus size={15} />
                添加明细
              </button>
              <button className="ax-primary" onClick={() => onRecord(p.id)}>
                更新这笔
              </button>
            </div>
          </>
        ) : (
          <div className="ax-empty">选择一笔明细，查看余额和历史</div>
        )}
      </aside>
    </div>
  );
}
function GroupRows({
  name,
  total,
  rows,
  closed,
  onToggle,
  selected,
  onSelect,
  onAdd,
}: {
  name: string;
  total: string | null;
  rows: WealthData["positions"];
  closed: boolean;
  onToggle: () => void;
  selected: number | null;
  onSelect: (id: number) => void;
  onAdd?: () => void;
}) {
  return (
    <>
      <tr className="ax-account-row">
        <th colSpan={3}>
          <button aria-expanded={!closed} onClick={onToggle}>
            {closed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            <span>{name}</span>
          </button>
          {onAdd && (
            <button
              className="ax-add-small"
              onClick={onAdd}
              aria-label={"向" + name + "添加明细"}
            >
              <Plus size={13} />
            </button>
          )}
        </th>
        <td className="ax-number">
          {total === null ? "待折算" : "¥" + money(total)}
        </td>
        <td />
      </tr>
      {!closed &&
        rows.map((p) => (
          <tr key={p.id} className={selected === p.id ? "is-selected" : ""}>
            <td>
              <button
                className="ax-row-select"
                onClick={() => onSelect(p.id)}
                aria-pressed={selected === p.id}
              >
                {p.name}
                {!p.include_in_totals && <small>不计入汇总</small>}
              </button>
            </td>
            <td>{categories[p.category_code]}</td>
            <td className="ax-number">
              {p.currency_code}{" "}
              {money(p.value?.amount_minor ?? null, p.currency_code)}
            </td>
            <td className="ax-number">
              {p.side === "liability" ? "−" : ""}
              {money(p.cny)}
            </td>
            <td>{p.value?.as_of_date ?? "暂无记录"}</td>
          </tr>
        ))}
    </>
  );
}
