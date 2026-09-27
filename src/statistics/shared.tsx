import { useEffect, useRef, useState, type ReactNode } from "react";
import { StaticMath } from "../StaticMath";
import { useStatisticsWorkspace } from "./workspace";
import { format } from "./math";

export function Panel({
  title,
  children,
  className = "",
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`stats-panel ${className}`}>
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className="stats-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  min = -1e12,
  max = 1e12,
  step = "any",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number | "any";
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const valid = (s: string) =>
    s.trim() !== "" &&
    Number.isFinite(Number(s)) &&
    Number(s) >= min &&
    Number(s) <= max &&
    (step !== 1 || Number.isInteger(Number(s)));
  return (
    <label className="stats-field">
      <span>{label}</span>
      <input
        className="stats-input"
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        aria-invalid={!valid(draft)}
        onChange={(e) => {
          setDraft(e.target.value);
          if (valid(e.target.value)) onChange(Number(e.target.value));
        }}
        onBlur={() => {
          if (!valid(draft)) setDraft(String(value));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </label>
  );
}
export function Result({
  label,
  value,
  note,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
}) {
  const { resultsHidden } = useStatisticsWorkspace();
  return (
    <div className="stats-result">
      <span>{label}</span>
      <strong>{resultsHidden ? "— —" : value}</strong>
      {note && <small>{resultsHidden ? "结果已隐藏" : note}</small>}
    </div>
  );
}
export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warning";
}) {
  return (
    <div
      className={`stats-notice ${tone === "warning" ? "warning" : ""}`}
      role={tone === "warning" ? "status" : undefined}
    >
      {children}
    </div>
  );
}
export function Formula({ value }: { value: string }) {
  return (
    <div className="stats-formula">
      <StaticMath value={value} />
    </div>
  );
}
export type PlotSeries = {
  kind: "line" | "bar" | "points";
  data: { x: number; y: number }[];
  color?: string;
  name?: string;
  barWidth?: number;
};
export function Plot({
  series,
  xLabel = "x",
  yLabel = "",
  xDomain,
  yDomain,
  markers = [],
  height = 280,
  onMarkerChange,
}: {
  series: PlotSeries[];
  xLabel?: string;
  yLabel?: string;
  xDomain?: [number, number];
  yDomain?: [number, number];
  markers?: { x: number; label?: string; color?: string; step?: number }[];
  height?: number;
  onMarkerChange?: (index: number, value: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(650);
  const drag = useRef<number | null>(null);
  useEffect(() => {
    const observer = new ResizeObserver(([e]) =>
      setWidth(Math.max(250, e.contentRect.width)),
    );
    observer.observe(host.current!);
    return () => observer.disconnect();
  }, []);
  const colors = [
    "var(--stats-teal)",
    "var(--stats-gold)",
    "var(--stats-blue)",
    "var(--stats-rose)",
  ];
  const safe = series.map((s) => ({
    ...s,
    data: s.data
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
      .slice(0, 12000),
  }));
  const points = safe.flatMap((s) => s.data);
  let minX =
      xDomain?.[0] ?? (points.length ? Math.min(...points.map((p) => p.x)) : 0),
    maxX =
      xDomain?.[1] ?? (points.length ? Math.max(...points.map((p) => p.x)) : 1);
  let minY = yDomain?.[0] ?? Math.min(...points.map((p) => p.y), 0),
    maxY =
      yDomain?.[1] ??
      (points.length ? Math.max(...points.map((p) => p.y), 0) : 1);
  if (maxX <= minX) maxX = minX + 1;
  if (maxY <= minY) maxY = minY + 1;
  if (!xDomain) {
    const pad = (maxX - minX) * 0.04;
    minX -= pad;
    maxX += pad;
  }
  if (!yDomain) {
    const pad = (maxY - minY) * 0.12;
    maxY += pad;
    if (minY < 0) minY -= pad;
  }
  const left = 51,
    right = 16,
    top = 27,
    bottom = 43;
  const x = (v: number) =>
    left + ((v - minX) / (maxX - minX)) * (width - left - right);
  const y = (v: number) =>
    height - bottom - ((v - minY) / (maxY - minY)) * (height - top - bottom);
  const unique = useRef(`clip-${Math.random().toString(36).slice(2)}`);
  return (
    <div className="stats-plot" ref={host}>
      <svg
        role={onMarkerChange ? "group" : "img"}
        aria-label={`${yLabel || "统计图"}；横轴 ${xLabel}`}
        viewBox={`0 0 ${width} ${height}`}
        style={{ height }}
        onPointerMove={(event) => {
          if (drag.current === null || !onMarkerChange) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const position = ((event.clientX - rect.left) * width) / rect.width;
          const next =
            minX + ((position - left) / (width - left - right)) * (maxX - minX);
          onMarkerChange(drag.current, Math.max(minX, Math.min(maxX, next)));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
      >
        <defs>
          <clipPath id={unique.current}>
            <rect
              x={left}
              y={top}
              width={width - left - right}
              height={height - top - bottom}
            />
          </clipPath>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((q) => (
          <g key={q}>
            <line
              x1={left}
              x2={width - right}
              y1={y(minY + q * (maxY - minY))}
              y2={y(minY + q * (maxY - minY))}
              className="stats-grid-line"
            />
            <text
              x={left - 8}
              y={y(minY + q * (maxY - minY)) + 4}
              textAnchor="end"
            >
              {format(minY + q * (maxY - minY), 3)}
            </text>
          </g>
        ))}
        <g clipPath={`url(#${unique.current})`}>
          {safe.map((s, index) => {
            const color = s.color ?? colors[index % colors.length];
            if (s.kind === "line")
              return (
                <path
                  key={index}
                  d={s.data
                    .map((p, i) => `${i ? "L" : "M"}${x(p.x)},${y(p.y)}`)
                    .join(" ")}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                />
              );
            if (s.kind === "points")
              return (
                <g key={index}>
                  {s.data.map((p, i) => (
                    <circle
                      key={i}
                      cx={x(p.x)}
                      cy={y(p.y)}
                      r={3}
                      fill={color}
                      fillOpacity={0.7}
                    />
                  ))}
                </g>
              );
            const diffs = s.data
              .slice(1)
              .map((p, i) => p.x - s.data[i].x)
              .filter((v) => v > 0);
            const step = s.barWidth ?? (diffs.length ? Math.min(...diffs) : 1);
            const w = Math.max(0.6, x(minX + step) - x(minX));
            return (
              <g key={index}>
                {s.data.map((p, i) => (
                  <rect
                    key={i}
                    x={x(p.x) - w / 2}
                    y={Math.min(y(p.y), y(0))}
                    width={w}
                    height={Math.abs(y(p.y) - y(0))}
                    fill={color}
                    fillOpacity={0.66}
                    stroke="var(--canvas-bg)"
                    strokeWidth={Math.min(0.6, w * 0.08)}
                  />
                ))}
              </g>
            );
          })}
          {markers
            .filter((m) => Number.isFinite(m.x))
            .map((m, i) => (
              <line
                key={i}
                x1={x(m.x)}
                x2={x(m.x)}
                y1={top}
                y2={height - bottom}
                stroke={m.color ?? "var(--stats-gold)"}
                strokeDasharray="5 4"
              />
            ))}
        </g>
        <line
          x1={left}
          x2={width - right}
          y1={height - bottom}
          y2={height - bottom}
          className="stats-axis"
        />
        {[0, 0.25, 0.5, 0.75, 1].map((q) => (
          <text
            key={q}
            x={x(minX + q * (maxX - minX))}
            y={height - bottom + 18}
            textAnchor="middle"
          >
            {format(minX + q * (maxX - minX), 3)}
          </text>
        ))}
        <text x={left} y={15}>
          {yLabel}
        </text>
        <text x={width - right} y={height - 5} textAnchor="end">
          {xLabel}
        </text>
        {markers
          .filter((m) => m.label && m.x >= minX && m.x <= maxX)
          .map((m, i) => (
            <text
              key={i}
              x={x(m.x)}
              y={top + 12 + (i % 2) * 15}
              textAnchor="middle"
              fill={m.color ?? "var(--stats-gold)"}
            >
              {m.label}
            </text>
          ))}
        {onMarkerChange &&
          markers.map((marker, index) =>
            Number.isFinite(marker.x) &&
            marker.x >= minX &&
            marker.x <= maxX ? (
              <g
                key={`handle-${index}`}
                tabIndex={0}
                role="slider"
                aria-label={`拖动${marker.label ?? "边界" + (index + 1)}`}
                aria-valuemin={minX}
                aria-valuemax={maxX}
                aria-valuenow={marker.x}
                style={{ cursor: "ew-resize", touchAction: "none" }}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.preventDefault();
                  event.stopPropagation();
                  drag.current = index;
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onKeyDown={(event) => {
                  const direction =
                    event.key === "ArrowLeft"
                      ? -1
                      : event.key === "ArrowRight"
                        ? 1
                        : 0;
                  if (direction) {
                    event.preventDefault();
                    onMarkerChange(
                      index,
                      Math.max(
                        minX,
                        Math.min(
                          maxX,
                          marker.x +
                            direction * (marker.step ?? (maxX - minX) / 100),
                        ),
                      ),
                    );
                  }
                }}
              >
                <rect
                  x={x(marker.x) - 13}
                  y={top}
                  width={26}
                  height={height - top - bottom + 13}
                  fill="transparent"
                />
                <circle
                  cx={x(marker.x)}
                  cy={height - bottom}
                  r={7}
                  fill="var(--canvas-bg)"
                  stroke={marker.color ?? "var(--stats-gold)"}
                  strokeWidth={2}
                />
              </g>
            ) : null,
          )}
      </svg>
      {safe.some((s) => s.name) && (
        <div className="stats-plot-legend">
          {safe.map(
            (s, i) =>
              s.name && (
                <span key={i}>
                  <i
                    style={{ background: s.color ?? colors[i % colors.length] }}
                  />
                  {s.name}
                </span>
              ),
          )}
        </div>
      )}
    </div>
  );
}
