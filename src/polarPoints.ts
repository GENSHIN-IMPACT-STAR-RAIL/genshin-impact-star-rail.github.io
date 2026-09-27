import type { Parameters } from "./math";
import type { View } from "./plot";
import { plotThemes, type PlotTheme } from "./theme.ts";
import { polarPoint, type AngleRange } from "./polar.ts";
type Fn = (theta: number, params: Parameters) => number;
export type PointEquation = { branches: Fn[]; domainGuards: Fn[] };
export type PolarSample = {
  id: string;
  index: number;
  label: string;
  theta: number;
  r: number | null;
  limit: number | null;
  status: "defined" | "excluded" | "unavailable" | "hidden";
  point: [number, number] | null;
};

export function formatAngle(theta: number) {
  const coefficient = theta / Math.PI;
  if (Math.abs(coefficient) < 1e-12) return "0";
  for (let d = 1; d <= 4096; d++) {
    const n = Math.round(coefficient * d);
    if (Math.abs(coefficient - n / d) < 1e-10) {
      const sign = n < 0 ? "−" : "",
        m = Math.abs(n),
        numerator = `${m === 1 ? "" : m}π`;
      return `${sign}${numerator}${d === 1 ? "" : `/${d}`}`;
    }
  }
  return `${Number(coefficient.toFixed(5))}π`;
}
export const formatRadius = (value: number) =>
  Math.abs(value) < 5e-9 ? "0" : Number(value.toPrecision(6)).toString();
export const formatDegrees = (theta: number) =>
  `${Number(((theta * 180) / Math.PI).toFixed(5))}°`;

function radiusLimit(
  fn: Fn,
  theta: number,
  range: AngleRange,
  params: Parameters,
  showNegative: boolean,
): number | null {
  for (const direction of [-1, 1]) {
    const available = direction < 0 ? theta - range.start : range.end - theta;
    if (available <= 1e-14) continue;
    let step = Math.min(available / 2, 1e-3);
    const values: number[] = [];
    for (let j = 0; j < 11; j++, step *= 0.1) {
      const v = fn(theta + direction * step, params);
      if (!Number.isFinite(v) || (!showNegative && v < 0)) {
        values.length = 0;
        continue;
      }
      values.push(v);
    }
    if (values.length < 3) continue;
    const [a, b, c] = values.slice(-3),
      tolerance = 1e-5 * Math.max(1, Math.abs(c));
    if (Math.abs(c - b) > tolerance || Math.abs(b - a) > 4 * tolerance)
      continue;
    const denominator = c - 2 * b + a,
      estimate =
        Math.abs(denominator) > 1e-16 ? a - (b - a) ** 2 / denominator : c;
    const result =
      Number.isFinite(estimate) && Math.abs(estimate - c) < 4 * tolerance
        ? estimate
        : c;
    return Math.abs(result) < 1e-8 ? 0 : result;
  }
  return null;
}

export function samplePolarPoints(
  eq: PointEquation,
  range: AngleRange,
  divisions: number,
  params: Parameters,
  showNegative: boolean,
): PolarSample[] {
  if (!Number.isInteger(divisions) || divisions < 1 || divisions > 64)
    throw new Error("等分份数请输入 1–64 的整数");
  const rows: PolarSample[] = [];
  for (let i = 0; i <= divisions; i++) {
    const theta =
      i === divisions
        ? range.end
        : range.start + ((range.end - range.start) * i) / divisions;
    const values = eq.branches.map((fn) => fn(theta, params));
    const excluded = eq.domainGuards.some((fn) => {
      const n = fn(theta, params);
      return Number.isFinite(n) && Math.abs(n) < 1e-12;
    });
    const atAngle: PolarSample[] = [];
    values.forEach((r, j) => {
      const base = {
        id: `${i}-${j}`,
        index: i,
        label: `${j === 0 ? "P" : "Q"}${i}`,
        theta,
      };
      if (Number.isFinite(r)) {
        if (!showNegative && r < 0) return;
        if (
          atAngle.some(
            (p) =>
              p.r !== null &&
              Math.abs(p.r - r) < 1e-10 * Math.max(1, Math.abs(r)),
          )
        )
          return;
        atAngle.push({
          ...base,
          r,
          limit: null,
          status: "defined",
          point: polarPoint(r, theta),
        });
      } else if (excluded) {
        const limit = radiusLimit(
          eq.branches[j],
          theta,
          range,
          params,
          showNegative,
        );
        if (
          limit !== null &&
          !atAngle.some(
            (p) => p.limit !== null && Math.abs(p.limit - limit) < 1e-8,
          )
        )
          atAngle.push({
            ...base,
            r: null,
            limit,
            status: "excluded",
            point: polarPoint(limit, theta),
          });
      }
    });
    if (!atAngle.length)
      atAngle.push({
        id: `${i}-none`,
        index: i,
        label: `P${i}`,
        theta,
        r: null,
        limit: null,
        point: null,
        status: excluded
          ? "excluded"
          : values.some(Number.isFinite)
            ? "hidden"
            : "unavailable",
      });
    rows.push(...atAngle);
  }
  return rows;
}

