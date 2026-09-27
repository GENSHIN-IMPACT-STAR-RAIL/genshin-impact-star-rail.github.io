import {
  implicitSegments,
  type CompiledPlot,
  type ParameterRange,
} from "./cartesian.ts";
import { excludedParameters } from "./domainMarkers.ts";
import { exactInput, type ExactValue, type ExactPoint } from "./exact.ts";
import type { Parameters } from "./math";
import type { View } from "./plot";

export type XY = [number, number];
export type AnalysisEntry = {
  id: number;
  visible: boolean;
  color: string;
  value: string;
  left?: string;
  fn: CompiledPlot | null;
  parameterInterval: ParameterRange | null;
};
export type AnalysisCurve = {
  key: string;
  name: string;
  color: string;
  value: string;
  left?: string;
  kind: "explicit" | "implicit" | "parametric" | "polar";
  range: ParameterRange;
  at: (u: number) => XY;
  field?: (x: number, y: number) => number;
  radius?: (u: number) => number;
  guards: ((u: number) => number)[];
  parameters?: Parameters;
};
export type Hit = { key: string; xy: XY; u?: number; exactU?: ExactValue };
export type Pick = { xy: XY; hits: Hit[]; kind: string; exactXY?: ExactPoint };
type Segment = { a: XY; b: XY; ua?: number; ub?: number };
export type CurveMesh = { curve: AnalysisCurve; segments: Segment[] };
const finite = (p: XY) => p.every(Number.isFinite);
const distance = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const step = (x: number) => 1e-5 * Math.max(1, Math.abs(x));
const derivative = (f: (u: number) => number, u: number) => {
  const h = step(u);
  return (f(u + h) - f(u - h)) / (2 * h);
};
const gradient = (f: (x: number, y: number) => number, p: XY): XY => [
  derivative((x) => f(x, p[1]), p[0]),
  derivative((y) => f(p[0], y), p[1]),
];
const validU = (c: AnalysisCurve, u: number) =>
  Number.isFinite(u) &&
  (c.kind === "explicit" ||
    (u >= c.range.start - 1e-10 && u <= c.range.end + 1e-10));

export function analysisCurves(
  entries: AnalysisEntry[],
  params: Parameters,
  polar: boolean,
  angular: ParameterRange | null,
  showNegative: boolean,
  view: View,
  width: number,
): AnalysisCurve[] {
  return entries.flatMap((e, index) => {
    if (!e.visible || !e.fn || (polar && !angular)) return [];
    const fn = e.fn;
    const guards = fn.domainGuards.map((g) => (u: number) => g(u, params));
    const defined = (u: number) =>
      guards.every((g) => Number.isFinite(g(u)) && Math.abs(g(u)) > 1e-12);
    const base = {
      key: `${e.id}:0`,
      name: `曲线 ${index + 1}`,
      color: e.color,
      value: e.value,
      left: e.left,
      guards,
      parameters: { ...params },
    };
    if (polar)
      return fn.branches.map((branch, i): AnalysisCurve => {
        const radius = (u: number) => {
          const r = branch(u, params);
          return defined(u) && (showNegative || r >= 0) ? r : NaN;
        };
        return {
          ...base,
          key: `${e.id}:${i}`,
          name: base.name + (fn.branches.length > 1 ? ` · 分支 ${i + 1}` : ""),
          kind: "polar",
          range: angular!,
          radius,
          at: (u) => {
            const r = radius(u);
            return [r * Math.cos(u), r * Math.sin(u)];
          },
        };
      });
    if (fn.implicit)
      return [
        {
          ...base,
          kind: "implicit" as const,
          range: { start: 0, end: 1 },
          at: () => [NaN, NaN] as XY,
          field: (x: number, y: number) => fn.implicit!(x, y, params),
        },
      ];
    if (fn.parametric)
      return e.parameterInterval
        ? [
            {
              ...base,
              kind: "parametric" as const,
              range: e.parameterInterval,
              at: (u: number): XY =>
                defined(u) ? fn.parametric!(u, params) : [NaN, NaN],
            },
          ]
        : [];
    return [
      {
        ...base,
        kind: "explicit" as const,
        range: {
          start: view.x - width / (2 * view.scale),
          end: view.x + width / (2 * view.scale),
        },
        at: (u: number): XY => [u, defined(u) ? fn.evaluate(u, params) : NaN],
      },
    ];
  });
}

