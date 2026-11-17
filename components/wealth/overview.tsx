import { useEffect, useRef, useState, type ReactNode } from "react";
import { categories, currencies } from "@/lib/wealth/catalog";
import type { WealthData } from "@/lib/wealth/read";
import { money } from "@/lib/wealth/money";

function Widget({
  title,
  children,
  wide = false,
  footer,
}: {
  title: string;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  return (
    <section className={"ax-card ax-widget" + (wide ? " ax-wide" : "")}>
      <h2>{title}</h2>
      <div className="ax-widget-body">{children}</div>
      {footer && <div className="ax-widget-foot">{footer}</div>}
    </section>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return <div className="ax-empty">{children}</div>;
}
export function WealthOverview({
  data,
  onWealth,
  onCreate,
}: {
  data: WealthData;
  onWealth: () => void;
  onCreate: () => void;
}) {
  const included = data.positions.filter((p) => p.include_in_totals && p.value),
    assets = included.filter((p) => p.side === "asset"),
    debts = included.filter((p) => p.side === "liability");
  const byCategory = Object.entries(categories)
    .filter(([key]) => key !== "debt")
    .map(([key, label]) => ({
      label,
      value: assets
        .filter((p) => p.category_code === key && p.cny !== null)
        .reduce((s, p) => s + BigInt(p.cny!), 0n),
    }))
    .filter((row) => row.value > 0n);
  const byAccount = data.accounts
    .map((a) => ({
      name: a.name,
      sub: [a.institution, a.card_last4 && "尾号 " + a.card_last4]
        .filter(Boolean)
        .join(" · "),
      value: assets
        .filter((p) => p.account_id === a.id && p.cny !== null)
        .reduce((s, p) => s + BigInt(p.cny!), 0n),
    }))
    .filter((a) => a.value > 0n)
    .sort((a, b) => (a.value > b.value ? -1 : 1));
  const percent = (value: bigint) =>
    BigInt(data.assets) > 0n
      ? Number((value * 1000n) / BigInt(data.assets)) / 10
      : 0;
  return (
    <>
      <section className="ax-card ax-summary">
        <div className="ax-section-heading">
          <h2>资产摘要</h2>
          <span>
            截至 {data.date} · 折合人民币
            {data.missing > 0 ? " · 部分金额待折算" : ""}
          </span>
        </div>
        <div className="ax-metrics">
          {[
            {
              label: data.missing ? "已折算资产" : "总资产",
              value: data.assets,
              sub: `${assets.length} 笔资产 · ${data.accounts.length} 个账户`,
            },
            {
              label: data.missing ? "已折算负债" : "总负债",
              value: data.liabilities,
              sub: `${debts.length} 笔负债`,
            },
            { label: "已记录净额", value: data.net, sub: "资产减去负债" },
          ].map((m) => (
            <div key={m.label}>
              <span>{m.label}</span>
              <div className="ax-metric">
                <strong>{money(m.value)}</strong>
                <small>CNY</small>
              </div>
              <span>{m.sub}</span>
            </div>
          ))}
        </div>
      </section>
      {!data.accounts.length && (
        <div className="ax-onboarding">
          <div>
            <strong>从第一个账户开始</strong>
            <p>记录余额后，在这里查看资产、负债和变化。</p>
          </div>
          <button className="ax-primary" onClick={onCreate}>
            录入资产
          </button>
        </div>
      )}
      <div className="ax-dashboard-grid">
        <Widget
          title="资产变化"
          wide
          footer="余额变化包含进出与估值变化，不等于投资收益；历史按当日参考汇率折算。"
        >
          <Trend data={data} />
        </Widget>
        <Widget
          title="资产构成"
          footer="按资产类别统计 · 不含负债及未计入汇总的明细"
        >
          {byCategory.length ? (
            <div className="ax-bars">
              {byCategory.map((row) => (
                <div key={row.label}>
                  <div>
                    <span>{row.label}</span>
                    <strong>{money(row.value.toString())}</strong>
                    <small>{percent(row.value)}%</small>
                  </div>
                  <meter
                    min={0}
                    max={100}
                    value={percent(row.value)}
                    aria-label={row.label + "占比"}
                  />
                </div>
              ))}
            </div>
          ) : (
            <Empty>录入资产后查看构成</Empty>
          )}
        </Widget>
        <Widget
          title="账户分布"
          footer={<button onClick={onWealth}>查看全部账户 ›</button>}
        >
          {byAccount.length ? (
            <div className="ax-distribution">
              {byAccount.slice(0, 6).map((a, i) => (
                <div key={i}>
                  <span>
                    <b>{a.name}</b>
                    <small>{a.sub || "资产账户"}</small>
                  </span>
                  <meter
                    min={0}
                    max={100}
                    value={percent(a.value)}
                    aria-label={a.name + "资产占比"}
                  />
                  <strong>{money(a.value.toString())}</strong>
                </div>
              ))}
            </div>
          ) : (
            <Empty>账户金额由下面的明细汇总</Empty>
          )}
        </Widget>
        <Widget
          title="币种分布"
          footer={
            data.fx.date ? `参考汇率日期 ${data.fx.date}` : "人民币无需折算"
          }
        >
          <div className="ax-currencies">
            {Object.entries(currencies).map(([code, label]) => {
              const rows = assets.filter((p) => p.currency_code === code);
              if (!rows.length) return null;
              const original = rows.reduce(
                  (s, p) => s + BigInt(p.value!.amount_minor),
                  0n,
                ),
                converted = rows.some((p) => p.cny === null)
                  ? null
                  : rows.reduce((s, p) => s + BigInt(p.cny!), 0n).toString();
              return (
                <div key={code}>
                  <b>{label}</b>
                  <span>
                    <strong>
                      {code} {money(original.toString(), code)}
                    </strong>
                    <small>折合 ¥{money(converted)}</small>
                  </span>
                  <small>
                    {converted !== null
                      ? percent(BigInt(converted)) + "%"
                      : "待折算"}
                  </small>
                </div>
              );
            })}
            {!assets.length && <Empty>支持人民币、美元、日元等币种</Empty>}
          </div>
        </Widget>
        <Widget
          title="负债概况"
          footer="仅统计当前欠款，不包含尚未使用的授信额度"
        >
          <small>当前欠款</small>
          <div className="ax-metric">
            <strong>{money(data.liabilities)}</strong>
            <small>CNY</small>
          </div>
          <div className="ax-debts">
            {debts.slice(0, 5).map((p) => (
              <div key={p.id}>
                <span>
                  {data.accounts.find((a) => a.id === p.account_id)?.name}
                  <small>{p.name}</small>
                </span>
                <strong>
                  {p.currency_code}{" "}
                  {money(p.value!.amount_minor, p.currency_code)}
                </strong>
              </div>
            ))}
            {!debts.length && <Empty>还没有记录负债</Empty>}
          </div>
        </Widget>
      </div>
    </>
  );
}
function Trend({ data }: { data: WealthData }) {
  const chart = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const hasPoints = data.trend.some((p) => p.net !== null);
  useEffect(() => {
    const node = chart.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(280, entry.contentRect.width)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasPoints]);
  const x = (index: number) => 60 + (index * (width - 85)) / 5;
  const points = data.trend.filter((p) => p.net !== null);
  if (!points.length) return <Empty>有余额记录后，显示最近六个月的变化</Empty>;
  const values = points.map((p) => Number(p.net) / 100),
    lo = Math.min(...values),
    hi = Math.max(...values),
    range = hi - lo || Math.max(Math.abs(hi) * 0.1, 100),
    min = lo - range * 0.15,
    max = hi + range * 0.15;
  const y = (v: number) => 185 - ((v - min) / (max - min)) * 155;
  const plotted = data.trend.map((p, i) =>
    p.net === null ? null : { x: x(i), y: y(Number(p.net) / 100), ...p },
  );
  let path = "",
    move = true;
  for (const p of plotted) {
    if (!p) {
      move = true;
      continue;
    }
    path += (move ? "M" : "L") + p.x + "," + p.y + " ";
    move = false;
  }
  return (
    <div className="ax-trend" ref={chart}>
      <div className="ax-section-heading">
        <span>
          <small>净额 · CNY</small>
          <strong>{money(data.net)}</strong>
        </span>
        <small>最近半年 · 月末及今日</small>
      </div>
      <svg
        viewBox={`0 0 ${width} 230`}
        role="img"
        aria-label="最近六个月净资产趋势，缺少记录或汇率的月份留空"
      >
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              x1="60"
              x2={width - 25}
              y1={30 + t * 155}
              y2={30 + t * 155}
              stroke="#eeeeee"
            />
            <text x="55" y={34 + t * 155} textAnchor="end">
              {new Intl.NumberFormat("zh-CN", {
                notation: "compact",
                maximumSignificantDigits: 4,
              }).format(max - (max - min) * t)}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="#333" strokeWidth="1.6" />
        {plotted.map(
          (p, i) =>
            p && (
              <circle key={i} cx={p.x} cy={p.y} r="3" fill="#333">
                <title>{p.date + "：¥" + money(p.net)}</title>
              </circle>
            ),
        )}
        {data.trend.map((p, i) => (
          <text key={p.date} x={x(i)} y="216" textAnchor="middle">
            {Number(p.date.slice(5, 7))}月
          </text>
        ))}
      </svg>
      <details>
        <summary>查看各月数值</summary>
        <dl>
          {data.trend.map((p) => (
            <div key={p.date}>
              <dt>{p.date}</dt>
              <dd>
                {p.net === null ? "暂无记录或汇率" : "¥" + money(p.net)}
                {p.unavailable ? "（汇率暂不可用）" : ""}
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
