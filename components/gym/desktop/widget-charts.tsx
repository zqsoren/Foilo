import { useId } from "react";
import { dateLabel, number } from "@/lib/gym/desktop";
import { Empty } from "./shared";

type Point = { day: string; volume: number };

/** Geometry follows the fixed 600px widget masters; values remain live data. */
export function MiniTrend({ points }: { points: Point[] }) {
  if (!points.length) return <Empty />;
  const min = Math.min(...points.map((p) => p.volume));
  const max = Math.max(...points.map((p) => p.volume));
  const x = (i: number) =>
    24 + (points.length === 1 ? 156 : (i * 312) / (points.length - 1));
  const y = (value: number) =>
    max === min ? 50 : 62 - ((value - min) / (max - min)) * 24;
  return (
    <div
      className="gx-mini-chart"
      title="本行使用独立容量刻度，请按标注数值比较"
      role="img"
      aria-label={
        "独立容量刻度；" +
        points.map((p) => `${p.day} ${number(p.volume)} kg`).join("，")
      }
    >
      <svg viewBox="0 0 352 90" aria-hidden>
        <polyline
          points={points.map((p, i) => `${x(i)},${y(p.volume)}`).join(" ")}
          fill="none"
          stroke="#777"
          strokeWidth="1.5"
        />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(p.volume)}
            r="3"
            fill={i === points.length - 1 ? "#242424" : "#777"}
          />
        ))}
      </svg>
      {points.map((p, i) => (
        <div key={i}>
          <span
            className="gx-mini-value"
            style={{ left: x(i), top: y(p.volume) - 21 }}
          >
            {Math.round(p.volume * 10) / 10}
          </span>
          <span className="gx-mini-day" style={{ left: x(i) }}>
            {dateLabel(p.day)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CapacityBars({ points }: { points: Point[] }) {
  const id = useId().replaceAll(":", "");
  if (!points.length) return <Empty />;
  const peak = Math.max(1, ...points.map((p) => p.volume)) * 1.2;
  const step = 10 ** Math.floor(Math.log10(peak));
  const max = Math.ceil(peak / step) * step;
  const x = (i: number) =>
    points.length === 1 ? 296 : 107 + (i * 378) / (points.length - 1);
  const y = (value: number) => 168 - (value / max) * 138;
  return (
    <div
      className="gx-capacity-chart"
      role="img"
      aria-label={points
        .map((p) => `${p.day} ${number(p.volume)} kg`)
        .join("，")}
    >
      <span className="gx-capacity-unit">容量 / kg</span>
      <svg viewBox="0 0 552 194" aria-hidden>
        <defs>
          <linearGradient id={id + "-muted"} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#D7D7D7" />
            <stop offset="1" stopColor="#BEBEBE" />
          </linearGradient>
          <linearGradient id={id + "-last"} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#696969" />
            <stop offset="1" stopColor="#454545" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((v) => (
          <line
            key={v}
            x1="44"
            x2="552"
            y1={y(max * v)}
            y2={y(max * v)}
            stroke={v ? "#EDEDED" : "#D7D7D7"}
            strokeWidth=".5"
          />
        ))}
        {points.map(
          (p, i) =>
            p.volume > 0 && (
              <path
                key={i}
                d={`M${x(i) - 23},168V${y(p.volume) + Math.min(5, (168 - y(p.volume)) / 2)}q0,-${Math.min(5, (168 - y(p.volume)) / 2)} 5,-${Math.min(5, (168 - y(p.volume)) / 2)}h36q5,0 5,${Math.min(5, (168 - y(p.volume)) / 2)}V168Z`}
                fill={`url(#${id}${i === points.length - 1 ? "-last" : "-muted"})`}
              />
            ),
        )}
      </svg>
      {[0, 0.5, 1].map((v) => (
        <span
          key={v}
          className="gx-capacity-tick"
          style={{ top: y(max * v) - 8, left: v ? 0 : 19 }}
        >
          {number(max * v)}
        </span>
      ))}
      {points.map((p, i) => (
        <div key={i}>
          <span
            className="gx-capacity-value"
            style={{ left: x(i), top: y(p.volume) - 23 }}
          >
            {number(p.volume)}
          </span>
          <span className="gx-capacity-day" style={{ left: x(i) }}>
            {dateLabel(p.day)}
          </span>
        </div>
      ))}
    </div>
  );
}