export function curveMesh(
  curve: AnalysisCurve,
  view: View,
  w: number,
  h: number,
): CurveMesh {
  const segments: Segment[] = [];
  if (curve.field) {
    const world = (p: XY): XY => [
      view.x + (p[0] - w / 2) / view.scale,
      view.y - (p[1] - h / 2) / view.scale,
    ];
    for (const line of implicitSegments(curve.field, view, w, h))
      for (let i = 1; i < line.length; i++)
        segments.push({ a: world(line[i - 1]), b: world(line[i]) });
  } else {
    const n = Math.min(
      2400,
      Math.max(
        600,
        Math.ceil(w),
        Math.ceil((curve.range.end - curve.range.start) * 32),
      ),
    );
    let ua = curve.range.start,
      a = curve.at(ua);
    for (let i = 1; i <= n; i++) {
      const ub =
          curve.range.start + ((curve.range.end - curve.range.start) * i) / n,
        b = curve.at(ub);
      const mid = curve.at((ua + ub) / 2);
      if (
        finite(a) &&
        finite(b) &&
        finite(mid) &&
        distance(a, b) * view.scale < Math.max(w, h) &&
        distance(mid, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]) * view.scale < 12
      )
        segments.push({ a, b, ua, ub });
      a = b;
      ua = ub;
    }
  }
  return { curve, segments };
}

function projectImplicit(c: AnalysisCurve, p: XY): Hit | null {
  let xy: XY = [...p];
  for (let i = 0; i < 18; i++) {
    const f = c.field!(...xy),
      g = gradient(c.field!, xy),
      norm = g[0] ** 2 + g[1] ** 2;
    if (!Number.isFinite(f) || !Number.isFinite(norm) || norm < 1e-20)
      return null;
    const delta: XY = [(f * g[0]) / norm, (f * g[1]) / norm];
    xy = [xy[0] - delta[0], xy[1] - delta[1]];
    if (Math.hypot(...delta) < 1e-10) break;
  }
  const g = gradient(c.field!, xy);
  return finite(xy) &&
    Math.abs(c.field!(...xy)) / Math.max(1e-20, Math.hypot(...g)) < 1e-7
    ? { key: c.key, xy }
    : null;
}

export function nearestOnCurve(mesh: CurveMesh, target: XY): Hit | null {
  let best: Segment | undefined,
    bestDistance = Infinity,
    seed: XY = target;
  for (const s of mesh.segments) {
    const dx = s.b[0] - s.a[0],
      dy = s.b[1] - s.a[1];
    const t = Math.max(
      0,
      Math.min(
        1,
        ((target[0] - s.a[0]) * dx + (target[1] - s.a[1]) * dy) /
          (dx * dx + dy * dy || 1),
      ),
    );
    const p: XY = [s.a[0] + t * dx, s.a[1] + t * dy],
      d = distance(p, target);
    if (d < bestDistance) {
      bestDistance = d;
      best = s;
      seed = p;
    }
  }
  if (!best) return null;
  const c = mesh.curve;
  if (c.field) return projectImplicit(c, seed);
  let lo = best.ua!,
    hi = best.ub!;
  for (let i = 0; i < 34; i++) {
    const a = lo + (hi - lo) / 3,
      b = hi - (hi - lo) / 3;
    if (distance(c.at(a), target) < distance(c.at(b), target)) hi = b;
    else lo = a;
  }
  const candidates = [lo, hi, best.ua!, best.ub!];
  const u = candidates.reduce((a, b) =>
    distance(c.at(a), target) < distance(c.at(b), target) ? a : b,
  );
  return finite(c.at(u)) ? { key: c.key, u, xy: c.at(u) } : null;
}

function scalarRoot(
  f: (u: number) => number,
  seed: number,
  maxTravel: number,
): number | null {
  let u = seed;
  for (let i = 0; i < 28; i++) {
    const y = f(u),
      d = derivative(f, u);
    if (!Number.isFinite(y) || !Number.isFinite(d)) return null;
    if (y === 0 || (Math.abs(y) < 1e-10 && Math.abs(y / d) < 1e-10)) return u;
    if (Math.abs(d) < 1e-14) return null;
    const next = u - y / d;
    if (!Number.isFinite(next) || Math.abs(next - seed) > maxTravel)
      return null;
    u = next;
  }
  return Math.abs(f(u)) < 1e-8 ? u : null;
}

