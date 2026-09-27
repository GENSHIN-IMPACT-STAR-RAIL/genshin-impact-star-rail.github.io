import type { Parameters } from "./math";
import type { View } from "./plot";
import { polarPoint, type AngleRange } from "./polar.ts";
type Fn = (t: number, params: Parameters) => number;
type Point = [number, number];

/** Find zeros of actual domain restrictions, not generic sampling failures. */
export function excludedParameters(
  guards: Fn[],
  range: AngleRange,
  params: Parameters,
): number[] {
  const found: number[] = [];
  const span = range.end - range.start,
    n = Math.min(4000, Math.max(512, Math.ceil(span * 80)));
  const add = (t: number) => {
    if (!found.some((x) => Math.abs(x - t) < Math.max(1, Math.abs(t)) * 1e-9))
      found.push(t);
  };
  for (const guard of guards) {
    const f = (t: number) => guard(t, params);
    let a = range.start,
      fa = f(a);
    // A restriction that vanishes throughout the sampled interval does not
    // describe an isolated hole (e.g. division by a zero parameter).
    if (fa === 0 && f(range.end) === 0 && f((a + range.end) / 2) === 0)
      continue;
    for (let i = 1; i <= n; i++) {
      const b = range.start + (span * i) / n,
        fb = f(b);
      if (Number.isFinite(fa) && Number.isFinite(fb)) {
        const tolerance =
          1e-11 * Math.max(1, Math.min(Math.abs(fa), Math.abs(fb)));
        if (Math.abs(fa) < tolerance) add(a);
        if (i === n && Math.abs(fb) < tolerance) add(b);
        if (fa !== 0 && fb !== 0 && Math.sign(fa) !== Math.sign(fb)) {
          let lo = a,
            hi = b,
            fl = fa;
          for (let j = 0; j < 52; j++) {
            const mid = (lo + hi) / 2,
              fm = f(mid);
            if (!Number.isFinite(fm)) break;
            if (Math.sign(fl) === Math.sign(fm)) {
              lo = mid;
              fl = fm;
            } else hi = mid;
          }
          const root = (lo + hi) / 2;
          if (Math.abs(f(root)) <= tolerance) add(root);
        }
      }
      a = b;
      fa = fb;
    }
  }
  return found.sort((a, b) => a - b);
}

/** Conservative finite one-sided limits. No rings for infinity or clipping. */
export function finiteOpenPoints(
  roots: number[],
  branches: Fn[],
  range: AngleRange,
  params: Parameters,
  view: View,
  width: number,
  height: number,
  polar: boolean,
  showNegative = true,
): Point[] {
  const result: Point[] = [];
  const toPixel = ([x, y]: Point): Point => [
    width / 2 + (x - view.x) * view.scale,
    height / 2 - (y - view.y) * view.scale,
  ];
  for (const t of roots)
    for (const fn of branches)
      for (const direction of [-1, 1]) {
        const available = direction < 0 ? t - range.start : range.end - t;
        if (available <= 1e-14) continue;
        let step = Math.min(
          available / 2,
          Math.max(1, range.end - range.start) * 1e-3,
        );
        const samples: Point[] = [];
        for (let i = 0; i < 10; i++, step *= 0.1) {
          const at = t + direction * step,
            value = fn(at, params);
          if (
            !Number.isFinite(value) ||
            (polar && !showNegative && value < 0)
          ) {
            samples.length = 0;
            continue;
          }
          const point: Point = polar ? polarPoint(value, at) : [at, value];
          samples.push(point);
        }
        if (samples.length < 3) continue;
        const last = samples.slice(-3).map(toPixel);
        if (
          Math.hypot(last[2][0] - last[1][0], last[2][1] - last[1][1]) > 0.12 ||
          Math.hypot(last[1][0] - last[0][0], last[1][1] - last[0][1]) > 0.4
        )
          continue;
        // For a convergent sequence estimate the limit coordinate, eliminating the
        // remaining offset of square-root approaches to the pole.
        const estimate: Point = [0, 1].map((k) => {
          const [a, b, c] = last.map((p) => p[k]);
          const denom = c - 2 * b + a;
          const extrapolated =
            Math.abs(denom) > 1e-14 ? a - (b - a) ** 2 / denom : c;
          return Number.isFinite(extrapolated) &&
            Math.abs(extrapolated - c) < 0.5
            ? extrapolated
            : c;
        }) as Point;
        if (
          estimate[0] < -6 ||
          estimate[0] > width + 6 ||
          estimate[1] < -6 ||
          estimate[1] > height + 6
        )
          continue;
        if (
          !result.some(
            (p) => Math.hypot(p[0] - estimate[0], p[1] - estimate[1]) < 3,
          )
        )
          result.push(estimate);
      }
  return result;
}
