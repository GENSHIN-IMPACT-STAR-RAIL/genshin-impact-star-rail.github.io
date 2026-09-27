import { useEffect, useRef, useState, type RefObject } from "react";
import {
  eventText,
  formatProbability,
  normalBounds,
  normalPdf,
  selectedCount,
  type LabState,
} from "./model";

export const plotColors = (dark: boolean) =>
  dark
    ? {
        background: "#18242e",
        ink: "#e6e8e5",
        muted: "#a5b6bf",
        line: "#334651",
        bar: "#536d7d",
        selected: "#8ac5b0",
        curve: "#e3ba7b",
        fill: "#d7ad6d",
      }
    : {
        background: "#fffefa",
        ink: "#293740",
        muted: "#6b7a80",
        line: "#dce4e0",
        bar: "#c7d5dc",
        selected: "#447f70",
        curve: "#ad7b3e",
        fill: "#c29960",
      };

type Props = {
  state: LabState;
  masses: number[];
  dark: boolean;
  hidden: boolean;
  svgRef: RefObject<SVGSVGElement | null>;
  onBoundary: (key: "a" | "b", value: number) => void;
};

export function DistributionChart({
  state,
  masses,
  dark,
  hidden,
  svgRef,
  onBoundary,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const drag = useRef<"a" | "b" | null>(null);
  const [size, setSize] = useState({ width: 800, height: 390 });
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: Math.max(280, entry.contentRect.width),
        height: Math.max(220, entry.contentRect.height),
      });
    });
    observer.observe(hostRef.current!);
    return () => observer.disconnect();
  }, []);
  const { n, p, event, showNormal, correction } = state;
  const colors = plotColors(dark);
  const width = size.width,
    height = size.height;
  const pad = { left: width < 450 ? 42 : 60, right: 23, top: 36, bottom: 59 };
  const mean = n * p,
    sd = Math.sqrt(n * p * (1 - p));
  const normalVisible = showNormal && sd > 0;
  const xMin = -1.5,
    xMax = n + 1.5;
  const plotWidth = width - pad.left - pad.right,
    plotHeight = height - pad.top - pad.bottom;
  const peak = Math.max(
    ...masses,
    normalVisible ? normalPdf(mean, mean, sd) : 0,
  );
  const yMax = peak * 1.28;
  const x = (value: number) =>
    pad.left + ((value - xMin) / (xMax - xMin)) * plotWidth;
  const y = (value: number) =>
    height - pad.bottom - (value / yMax) * plotHeight;
  const floorY = y(0);
  const [areaStart, areaEnd] = normalBounds(event, correction);
  const samples = (start: number, end: number) => {
    const positions = Array.from(
      { length: 401 },
      (_, i) => start + ((end - start) * i) / 400,
    );
    if (mean > start && mean < end) positions.push(mean);
    return positions
      .sort((a, b) => a - b)
      .map(
        (value) =>
          `${x(value).toFixed(3)},${y(normalPdf(value, mean, sd)).toFixed(3)}`,
      )
      .join(" L");
  };
  const curve = normalVisible ? `M${samples(xMin, xMax)}` : "";
  const start = Math.max(xMin, areaStart),
    end = Math.min(xMax, areaEnd);
  const area =
    normalVisible && start < end
      ? `M${x(start)},${floorY} L${samples(start, end)} L${x(end)},${floorY} Z`
      : "";
  const tickStep = Math.max(1, Math.ceil(n / (width < 450 ? 5 : 10) / 5) * 5);
  const ticks =
    n <= 10
      ? Array.from({ length: n + 1 }, (_, i) => i)
      : Array.from(
          { length: Math.floor(n / tickStep) + 1 },
          (_, i) => i * tickStep,
        );
  const keys: ("a" | "b")[] = event.kind === "interval" ? ["a", "b"] : ["a"];
  const selection = masses
    .map((_, k) => k)
    .filter((k) => selectedCount(k, event));
  const mouseValue = (clientX: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const local = ((clientX - rect.left) / rect.width) * width;
    return Math.max(
      0,
      Math.min(
        n,
        Math.round(xMin + ((local - pad.left) / plotWidth) * (xMax - xMin)),
      ),
    );
  };
  return (
    <div className="stat-chart-wrap" ref={hostRef}>
      <svg
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        className="stat-chart"
        viewBox={`0 0 ${width} ${height}`}
        aria-label={`二项分布与正态近似图，选中事件 ${eventText(event)}`}
        role="group"
        onPointerMove={(e) => {
          const k = mouseValue(e.clientX);
          if (drag.current) onBoundary(drag.current, k);
          else setHover(k);
        }}
        onPointerLeave={() => {
          if (!drag.current) setHover(null);
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
          <clipPath id="stat-plot-clip">
            <rect
              x={pad.left}
              y={pad.top - 6}
              width={plotWidth}
              height={plotHeight + 6}
            />
          </clipPath>
        </defs>
        <rect width={width} height={height} fill={colors.background} />
        <text
          x={pad.left}
          y={17}
          fill={colors.muted}
          fontSize="11"
          fontFamily="Segoe UI, Microsoft YaHei, sans-serif"
        >
          概率 / 密度
        </text>
        {[0.25, 0.5, 0.75].map((ratio) => {
          const value = yMax * ratio;
          return (
            <g key={ratio}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y(value)}
                y2={y(value)}
                stroke={colors.line}
                strokeDasharray="3 5"
              />
              <text
                x={pad.left - 10}
                y={y(value) + 4}
                textAnchor="end"
                fontSize="10"
                fill={colors.muted}
                fontFamily="Segoe UI, sans-serif"
              >
                {value < 0.01 ? value.toFixed(3) : value.toFixed(2)}
              </text>
            </g>
          );
        })}
        <g clipPath="url(#stat-plot-clip)">
          {area && <path d={area} fill={colors.fill} fillOpacity="0.17" />}
          {masses.map((mass, k) => {
            const selected = selectedCount(k, event);
            const barWidth = x(1) - x(0);
            return (
              <rect
                key={k}
                x={x(k - 0.5)}
                y={y(mass)}
                width={barWidth}
                height={Math.max(0, floorY - y(mass))}
                fill={selected ? colors.selected : colors.bar}
                fillOpacity={selected ? 0.86 : 0.65}
                stroke={hover === k ? colors.ink : colors.background}
                strokeWidth={hover === k ? 1.5 : Math.min(0.7, barWidth * 0.1)}
              />
            );
          })}
          {normalVisible && (
            <path
              d={curve}
              fill="none"
              stroke={colors.curve}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          )}
          {normalVisible &&
            correction &&
            [areaStart, areaEnd]
              .filter((v) => Number.isFinite(v) && v >= xMin && v <= xMax)
              .map((value, i) => (
                <line
                  key={i}
                  x1={x(value)}
                  x2={x(value)}
                  y1={pad.top}
                  y2={floorY}
                  stroke={colors.curve}
                  strokeDasharray="4 5"
                  strokeWidth="1.3"
                />
              ))}
        </g>
        <line
          x1={pad.left}
          x2={width - pad.right}
          y1={floorY}
          y2={floorY}
          stroke={colors.muted}
          strokeWidth="1"
        />
        {ticks.map((k) => (
          <g key={k}>
            <line
              x1={x(k)}
              x2={x(k)}
              y1={floorY}
              y2={floorY + 5}
              stroke={colors.muted}
            />
            <text
              x={x(k)}
              y={floorY + 18}
              textAnchor="middle"
              fill={colors.muted}
              fontSize="10"
              fontFamily="Segoe UI, sans-serif"
            >
              {k}
            </text>
          </g>
        ))}
        <text
          x={width - pad.right}
          y={height - 8}
          textAnchor="end"
          fill={colors.muted}
          fontSize="11"
          fontFamily="Segoe UI, Microsoft YaHei, sans-serif"
        >
          成功次数 k
        </text>
        {keys.map((key, index) => {
          const value = event[key];
          const offset =
            event.kind === "interval" && event.a === event.b
              ? index
                ? 17
                : -17
              : 0;
          const label =
            event.kind === "interval"
              ? key === "a"
                ? "事件下界"
                : "事件上界"
              : "事件边界";
          return (
            <g
              key={key}
              role="slider"
              aria-label={`拖动${label}`}
              aria-valuemin={0}
              aria-valuemax={n}
              aria-valuenow={value}
              tabIndex={0}
              className="stat-boundary"
              style={{ touchAction: "none", cursor: "ew-resize" }}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                drag.current = key;
                setHover(null);
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onKeyDown={(e) => {
                const delta =
                  e.key === "ArrowLeft" || e.key === "ArrowDown"
                    ? -1
                    : e.key === "ArrowRight" || e.key === "ArrowUp"
                      ? 1
                      : 0;
                if (delta) {
                  e.preventDefault();
                  onBoundary(key, Math.max(0, Math.min(n, value + delta)));
                } else if (e.key === "Home" || e.key === "End") {
                  e.preventDefault();
                  onBoundary(key, e.key === "Home" ? 0 : n);
                }
              }}
            >
              <rect
                x={x(value) - 14 + offset}
                y={pad.top}
                width={28}
                height={plotHeight + 50}
                fill="transparent"
              />
              <line
                x1={x(value)}
                x2={x(value)}
                y1={pad.top + 7}
                y2={floorY}
                stroke={colors.selected}
                strokeOpacity="0.55"
                strokeWidth="1"
              />
              <path
                d={`M${x(value)},${floorY + 4} L${x(value) + offset},${floorY + 28}`}
                stroke={colors.selected}
                fill="none"
              />
              <rect
                x={x(value) - 14 + offset}
                y={floorY + 25}
                width={28}
                height={24}
                rx={6}
                fill={colors.background}
                stroke={colors.selected}
                strokeWidth="1.5"
              />
              <text
                x={x(value) + offset}
                y={floorY + 41}
                textAnchor="middle"
                fontSize="11"
                fontWeight="600"
                fill={colors.selected}
                fontFamily="Segoe UI, sans-serif"
              >
                {value}
              </text>
            </g>
          );
        })}
        <text
          x={width - pad.right}
          y={17}
          textAnchor="end"
          fill={colors.muted}
          fontSize="11"
          fontFamily="Segoe UI, Microsoft YaHei, sans-serif"
        >
          {hover !== null && !hidden
            ? `k = ${hover}   P(X = ${hover}) ≈ ${formatProbability(masses[hover] ?? 0)}`
            : `选中 ${selection.length} 个整数取值`}
        </text>
      </svg>
    </div>
  );
}