function solvePair(
  f: (x: number, y: number) => XY,
  seed: XY,
  limit: number,
): XY | null {
  let p: XY = [...seed];
  for (let i = 0; i < 28; i++) {
    const v = f(...p);
    if (!finite(v)) return null;
    if (v[0] === 0 && v[1] === 0) return p;
    const a = gradient((x, y) => f(x, y)[0], p),
      b = gradient((x, y) => f(x, y)[1], p);
    const det = a[0] * b[1] - a[1] * b[0];
    if (!Number.isFinite(det) || Math.abs(det) < 1e-18)
      return Math.hypot(...v) < 1e-10 ? p : null;
    const next: XY = [
      p[0] - (v[0] * b[1] - v[1] * a[1]) / det,
      p[1] - (a[0] * v[1] - b[0] * v[0]) / det,
    ];
    if (distance(next, p) < 1e-10 && Math.hypot(...v) < 1e-10) return next;
    p = next;
    if (distance(p, seed) > limit) return null;
  }
  return Math.hypot(...f(...p)) < 1e-8 ? p : null;
}

function intersection(
  a: AnalysisCurve,
  ha: Hit,
  b: AnalysisCurve,
  hb: Hit,
): Hit[] | null {
  if (a.field && b.field) {
    const xy = solvePair((x, y) => [a.field!(x, y), b.field!(x, y)], ha.xy, 2);
    return xy
      ? [
          { key: a.key, xy },
          { key: b.key, xy },
        ]
      : null;
  }
  if (a.field) return intersection(b, hb, a, ha);
  if (b.field) {
    const u = scalarRoot(
      (t) => b.field!(...a.at(t)),
      ha.u!,
      Math.max(1, a.range.end - a.range.start),
    );
    return u !== null && validU(a, u) && finite(a.at(u))
      ? [
          { key: a.key, xy: a.at(u), u },
          { key: b.key, xy: a.at(u) },
        ]
      : null;
  }
  const uv = solvePair(
    (u, v) => {
      const p = a.at(u),
        q = b.at(v);
      return [p[0] - q[0], p[1] - q[1]];
    },
    [ha.u!, hb.u!],
    Math.max(1, a.range.end - a.range.start, b.range.end - b.range.start),
  );
  return uv && validU(a, uv[0]) && validU(b, uv[1]) && finite(a.at(uv[0]))
    ? [
        { key: a.key, xy: a.at(uv[0]), u: uv[0] },
        { key: b.key, xy: b.at(uv[1]), u: uv[1] },
      ]
    : null;
}

export function tangent(
  c: AnalysisCurve,
  hit: Hit,
): { direction: XY; latex: string } | null {
  let d: XY;
  if (c.field) {
    const g = gradient(c.field, hit.xy);
    d = [g[1], -g[0]];
  } else {
    if (hit.u === undefined) return null;
    const u = hit.u,
      h = step(u),
      p = c.at(u),
      a = c.at(u - h),
      b = c.at(u + h);
    if (!finite(a) || !finite(b)) return null;
    const left: XY = [p[0] - a[0], p[1] - a[1]],
      right: XY = [b[0] - p[0], b[1] - p[1]];
    const nl = Math.hypot(...left),
      nr = Math.hypot(...right);
    if (
      nl < 1e-14 ||
      nr < 1e-14 ||
      (left[0] * right[0] + left[1] * right[1]) / (nl * nr) < 0.999
    )
      return null;
    d = [(b[0] - a[0]) / (2 * h), (b[1] - a[1]) / (2 * h)];
  }
  const norm = Math.hypot(...d);
  if (!Number.isFinite(norm) || norm < 1e-9) return null;
  d = [d[0] / norm, d[1] / norm];
  const [x, y] = hit.xy;
  if (Math.abs(d[0]) < 1e-7)
    return { direction: d, latex: `x=${formatNumber(x)}` };
  const m = d[1] / d[0],
    b = y - m * x;
  return {
    direction: d,
    latex:
      Math.abs(m) < 1e-8
        ? `y=${formatNumber(y)}`
        : `y=${formatNumber(m)}x${b < -1e-8 ? "-" : "+"}${formatNumber(Math.abs(b))}`,
  };
}

