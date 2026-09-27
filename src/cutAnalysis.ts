import { integrateCurve, type AnalysisCurve, type XY } from "./analysis.ts";

export type CutInterval = { a: number; b: number };

// Numerical candidates are local to the visible x window. Residual checks reject poles.
export function cutIntervals(
  f: AnalysisCurve,
  g: AnalysisCurve,
): CutInterval[] {
  if (f.kind !== "explicit" || g.kind !== "explicit") return [];
  const lo = Math.max(f.range.start, g.range.start),
    hi = Math.min(f.range.end, g.range.end);
  if (!(hi > lo)) return [];
  const n = 1600,
    dx = (hi - lo) / n;
  const diff = (x: number) => f.at(x)[1] - g.at(x)[1];
  const values = Array.from({ length: n + 1 }, (_, i) => diff(lo + i * dx));
  if (values.every((v) => Number.isFinite(v) && Math.abs(v) < 1e-12)) return [];
  const roots: number[] = [];
  const add = (x: number) => {
    if (
      x < lo ||
      x > hi ||
      !Number.isFinite(diff(x)) ||
      Math.abs(diff(x)) > 1e-8
    )
      return;
    if (!roots.some((r) => Math.abs(r - x) < Math.max(1e-8, dx * 1e-4)))
      roots.push(x);
  };
  for (let i = 0; i <= n; i++) {
    const x = lo + i * dx,
      v = values[i];
    if (!Number.isFinite(v)) continue;
    if (v === 0) add(x);
    if (i && v * values[i - 1] < 0) {
      let a = x - dx,
        b = x,
        va = values[i - 1];
      for (let k = 0; k < 60; k++) {
        const m = (a + b) / 2,
          vm = diff(m);
        if (!Number.isFinite(vm)) break;
        if (vm * va > 0) {
          a = m;
          va = vm;
        } else b = m;
      }
      add((a + b) / 2);
    }
    // Local minima of |f-g| also seed even-multiplicity (tangent) roots.
    if (
      i > 0 &&
      i < n &&
      Math.abs(v) < Math.abs(values[i - 1]) &&
      Math.abs(v) < Math.abs(values[i + 1])
    ) {
      let u = x;
      for (let k = 0; k < 55; k++) {
        const h = Math.max(1e-8, dx * 0.001),
          y = diff(u);
        const d = (diff(u + h) - diff(u - h)) / (2 * h);
        if (!Number.isFinite(d) || Math.abs(d) < 1e-15 || y === 0) break;
        const next = u - y / d;
        if (next < x - dx || next > x + dx) break;
        u = next;
      }
      add(u);
    }
  }
  roots.sort((a, b) => a - b);
  const intervals: CutInterval[] = [];
  for (let i = 1; i < roots.length; i++) {
    const a = roots[i - 1],
      b = roots[i];
    if (b - a < dx * 1e-4) continue;
    // A closed candidate must have continuous, noncoincident boundaries.
    try {
      integrateCurve(f, a, b);
      integrateCurve(g, a, b);
      if (
        Array.from({ length: 9 }, (_, j) =>
          Math.abs(diff(a + ((b - a) * (j + 1)) / 10)),
        ).some((v) => v > 1e-9)
      )
        intervals.push({ a, b });
    } catch {
      /* Unsupported improper intervals are not selectable. */
    }
  }
  return intervals;
}

export function regionArea(
  f: AnalysisCurve,
  g: AnalysisCurve,
  a: number,
  b: number,
) {
  if (f.kind !== "explicit" || g.kind !== "explicit")
    throw new Error("区域面积目前支持两条显函数");
  return integrateCurve(
    {
      ...f,
      guards: [...f.guards, ...g.guards],
      at: (x) => [x, Math.abs(f.at(x)[1] - g.at(x)[1])],
    },
    Math.min(a, b),
    Math.max(a, b),
  );
}

export function lineIntegral(
  c: AnalysisCurve,
  a: number,
  b: number,
  density: (x: number, y: number) => number = () => 1,
) {
  if (c.kind !== "explicit") throw new Error("取曲线段目前支持显函数");
  if (a === b) return integrateCurve(c, a, b);
  const lo = Math.min(a, b),
    hi = Math.max(a, b);
  return integrateCurve(
    {
      ...c,
      at: (x) => {
        const h = Math.min(1e-5 * Math.max(1, Math.abs(x)), (hi - lo) / 1000);
        const left = Math.max(lo, x - h),
          right = Math.min(hi, x + h);
        const y = c.at(x)[1],
          slope = (c.at(right)[1] - c.at(left)[1]) / (right - left);
        return [x, density(x, y) * Math.hypot(1, slope)] as XY;
      },
    },
    lo,
    hi,
  );
}
