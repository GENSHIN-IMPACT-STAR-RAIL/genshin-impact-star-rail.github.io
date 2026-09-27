import { useMemo, useRef, useState } from "react";
import {
  initialComponents,
  sample,
  sampleSegment,
  type Motion,
  type Setup,
  type Sample,
} from "./mechanics";

export function MechanicsScene({
  config,
  attached,
  editable,
  motion,
  time,
  state,
  onPlace,
  showForces = true,
}: {
  showForces?: boolean;
  config: Setup;
  attached: boolean;
  editable: boolean;
  motion: Motion | null;
  time: number;
  state: Sample | null;
  onPlace: (position: number | null) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{
    x: number;
    y: number;
    s: number;
    near: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const angle = Number.isFinite(config.angle)
    ? Math.max(0, Math.min(85, config.angle))
    : 0;
  const length = Number.isFinite(config.length)
    ? Math.max(0.1, Math.min(1000, config.length))
    : 10;
  const theta = (angle * Math.PI) / 180,
    cos = Math.cos(theta),
    sin = Math.sin(theta);
  const projection = (s: number, n: number) => ({
    x: s * cos + n * sin,
    y: (length - s) * sin + n * cos,
  });
  const position = Number.isFinite(config.position)
    ? Math.max(0, Math.min(length, config.position))
    : 0;
  const particle = state ?? projection(position, 0);
  const trail = useMemo(() => {
    if (!motion || time === 0) return [];
    return motion.segments.flatMap((seg) => {
      if (seg.t > time) return [];
      const duration = Math.min(seg.duration, time - seg.t);
      return Array.from({ length: 21 }, (_, i) =>
        sampleSegment(motion, seg, (duration * i) / 20),
      );
    });
  }, [motion, time]);
  const top = projection(0, 0),
    bottom = projection(length, 0);
  const extent = [top, bottom, particle, ...trail];
  const minX = Math.min(...extent.map((p) => p.x)),
    maxX = Math.max(...extent.map((p) => p.x));
  const minY = Math.min(...extent.map((p) => p.y)),
    maxY = Math.max(...extent.map((p) => p.y));
  const scale = Math.min(
    600 / Math.max(maxX - minX, 1),
    280 / Math.max(maxY - minY, 1),
  );
  const cx = (minX + maxX) / 2,
    cy = (minY + maxY) / 2;
  const screen = (p: { x: number; y: number }) => ({
    x: 430 + (p.x - cx) * scale,
    y: 270 - (p.y - cy) * scale,
  });
  const origin = screen(top),
    end = screen(bottom),
    current = attached ? screen(particle) : { x: 95, y: 85 };
  const startVelocity = initialComponents(config);
  const vLength = Math.hypot(startVelocity.vx, startVelocity.vy);
  const event = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      svg.current!.getScreenCTM()!.inverse(),
    );
    const along = (p.x - origin.x) * cos + (p.y - origin.y) * sin;
    const outward = (p.x - origin.x) * sin - (p.y - origin.y) * cos;
    return {
      x: p.x,
      y: p.y,
      s: Math.max(0, Math.min(length, along / scale)),
      near:
        Math.abs(outward - 18) < 55 &&
        along >= -20 &&
        along <= length * scale + 20,
    };
  };
  const arrow = (dx: number, dy: number, color: string, label: string) => (
    <g>
      <line
        x1={18 * sin}
        y1={-18 * cos}
        x2={18 * sin + dx}
        y2={-18 * cos + dy}
        stroke={color}
        strokeWidth="2.5"
        markerEnd={`url(#${color.slice(1)})`}
      />
      <text
        x={18 * sin + dx + 7}
        y={-18 * cos + dy - 4}
        fill={color}
        fontSize="14"
      >
        {label}
      </text>
    </g>
  );
  return (
    <svg
      ref={svg}
      viewBox="0 0 860 510"
      role="img"
      aria-label="接触、抛体与碰撞实验画布"
      onPointerMove={(e) => {
        if (dragging) setDrag(event(e));
      }}
      onPointerUp={(e) => {
        if (!dragging) return;
        const p = event(e);
        setDragging(false);
        setDrag(null);
        onPlace(
          p.near ? Math.min(length, Math.round(p.s * 1000) / 1000) : null,
        );
      }}
      onPointerCancel={() => {
        setDragging(false);
        setDrag(null);
      }}
    >
      <defs>
        <pattern
          id="mech-grid"
          width="28"
          height="28"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1" cy="1" r="1" fill="#d7dfdc" />
        </pattern>
        {["#ce7853", "#2b847a", "#8270b0", "#346eae"].map((color) => (
          <marker
            key={color}
            id={color.slice(1)}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
          </marker>
        ))}
      </defs>
      <rect width="860" height="510" fill="url(#mech-grid)" />
      {!attached && (
        <text x="45" y="36" className="mech-svg-note">
          拖动滑块至平面 ↓
        </text>
      )}
      {trail.length > 1 && (
        <polyline
          points={trail
            .map((p) => {
              const q = screen(p);
              return `${q.x},${q.y}`;
            })
            .join(" ")}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          opacity="0.6"
        />
      )}
      <line
        x1={origin.x}
        y1={origin.y}
        x2={end.x}
        y2={end.y}
        stroke={drag?.near ? "#2b847a" : "#526c64"}
        strokeWidth={drag?.near ? 8 : 4}
        strokeLinecap="round"
      />
      {Array.from({ length: 13 }, (_, i) => {
        const p = screen(projection((length * i) / 12, 0));
        return (
          <line
            key={i}
            x1={p.x}
            y1={p.y}
            x2={p.x - 9 * sin - 6 * cos}
            y2={p.y + 9 * cos - 6 * sin}
            stroke="var(--field-line)"
          />
        );
      })}
      <text x={origin.x - 20} y={origin.y + 12} className="mech-svg-note">
        0
      </text>
      <text x={end.x + 10} y={end.y + 15} className="mech-svg-note">
        L
      </text>
      <text x="30" y="32" className="mech-svg-note">
        {attached ? `L = ${length} m · θ = ${angle}°` : ""}
      </text>
      {drag?.near && (
        <g
          transform={`translate(${screen(projection(drag.s, 0)).x},${screen(projection(drag.s, 0)).y}) rotate(${angle})`}
        >
          <rect
            x="-28"
            y="-38"
            width="56"
            height="36"
            rx="5"
            fill="var(--accent-soft)"
            stroke="var(--success)"
            strokeDasharray="4 3"
          />
        </g>
      )}
      <g
        transform={`translate(${dragging && drag ? drag.x : current.x},${dragging && drag ? drag.y : current.y})`}
      >
        <g
          transform={`rotate(${attached && !dragging ? angle : 0})`}
          className={editable ? "mech-draggable" : ""}
          onPointerDown={(e) => {
            if (!editable) return;
            e.preventDefault();
            svg.current!.setPointerCapture(e.pointerId);
            setDragging(true);
            setDrag(null);
          }}
        >
          <rect
            x="-28"
            y="-38"
            width="56"
            height="36"
            rx="5"
            fill="#346eae"
            stroke="#24588e"
            strokeWidth="2"
          />
          <text x="0" y="-15" textAnchor="middle" fill="white" fontSize="16">
            m
          </text>
          <circle cx="0" cy="0" r="3" fill="var(--accent)" />
        </g>
        {state && showForces && !dragging && (
          <>
            {arrow(0, 78, "#ce7853", "mg")}
            {state.normal > 0 && arrow(sin * 76, -cos * 76, "#2b847a", "R")}
            {Math.abs(state.friction) > 1e-8 &&
              arrow(
                Math.sign(state.friction) * cos * 80,
                Math.sign(state.friction) * sin * 80,
                "#8270b0",
                "f",
              )}
          </>
        )}
        {!motion &&
          attached &&
          vLength > 0 &&
          Number.isFinite(vLength) &&
          !dragging &&
          arrow(
            (startVelocity.vx / vLength) * 88,
            (-startVelocity.vy / vLength) * 88,
            "#346eae",
            "u",
          )}
      </g>
      <g className="mech-svg-note">
        <path
          d="M760 85V45 M760 85H804"
          fill="none"
          stroke="var(--secondary-ink)"
        />
        <text x="808" y="90">
          X
        </text>
        <text x="755" y="37">
          Y
        </text>
      </g>
      <text x="30" y="475" className="mech-svg-note">
        {dragging
          ? drag?.near
            ? "松手即可吸附"
            : "将滑块移到平面附近"
          : "自动缩放追踪 · 虚线为已走过的轨迹"}
      </text>
      <text x="830" y="496" textAnchor="end" className="mech-svg-note">
        有限单面表面，无地面 · 矩形和力箭头仅作示意
      </text>
    </svg>
  );
}