export function snapPoint(
  meshes: CurveMesh[],
  target: XY,
  scale: number,
  filter = "",
): Pick | null {
  const close = meshes
    .map((mesh) => ({ mesh, hit: nearestOnCurve(mesh, target) }))
    .filter(
      (p): p is { mesh: CurveMesh; hit: Hit } =>
        !!p.hit && distance(p.hit.xy, target) * scale < 22,
    );
  const candidates: Pick[] = [];
  for (let i = 0; i < close.length; i++)
    for (let j = i + 1; j < close.length; j++) {
      const a = close[i],
        b = close[j];
      if (filter && a.mesh.curve.key !== filter && b.mesh.curve.key !== filter)
        continue;
      const hits = intersection(a.mesh.curve, a.hit, b.mesh.curve, b.hit);
      // Coincident curves do not define an isolated intersection to snap to.
      const c = a.mesh.curve,
        direction = tangent(c, a.hit)?.direction;
      const overlap =
        hits &&
        [-1, 1].every((sign) => {
          let p: XY | undefined;
          if (a.hit.u !== undefined) {
            const u =
              a.hit.u +
              sign * Math.max(0.001, (c.range.end - c.range.start) * 0.002);
            if (validU(c, u)) p = c.at(u);
          } else if (direction) {
            p = projectImplicit(c, [
              a.hit.xy[0] + (sign * direction[0] * 5) / scale,
              a.hit.xy[1] + (sign * direction[1] * 5) / scale,
            ])?.xy;
          }
          if (!p || !finite(p)) return false;
          const near = nearestOnCurve(b.mesh, p);
          return !!near && distance(near.xy, p) < 1e-7;
        });
      if (hits && !overlap && distance(hits[0].xy, target) * scale < 16)
        candidates.push({ xy: hits[0].xy, hits, kind: "交点" });
    }
  for (const {
    mesh: { curve: c },
    hit,
  } of close) {
    if (filter && c.key !== filter) continue;
    for (const special of ["驻点", "垂直切点", "x 轴交点", "y 轴交点"]) {
      let h: Hit | null = null;
      if (c.field) {
        const extra =
          special === "驻点"
            ? (x: number, y: number) => gradient(c.field!, [x, y])[0]
            : special === "垂直切点"
              ? (x: number, y: number) => gradient(c.field!, [x, y])[1]
              : special === "x 轴交点"
                ? (_x: number, y: number) => y
                : (x: number) => x;
        const xy = solvePair(
          (x, y) => [c.field!(x, y), extra(x, y)],
          hit.xy,
          22 / scale,
        );
        if (xy) h = { key: c.key, xy };
        if (
          h &&
          special === "x 轴交点" &&
          Math.abs(c.field(h.xy[0] - 0.001, 0)) < 1e-10 &&
          Math.abs(c.field(h.xy[0] + 0.001, 0)) < 1e-10
        )
          h = null;
        if (
          h &&
          special === "y 轴交点" &&
          Math.abs(c.field(0, h.xy[1] - 0.001)) < 1e-10 &&
          Math.abs(c.field(0, h.xy[1] + 0.001)) < 1e-10
        )
          h = null;
      } else {
        const f =
          special === "驻点"
            ? (u: number) => derivative((t) => c.at(t)[1], u)
            : special === "垂直切点"
              ? (u: number) => derivative((t) => c.at(t)[0], u)
              : special === "x 轴交点"
                ? (u: number) => c.at(u)[1]
                : (u: number) => c.at(u)[0];
        const u = scalarRoot(
          f,
          hit.u!,
          Math.max(1, c.range.end - c.range.start),
        );
        if (u !== null && validU(c, u) && finite(c.at(u)))
          h = { key: c.key, u, xy: c.at(u) };
        // A horizontal/vertical line has no isolated stationary/vertical point.
        if (
          h &&
          Math.abs(f(h.u! - 0.001)) < 1e-8 &&
          Math.abs(f(h.u! + 0.001)) < 1e-8
        )
          h = null;
      }
      if (
        h &&
        distance(h.xy, target) * scale < 16 &&
        (!(special === "驻点" || special === "垂直切点") || tangent(c, h))
      )
        candidates.push({ xy: h.xy, hits: [h], kind: special });
    }
  }
  const priority = (p: Pick) =>
    p.kind === "交点"
      ? 0
      : p.kind === "驻点"
        ? 1
        : p.kind === "垂直切点"
          ? 2
          : 3;
  const special = candidates.sort((a, b) => {
    const delta = (distance(a.xy, target) - distance(b.xy, target)) * scale;
    return Math.abs(delta) < 0.5 ? priority(a) - priority(b) : delta;
  })[0];
  if (special) {
    // Keep every curve through a special point available for the tangent selector.
    for (const { mesh, hit } of close) {
      if (special.hits.some((h) => h.key === hit.key)) continue;
      const near = nearestOnCurve(mesh, special.xy);
      if (near && distance(near.xy, special.xy) < 1e-7) special.hits.push(near);
    }
    return special;
  }
  const near = close
    .filter((p) => !filter || p.hit.key === filter)
    .sort((a, b) => distance(a.hit.xy, target) - distance(b.hit.xy, target))[0];
  return near && distance(near.hit.xy, target) * scale < 14
    ? { xy: near.hit.xy, hits: [near.hit], kind: "曲线上的点" }
    : null;
}

