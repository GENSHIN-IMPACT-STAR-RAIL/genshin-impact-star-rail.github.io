import { normalCdf, normalSf, normalQuantile } from "../math.ts";
import { countProbability, type CountModel, type Mass } from "./model.ts";
import type {
  CountEvent,
  PoissonState,
  NormalState,
  ContinuousState,
} from "./state.ts";

const clampMarker = (value: number) => Math.max(-1e6, Math.min(1e6, value));
/** Drag and keyboard edits preserve ordered event bounds and the saved-state domain. */
export function normalMarkerPatch(
  state: Pick<NormalState, "event" | "low" | "high">,
  index: number,
  value: number,
): Partial<NormalState> {
  if (!Number.isFinite(value) || state.event === "central") return {};
  const next = clampMarker(value),
    paired = state.event === "interval" || state.event === "outside";
  if (index === 0) return { low: paired ? Math.min(next, state.high) : next };
  return index === 1 && paired ? { high: Math.max(next, state.low) } : {};
}
export function continuousMarkerPatch(
  state: Pick<ContinuousState, "low" | "high">,
  index: number,
  value: number,
): Partial<ContinuousState> {
  if (!Number.isFinite(value)) return {};
  const next = clampMarker(value);
  return index === 0
    ? { low: Math.min(next, state.high) }
    : index === 1
      ? { high: Math.max(next, state.low) }
      : index === 2
        ? { cursor: next }
        : {};
}
export function selected(
  x: number,
  event: CountEvent,
  low: number,
  high: number,
) {
  return event === "le"
    ? x <= low
    : event === "lt"
      ? x < low
      : event === "ge"
        ? x >= low
        : event === "gt"
          ? x > low
          : event === "equal"
            ? x === low
            : x >= low && x <= high;
}
export function eventBounds(
  event: CountEvent,
  low: number,
  high: number,
): [number, number] {
  return event === "le"
    ? [-Infinity, Math.floor(low)]
    : event === "lt"
      ? [-Infinity, Math.ceil(low) - 1]
      : event === "ge"
        ? [Math.ceil(low), Infinity]
        : event === "gt"
          ? [Math.floor(low) + 1, Infinity]
          : event === "equal"
            ? [low, low]
            : [Math.ceil(low), Math.floor(high)];
}
export function eventProbability(
  model: CountModel,
  event: CountEvent,
  low: number,
  high: number,
) {
  if (model.kind === "finite")
    return model.masses.reduce(
      (s, p) => s + (selected(p.x, event, low, high) ? p.y : 0),
      0,
    );
  const [a, b] = eventBounds(event, low, high);
  return countProbability(model, a, b);
}
export function normalInterval(
  mean: number,
  sd: number,
  low: number,
  high: number,
): number {
  if (!Number.isFinite(mean) || !Number.isFinite(sd) || sd <= 0)
    throw new Error("正态模型要求有限 μ 与 σ>0。");
  if (low > high) return 0;
  const a = (low - mean) / sd,
    b = (high - mean) / sd;
  return Math.max(
    0,
    a >= 0 ? normalSf(a) - normalSf(b) : normalCdf(b) - normalCdf(a),
  );
}
export function normalFromQuantiles(
  x1: number,
  p1: number,
  x2: number,
  p2: number,
) {
  if (!(p1 > 0 && p1 < 1 && p2 > 0 && p2 < 1))
    throw new Error("参数反求使用严格位于 (0,1) 的概率。");
  const z1 = normalQuantile(p1),
    z2 = normalQuantile(p2);
  if (Math.abs(z1 - z2) < 1e-13)
    throw new Error(
      x1 === x2
        ? "两条件相同，不能唯一确定两个参数。"
        : "相同概率对应不同分位，不存在正态解。",
    );
  const sd = (x2 - x1) / (z2 - z1),
    mean = x1 - sd * z1;
  if (sd <= 0 || !Number.isFinite(sd) || !Number.isFinite(mean))
    throw new Error("条件顺序不相容：解要求 σ>0。");
  return {
    mean,
    sd,
    residual: Math.max(
      Math.abs(normalCdf((x1 - mean) / sd) - p1),
      Math.abs(normalCdf((x2 - mean) / sd) - p2),
    ),
  };
}
export function poissonWindow(
  s: Pick<
    PoissonState,
    "rate" | "window" | "rateUnit" | "windowUnit" | "combine" | "secondRate"
  >,
) {
  const units: Record<string, { scale: number; dimension: string }> = {
    second: { scale: 1, dimension: "time" },
    minute: { scale: 60, dimension: "time" },
    hour: { scale: 3600, dimension: "time" },
    centimetre: { scale: 0.01, dimension: "length" },
    metre: { scale: 1, dimension: "length" },
    kilometre: { scale: 1000, dimension: "length" },
    squareCentimetre: { scale: 0.0001, dimension: "area" },
    squareMetre: { scale: 1, dimension: "area" },
    squareKilometre: { scale: 1e6, dimension: "area" },
  };
  const ru = units[s.rateUnit],
    wu = units[s.windowUnit];
  if (ru.dimension !== wu.dimension)
    throw new Error("长度、面积和时间是不同维度，观察窗口必须使用相同维度。");
  const multiplier = wu.scale / ru.scale,
    rate = s.rate + (s.combine ? s.secondRate : 0),
    lambda = rate * s.window * multiplier;
  if (!Number.isFinite(lambda) || lambda < 0 || lambda > 1000)
    throw new Error("当前窗口的 λ 须在 0–1000 内；请缩短窗口或降低发生率。");
  return { lambda, rate, multiplier };
}
export function poissonWindowForCdf(k: number, q: number, rate: number) {
  if (!Number.isInteger(k) || k < 0 || q <= 0 || q >= 1 || rate <= 0)
    throw new Error("窗口反求要求 k≥0 为整数、0<q<1 且发生率>0。");
  if (countProbability({ kind: "poisson", lambda: 1000 }, 0, k) > q)
    throw new Error("λ 解超过此工具的 1000 上限。");
  let lo = 0,
    hi = 1000;
  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2;
    if (countProbability({ kind: "poisson", lambda: mid }, 0, k) > q) lo = mid;
    else hi = mid;
  }
  const lambda = (lo + hi) / 2;
  return {
    lambda,
    window: lambda / rate,
    residual: Math.abs(countProbability({ kind: "poisson", lambda }, 0, k) - q),
  };
}
export function seededPoissonSamples(
  lambda: number,
  size: number,
  seed = 20260925,
): number[] {
  let state = seed >>> 0;
  const uniform = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return (state + 0.5) / 4294967296;
  };
  const draw = () => {
    if (lambda === 0) return 0;
    let time = 0,
      count = 0;
    while (true) {
      time += -Math.log(uniform());
      if (time > lambda) return count;
      count++;
    }
  };
  return Array.from({ length: size }, draw);
}
export function sampleHistogram(samples: number[]): Mass[] {
  const map = new Map<number, number>();
  samples.forEach((x) => map.set(x, (map.get(x) ?? 0) + 1 / samples.length));
  return [...map].map(([x, y]) => ({ x, y })).sort((a, b) => a.x - b.x);
}
/** Model-generated positions in one window, expressed as fractions of its length. */
export function seededPoissonWindow(lambda: number, seed = 20260925): number[] {
  if (lambda === 0) return [];
  let state = seed >>> 0,
    time = 0;
  const positions: number[] = [];
  while (true) {
    state = (1664525 * state + 1013904223) >>> 0;
    time += -Math.log((state + 0.5) / 4294967296);
    if (time > lambda) return positions;
    positions.push(time / lambda);
  }
}
