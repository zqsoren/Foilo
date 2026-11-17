"use client";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { number, dateLabel } from "@/lib/gym/desktop";
const ModalCloseContext = createContext<(() => void) | undefined>(undefined);
export function useModalClose() {
  return useContext(ModalCloseContext);
}
export function Modal({
  title,
  close,
  children,
  busy = false,
  description,
  variant,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  busy?: boolean;
  description?: string;
  variant?: "focus";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId(),
    descriptionId = useId();
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismiss = () => {
    if (closing || busy) return;
    setClosing(true);
    closeTimer.current = setTimeout(close, 160);
  };
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      d?.close();
    };
  }, []);
  return (
    <dialog
      className={
        "gx-modal" +
        (variant === "focus" ? " gx-focus-modal" : "") +
        (closing ? " gx-dialog-closing" : "")
      }
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        {description && <p id={descriptionId}>{description}</p>}
        <button aria-label="关闭" disabled={busy} onClick={dismiss}>
          <X size={22} />
        </button>
      </header>
      <ModalCloseContext.Provider value={dismiss}>
        {children}
      </ModalCloseContext.Provider>
    </dialog>
  );
}
export function Empty({ children = "暂无训练记录" }: { children?: ReactNode }) {
  return <p className="gx-empty">{children}</p>;
}
export function Progress({ value, target }: { value: number; target: number }) {
  return (
    <div
      className="gx-progress"
      role="progressbar"
      aria-label="目标进度"
      aria-valuemin={0}
      aria-valuemax={target || 1}
      aria-valuenow={Math.min(value, target || 1)}
    >
      <i
        style={{
          width: Math.min(100, target ? (value / target) * 100 : 0) + "%",
        }}
      />
    </div>
  );
}
export function Chart({
  points,
  bars = false,
  compact = false,
}: {
  points: { day: string; volume: number }[];
  bars?: boolean;
  compact?: boolean;
}) {
  if (!points.length) return <Empty />;
  const max = Math.max(1, ...points.map((p) => p.volume)) * 1.2,
    w = 520,
    h = compact ? 90 : 190,
    left = compact ? 16 : 36,
    top = 24,
    bottom = h - 26;
  const x = (i: number) =>
    left +
    (w - left - 20) * (points.length === 1 ? 0.5 : i / (points.length - 1));
  const y = (v: number) => bottom - (v / max) * (bottom - top);
  return (
    <svg
      className="gx-chart"
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={points
        .map((p) => `${p.day} ${number(p.volume)} kg`)
        .join("，")}
    >
      <defs>
        <linearGradient id={bars ? "gx-bar" : "gx-line"} x2="0" y2="1">
          <stop stopColor="#ccc" />
          <stop offset="1" stopColor="#999" />
        </linearGradient>
      </defs>
      {!compact &&
        [0, 0.5, 1].map((v) => (
          <g key={v}>
            <line
              x1={left}
              y1={y(v * max)}
              x2={w}
              y2={y(v * max)}
              stroke="#eee"
            />
            <text x="0" y={y(v * max) + 4}>
              {number(v * max)}
            </text>
          </g>
        ))}
      {!bars && (
        <polyline
          points={points.map((p, i) => `${x(i)},${y(p.volume)}`).join(" ")}
          fill="none"
          stroke="#686868"
          strokeWidth="1.5"
        />
      )}
      {points.map((p, i) => (
        <g key={i}>
          {bars ? (
            <rect
              x={x(i) - 18}
              y={y(p.volume)}
              width="36"
              height={Math.max(0, bottom - y(p.volume))}
              rx="4"
              fill={i === points.length - 1 ? "#555" : "#bbb"}
            />
          ) : (
            <circle cx={x(i)} cy={y(p.volume)} r="3" fill="#555" />
          )}
          <text x={x(i)} y={y(p.volume) - 9} textAnchor="middle">
            {number(p.volume)}
          </text>
          <text x={x(i)} y={h - 6} textAnchor="middle">
            {dateLabel(p.day)}
          </text>
        </g>
      ))}
    </svg>
  );
}