export function readCoordinate(text: string): number {
  return exactInput(text).value;
}
export const formatNumber = (n: number) =>
  Math.abs(n) < 1e-9 ? "0" : Number(n.toPrecision(7)).toString();

export function integrateCurve(c: AnalysisCurve, a: number, b: number): number {
  if (c.kind === "implicit")
    throw new Error("隐函数请先改写为显函数或参数方程，再计算积分");
  if (!validU(c, a) || !validU(c, b))
    throw new Error("积分端点超出曲线的参数范围");
  if (!finite(c.at(a)) || !finite(c.at(b))) throw new Error("积分端点未定义");
  if (a === b) return 0;
  const lo = Math.min(a, b),
    hi = Math.max(a, b);
  if (
    excludedParameters(
      c.guards.map((g) => (u: number) => g(u)),
      { start: lo, end: hi },
      {},
    ).length
  )
    throw new Error("区间含未定义点，暂不计算反常积分");
  let count = 0;
  const f = (u: number) => {
    if (++count > 50000) throw new Error("积分未收敛，请缩小区间");
    const p = c.at(u);
    let y = p[1];
    if (!finite(p)) throw new Error("区间含未定义点，无法计算积分");
    if (c.kind === "polar") y = 0.5 * c.radius!(u) ** 2;
    if (c.kind === "parametric") y *= derivative((t) => c.at(t)[0], u);
    if (!Number.isFinite(y)) throw new Error("积分函数在区间内未定义");
    return y;
  };
  const simpson = (a: number, b: number, fa: number, fm: number, fb: number) =>
    ((b - a) * (fa + 4 * fm + fb)) / 6;
  const adapt = (
    a: number,
    b: number,
    fa: number,
    fm: number,
    fb: number,
    whole: number,
    tol: number,
    depth: number,
  ): number => {
    const m = (a + b) / 2,
      fl = f((a + m) / 2),
      fr = f((m + b) / 2);
    const left = simpson(a, m, fa, fl, fm),
      right = simpson(m, b, fm, fr, fb),
      error = left + right - whole;
    if (Math.abs(error) < 15 * tol) return left + right + error / 15;
    if (depth === 0) throw new Error("积分未收敛，区间可能存在奇点");
    return (
      adapt(a, m, fa, fl, fm, left, tol / 2, depth - 1) +
      adapt(m, b, fm, fr, fb, right, tol / 2, depth - 1)
    );
  };
  let total = 0;
  for (let i = 0; i < 64; i++) {
    // Uneven seed intervals avoid aliasing a periodic function at equally spaced nodes.
    const x = lo + (hi - lo) * (i / 64) ** 1.1,
      y = lo + (hi - lo) * ((i + 1) / 64) ** 1.1;
    const fa = f(x),
      fm = f((x + y) / 2),
      fb = f(y),
      whole = simpson(x, y, fa, fm, fb);
    total += adapt(x, y, fa, fm, fb, whole, 1e-9 + Math.abs(whole) * 1e-8, 16);
  }
  if (!Number.isFinite(total)) throw new Error("积分数值超出可计算范围");
  return a < b ? total : -total;
}