export function drawPolarSamples(
  ctx: CanvasRenderingContext2D,
  rows: PolarSample[],
  view: View,
  w: number,
  h: number,
  color: string,
  showValues: boolean,
  showRays: boolean,
  selected: string | null,
  avoid?: { x: number; y: number; w: number; h: number },
  degrees = false,
  paint: PlotTheme = plotThemes.light,
) {
  ctx.save();
  ctx.setLineDash([]);
  const ox = w / 2 - view.x * view.scale,
    oy = h / 2 + view.y * view.scale;
  const occupied: { x: number; y: number; w: number; h: number }[] = avoid
    ? [avoid]
    : [];
  const visible = rows
    .filter((row) => row.point)
    .map((row) => ({
      row,
      x: ox + row.point![0] * view.scale,
      y: oy - row.point![1] * view.scale,
    }))
    .filter((p) => p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h);
  if (showRays) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.14;
    ctx.lineWidth = 1;
    for (const { x, y } of visible) {
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // Place the selected label first, then avoid collisions where room permits.
  visible.sort(
    (a, b) => Number(b.row.id === selected) - Number(a.row.id === selected),
  );
  for (const { row, x, y } of visible) {
    const active = row.id === selected;
    if (active) {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fillStyle = `${color}22`;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, active ? 4.5 : 3.5, 0, 2 * Math.PI);
    ctx.fillStyle = row.status === "excluded" ? paint.background : color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.7;
    ctx.fill();
    ctx.stroke();
    const r = row.r ?? row.limit;
    const text =
      showValues || active
        ? `${row.label}  ${row.status === "excluded" ? "r→" : "r="}${formatRadius(r!)}  θ=${degrees ? formatDegrees(row.theta) : formatAngle(row.theta)}`
        : row.label;
    ctx.font = `${active ? "600 " : " "}11px "Segoe UI",sans-serif`;
    const tw = ctx.measureText(text).width + 8,
      th = 19;
    const positions = [
      [x + 9, y - 24],
      [x + 9, y + 7],
      [x - tw - 9, y - 24],
      [x - tw - 9, y + 7],
      [x - tw / 2, y - 32],
      [x - tw / 2, y + 13],
    ];
    const fits = (px: number, py: number) =>
      px >= 4 &&
      px + tw < w - 4 &&
      py >= 4 &&
      py + th < h - 4 &&
      !occupied.some(
        (b) =>
          px < b.x + b.w + 3 &&
          px + tw > b.x - 3 &&
          py < b.y + b.h + 3 &&
          py + th > b.y - 3,
      );
    let place = positions.find(([px, py]) => fits(px, py));
    // Keep dense plots readable: every point stays visible; the table provides
    // every value, and selecting a row always reveals its full label.
    if (!place && !active) continue;
    place ??= [
      Math.max(4, Math.min(w - tw - 4, x + 9)),
      Math.max(4, Math.min(h - th - 4, y - 24)),
    ];
    const [px, py] = place;
    occupied.push({ x: px, y: py, w: tw, h: th });
    ctx.fillStyle = paint.labelBackground;
    ctx.fillRect(px, py, tw, th);
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.fillText(text, px + 4, py + 13);
  }
  ctx.restore();
}