export function VelocityChart({
  motion,
  time,
}: {
  motion: Motion;
  time: number;
}) {
  const series = useMemo(
    () =>
      motion.segments.map((seg) =>
        Array.from({ length: 17 }, (_, i) =>
          sampleSegment(motion, seg, (seg.duration * i) / 16),
        ),
      ),
    [motion],
  );
  const all = series.flat().concat(sample(motion, motion.duration));
  const low = Math.min(0, ...all.flatMap((p) => [p.vs, p.vn])),
    high = Math.max(1, ...all.flatMap((p) => [p.vs, p.vn]));
  const x = (t: number) => 42 + (t / Math.max(motion.duration, 1e-9)) * 320,
    y = (v: number) => 132 - ((v - low) / (high - low)) * 103;
  const cursor = sample(motion, time);
  return (
    <svg
      viewBox="0 0 410 170"
      role="img"
      aria-label="切向与法向速度时间图，碰撞处速度有跳变"
    >
      <line x1="42" y1={y(0)} x2="372" y2={y(0)} stroke="var(--line)" />
      <line x1="42" y1="20" x2="42" y2="137" stroke="var(--line)" />
      <text x="0" y="32">
        {high.toFixed(1)}
      </text>
      <text x="0" y="136">
        {low.toFixed(1)}
      </text>
      {series.map((points, i) => (
        <g key={i}>
          <polyline
            points={points.map((p) => `${x(p.t)},${y(p.vs)}`).join(" ")}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
          />
          <polyline
            points={points.map((p) => `${x(p.t)},${y(p.vn)}`).join(" ")}
            fill="none"
            stroke="var(--success)"
            strokeWidth="2"
          />
        </g>
      ))}
      <line
        x1={x(time)}
        y1="20"
        x2={x(time)}
        y2="137"
        stroke="var(--secondary-ink)"
        strokeDasharray="3 4"
      />
      <circle cx={x(time)} cy={y(cursor.vs)} r="4" fill="var(--accent)" />
      <circle cx={x(time)} cy={y(cursor.vn)} r="4" fill="var(--success)" />
      <text x="40" y="159">
        0
      </text>
      <text x="290" y="159">
        {motion.duration.toFixed(2)} s
      </text>
    </svg>
  );
}
