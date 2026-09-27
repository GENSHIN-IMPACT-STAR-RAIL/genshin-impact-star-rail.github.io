import type { View } from "./plot";
import { plotThemes, type PlotTheme } from "./theme.ts";
export const POLAR_VIEW: View = { x: 0, y: 0, scale: 40 };
export type AngleRange = { start: number; end: number };
export type AngleInputUnit = "pi" | "rad" | "deg";
export const angleUnitScale = (unit: AngleInputUnit) =>
  unit === "pi" ? Math.PI : unit === "deg" ? Math.PI / 180 : 1;
export function formatAngleInput(
  radians: number,
  unit: AngleInputUnit,
): string {
  const value = radians / angleUnitScale(unit);
  if (Math.abs(value) < 1e-14) return "0";
  if (unit === "pi")
    for (let denominator = 1; denominator <= 1024; denominator++) {
      const numerator = Math.round(value * denominator);
      if (Math.abs(value - numerator / denominator) < 1e-12)
        return denominator === 1
          ? String(numerator)
          : `${numerator}/${denominator}`;
    }
  return Number(value.toPrecision(15)).toString();
}
export function convertAngleInput(
  text: string,
  from: AngleInputUnit,
  to: AngleInputUnit,
): string {
  return formatAngleInput(parseAngleMultiple(text) * angleUnitScale(from), to);
}
export function parseAngleMultiple(value: string): number {
  const text = value.trim().replace(/−/g, "-").replace(/⁄/g, "/");
  const number = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?";
  const match = text.match(
    new RegExp(`^(${number})(?:\\s*/\\s*(${number}))?$`),
  );
  if (!match) throw new Error("请输入小数或分数，例如 1/4、-1/2");
  const numerator = Number(match[1]),
    denominator = match[2] === undefined ? 1 : Number(match[2]);
  if (denominator === 0) throw new Error("分数的分母不能为 0");
  const result = numerator / denominator;
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    !Number.isFinite(result)
  )
    throw new Error("角度范围须为有限数值");
  return result;
}
export function angleRange(
  start: string,
  end: string,
  unit: AngleInputUnit = "pi",
): AngleRange {
  if (!start.trim() || !end.trim()) throw new Error("请填写起点和终点");
  const a = parseAngleMultiple(start) * angleUnitScale(unit),
    b = parseAngleMultiple(end) * angleUnitScale(unit);
  if (!Number.isFinite(a) || !Number.isFinite(b))
    throw new Error("角度范围须为有限数值");
  if (a >= b) throw new Error("终点须大于起点");
  if (
    b - a > 40 * Math.PI + 1e-10 ||
    Math.max(Math.abs(a), Math.abs(b)) > 100 * Math.PI + 1e-10
  )
    throw new Error(
      unit === "deg"
        ? "范围跨度最多 7200°，端点限于 −18000° 至 18000°"
        : "范围跨度最多 40π 弧度，端点限于 −100π 至 100π 弧度",
    );
  return { start: a, end: b };
}
export function polarPoint(radius: number, theta: number): [number, number] {
  return [radius * Math.cos(theta), radius * Math.sin(theta)];
}
export function polarSegments(
  fn: (theta: number) => number,
  range: AngleRange,
  view: View,
  width: number,
  height: number,
  showNegativeRadius = true,
  negativeOnly = false,
) {
  const lines: [number, number][][] = [];
  let line: [number, number][] = [];
  const flush = () => {
    if (line.length > 1) lines.push(line);
    line = [];
  };
  const count = Math.min(
    12000,
    Math.max(720, Math.ceil((range.end - range.start) * 160)),
  );
  const project = (theta: number): [number, number] => {
    const radius = fn(theta);
    if (!showNegativeRadius && radius < 0) return [NaN, NaN];
    if (negativeOnly && radius >= 0) return [NaN, NaN];
    const [x, y] = polarPoint(radius, theta);
    return [
      width / 2 + (x - view.x) * view.scale,
      height / 2 - (y - view.y) * view.scale,
    ];
  };
  const valid = (p: [number, number]) =>
    p.every(Number.isFinite) &&
    Math.abs(p[0] - width / 2) < width * 4 &&
    Math.abs(p[1] - height / 2) < height * 4;
  let previous = project(range.start);
  if (valid(previous)) line.push(previous);
  // Refine real-domain boundaries (e.g. sqrt(cos(2θ))) instead of leaving
  // visible gaps at r=0. Never connect the two sides of an invalid interval.
  const boundary = (good: number, bad: number) => {
    let point = project(good);
    for (let n = 0; n < 36; n++) {
      const middle = (good + bad) / 2,
        candidate = project(middle);
      if (valid(candidate)) {
        good = middle;
        point = candidate;
      } else bad = middle;
    }
    return point;
  };
  let refinementBudget = 20000;
  const refine = (
    ta: number,
    pa: [number, number],
    tb: number,
    pb: [number, number],
    depth: number,
  ) => {
    const tm = (ta + tb) / 2,
      pm = project(tm);
    if (!valid(pm)) {
      flush();
      line.push(pb);
      return;
    }
    const error = Math.hypot(
      pm[0] - (pa[0] + pb[0]) / 2,
      pm[1] - (pa[1] + pb[1]) / 2,
    );
    if (error > 0.65 && depth > 0 && refinementBudget-- > 0) {
      refine(ta, pa, tm, pm, depth - 1);
      refine(tm, pm, tb, pb, depth - 1);
    } else {
      if (error > 8) flush();
      line.push(pb);
    }
  };
  // Midpoint checks catch jumps at poles without drawing a chord across the origin.
  for (let i = 1; i <= count; i++) {
    const t = range.start + ((range.end - range.start) * i) / count;
    const p = project(t),
      mid = project(t - (range.end - range.start) / (2 * count));
    const previousT = t - (range.end - range.start) / count;
    if (valid(previous) && !valid(p)) {
      line.push(boundary(previousT, t));
      flush();
      previous = p;
      continue;
    }
    if (!valid(previous) && valid(p)) {
      flush();
      line = [boundary(t, previousT), p];
      previous = p;
      continue;
    }
    if (valid(previous) && valid(p) && !valid(mid)) {
      const middleT = (previousT + t) / 2;
      line.push(boundary(previousT, middleT));
      flush();
      line = [boundary(t, middleT), p];
      previous = p;
      continue;
    }
    if (!valid(previous) || !valid(p) || !valid(mid)) flush();
    else refine(previousT, previous, t, p, 14);
    previous = p;
  }
  flush();
  return lines;
}
export function drawPolarGrid(
  ctx: CanvasRenderingContext2D,
  view: View,
  w: number,
  h: number,
  showGrid: boolean,
  degrees = false,
  paint: PlotTheme = plotThemes.light,
) {
  const ox = w / 2 - view.x * view.scale,
    oy = h / 2 + view.y * view.scale;
  const far = Math.max(
    ...[
      [0, 0],
      [w, 0],
      [0, h],
      [w, h],
    ].map(([x, y]) => Math.hypot(x - ox, y - oy)),
  );
  const nearest = Math.hypot(
    Math.max(0, -ox, ox - w),
    Math.max(0, -oy, oy - h),
  );
  const ideal = 70 / view.scale,
    power = 10 ** Math.floor(Math.log10(ideal));
  const unit = [1, 2, 5, 10].find((v) => v * power >= ideal)! * power;
  ctx.font = '11px "Segoe UI",sans-serif';
  ctx.lineWidth = 1;
  if (showGrid) {
    for (
      let radius = Math.max(
        unit,
        Math.ceil(nearest / view.scale / unit) * unit,
      );
      radius * view.scale <= far;
      radius += unit
    ) {
      ctx.beginPath();
      ctx.strokeStyle = paint.major;
      ctx.arc(ox, oy, radius * view.scale, 0, 2 * Math.PI);
      ctx.stroke();
      const px = ox + radius * view.scale;
      if (px > 10 && px < w - 12 && oy > 15 && oy < h - 20) {
        ctx.fillStyle = paint.text;
        ctx.textAlign = "center";
        ctx.fillText(Number(radius.toPrecision(4)).toString(), px, oy + 16);
      }
    }
    for (let i = 0; i < 12; i++) {
      // The horizontal reference line is drawn separately, with a dashed
      // negative extension even when the optional polar grid is enabled.
      if (i === 0 || i === 6) continue;
      const t = (i * Math.PI) / 6;
      ctx.beginPath();
      ctx.strokeStyle = paint.minor;
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + far * Math.cos(t), oy - far * Math.sin(t));
      ctx.stroke();
    }
    const labels = [
      "0",
      "π/6",
      "π/3",
      "π/2",
      "2π/3",
      "5π/6",
      "π",
      "7π/6",
      "4π/3",
      "3π/2",
      "5π/3",
      "11π/6",
    ];
    const labelR = Math.min(ox, w - ox, oy, h - oy) - 22;
    if (labelR > 65) {
      ctx.fillStyle = paint.text;
      ctx.textAlign = "center";
      for (let i = 0; i < 12; i++) {
        const t = (i * Math.PI) / 6;
        ctx.fillText(
          degrees ? `${i * 30}°` : labels[i],
          ox + labelR * Math.cos(t),
          oy - labelR * Math.sin(t) + 4,
        );
      }
    }
  }
  ctx.save();
  ctx.strokeStyle = paint.axis;
  ctx.lineWidth = 1.2;
  if (oy >= 0 && oy <= h) {
    if (ox > 0) {
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(0, oy);
      ctx.lineTo(Math.min(ox, w), oy);
      ctx.stroke();
    }
    if (ox < w) {
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(Math.max(0, ox), oy);
      ctx.lineTo(w, oy);
      ctx.stroke();
    }
  }
  ctx.fillStyle = paint.axisText;
  ctx.textAlign = "left";
  if (ox >= 0 && ox < w && oy >= 0 && oy < h) ctx.fillText("O", ox + 7, oy - 8);
  if (ox < w && oy >= 12 && oy < h)
    ctx.fillText(degrees ? "θ = 0°" : "θ = 0", w - 44, oy - 10);
  ctx.restore();
}
