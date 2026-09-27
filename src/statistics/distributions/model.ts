export type Mass = { x: number; y: number };
export type Segment = { low: number; high: number; coefficients: number[] };
export type FiniteModel = { kind: "finite"; masses: Mass[] };
export type CountModel =
  | FiniteModel
  | { kind: "binomial"; n: number; p: number }
  | { kind: "geometric"; p: number }
  | { kind: "poisson"; lambda: number };
export type Density =
  | { kind: "polynomial"; segments: Segment[] }
  | { kind: "exponential"; rate: number }
  | { kind: "power"; power: number };

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export function parseProbability(value: string): number {
  const parts = value.trim().split("/");
  if (
    parts.length > 2 ||
    parts.some((p) => !/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(p.trim()))
  )
    throw new Error("概率须为小数或分数，例如 0.25 或 1/4。");
  const number = Number(parts[0]) / (parts.length === 2 ? Number(parts[1]) : 1);
  if (!Number.isFinite(number))
    throw new Error("概率必须是有限数，分母不能为 0。");
  return number;
}
export function parseMasses(text: string, integers = false): Mass[] {
  const rows = text
    .trim()
    .split(/\n|;/)
    .filter((row) => row.trim());
  if (!rows.length || rows.length > 100)
    throw new Error("请输入 1–100 行，每行：取值, 概率。");
  const combined = new Map<number, number>();
  for (const row of rows) {
    const cells = row.trim().split(/[,，\s]+/);
    if (cells.length !== 2)
      throw new Error("每行恰好两个数：取值, 概率。分数内不要加空格。");
    const x = Number(cells[0]),
      y = parseProbability(cells[1]);
    if (
      !Number.isFinite(x) ||
      Math.abs(x) > 1e6 ||
      (integers && !Number.isInteger(x)) ||
      y < 0 ||
      y > 1
    )
      throw new Error(
        integers
          ? "取值须为有界整数，概率在 [0,1] 内。"
          : "取值须为有限数且绝对值不超过 10⁶，概率在 [0,1] 内。",
      );
    combined.set(x, (combined.get(x) ?? 0) + y);
  }
  const masses = [...combined]
    .map(([x, y]) => ({ x, y }))
    .sort((a, b) => a.x - b.x);
  if (Math.abs(masses.reduce((s, p) => s + p.y, 0) - 1) > 1e-10)
    throw new Error("概率之和必须等于 1；系统不会自动归一化。");
  return masses.filter((p) => p.y > 0);
}
export function moments(masses: Mass[]) {
  const mean = masses.reduce((s, p) => s + p.x * p.y, 0),
    second = masses.reduce((s, p) => s + p.x * p.x * p.y, 0);
  return {
    mean,
    second,
    variance: Math.max(
      0,
      masses.reduce((s, p) => s + (p.x - mean) ** 2 * p.y, 0),
    ),
  };
}
export function binomialMasses(n: number, p: number): Mass[] {
  if (
    !Number.isInteger(n) ||
    n < 0 ||
    n > 1000 ||
    !Number.isFinite(p) ||
    p < 0 ||
    p > 1
  )
    throw new Error("二项参数要求 n 为 0–1000 的整数且 0≤p≤1。");
  const values = Array(n + 1).fill(0) as number[];
  if (p === 0 || p === 1 || n === 0) {
    values[p === 1 ? n : 0] = 1;
    return values.map((y, x) => ({ x, y }));
  }
  const mode = Math.min(n, Math.floor((n + 1) * p));
  values[mode] = 1;
  for (let k = mode; k > 0; k--)
    values[k - 1] = (((values[k] * k) / (n - k + 1)) * (1 - p)) / p;
  for (let k = mode; k < n; k++)
    values[k + 1] = (((values[k] * (n - k)) / (k + 1)) * p) / (1 - p);
  const sum = values.reduce((s, v) => s + v, 0);
  return values.map((y, x) => ({ x, y: y / sum }));
}
function logFactorial(k: number) {
  let result = 0;
  for (let i = 2; i <= k; i++) result += Math.log(i);
  return result;
}
export function poissonPmf(k: number, lambda: number): number {
  if (!Number.isFinite(lambda) || lambda < 0 || lambda > 1000)
    throw new Error("λ 范围为 0–1000。");
  if (!Number.isInteger(k) || k < 0) return 0;
  if (lambda === 0) return k === 0 ? 1 : 0;
  return Math.exp(-lambda + k * Math.log(lambda) - logFactorial(k));
}
export function poissonCdf(k: number, lambda: number): number {
  if (k < 0) return 0;
  if (k === Infinity) return 1;
  const top = Math.floor(k);
  if (lambda === 0) return 1;
  if (top > lambda + 50 * Math.sqrt(lambda + 1) + 100) return 1;
  let term = poissonPmf(top, lambda),
    sum = term;
  for (let i = top; i > 0; i--) {
    term *= i / lambda;
    sum += term;
    if (term < sum * 1e-16 && i < lambda) break;
  }
  return clamp01(sum);
}
/** P(X >= k), summed directly in the small upper tail. */
export function poissonTail(k: number, lambda: number): number {
  const first = Math.ceil(k);
  if (first <= 0) return 1;
  if (first === Infinity || lambda === 0) return 0;
  if (first <= lambda) return clamp01(1 - poissonCdf(first - 1, lambda));
  let term = poissonPmf(first, lambda),
    sum = term;
  for (let i = first + 1; i < 20000; i++) {
    term *= lambda / i;
    sum += term;
    if (term <= sum * 1e-16) break;
  }
  return clamp01(sum);
}
export function countProbability(
  model: CountModel,
  lower: number,
  upper: number,
): number {
  if (lower > upper) return 0;
  if (model.kind === "finite")
    return clamp01(
      model.masses.reduce(
        (s, p) => s + (p.x >= lower && p.x <= upper ? p.y : 0),
        0,
      ),
    );
  const a = Math.ceil(lower),
    b = Math.floor(upper);
  if (a > b) return 0;
  if (model.kind === "binomial")
    return clamp01(
      binomialMasses(model.n, model.p).reduce(
        (s, p) => s + (p.x >= a && p.x <= b ? p.y : 0),
        0,
      ),
    );
  if (model.kind === "geometric") {
    if (b < 1) return 0;
    const start = Math.max(1, a);
    if (start === Infinity) return 0;
    if (model.p === 1) return start <= 1 && b >= 1 ? 1 : 0;
    const logQ = Math.log1p(-model.p),
      tail = Math.exp((start - 1) * logQ);
    return b === Infinity
      ? tail
      : clamp01(tail * -Math.expm1((b - start + 1) * logQ));
  }
  if (a > model.lambda)
    return clamp01(
      poissonTail(a, model.lambda) -
        (b === Infinity ? 0 : poissonTail(b + 1, model.lambda)),
    );
  return clamp01(poissonCdf(b, model.lambda) - poissonCdf(a - 1, model.lambda));
}
export function countMoments(model: CountModel) {
  if (model.kind === "finite") return moments(model.masses);
  const mean =
    model.kind === "binomial"
      ? model.n * model.p
      : model.kind === "poisson"
        ? model.lambda
        : 1 / model.p;
  const variance =
    model.kind === "binomial"
      ? mean * (1 - model.p)
      : model.kind === "poisson"
        ? model.lambda
        : (1 - model.p) / model.p ** 2;
  return { mean, variance, second: variance + mean * mean };
}
export function displayMasses(model: CountModel): {
  masses: Mass[];
  tail: number;
} {
  if (model.kind === "finite") return { masses: model.masses, tail: 0 };
  if (model.kind === "binomial")
    return { masses: binomialMasses(model.n, model.p), tail: 0 };
  const end =
    model.kind === "geometric"
      ? Math.min(
          400,
          model.p === 1
            ? 1
            : Math.max(15, Math.ceil(Math.log(1e-7) / Math.log1p(-model.p))),
        )
      : Math.ceil(model.lambda + 8 * Math.sqrt(model.lambda + 1) + 12);
  const masses = Array.from(
    { length: end + (model.kind === "poisson" ? 1 : 0) },
    (_, i) => {
      const x = i + (model.kind === "geometric" ? 1 : 0);
      return {
        x,
        y:
          model.kind === "geometric"
            ? model.p * (1 - model.p) ** (x - 1)
            : poissonPmf(x, model.lambda),
      };
    },
  );
  return { masses, tail: countProbability(model, end + 1, Infinity) };
}
export function countQuantile(model: CountModel, q: number): number {
  if (q < 0 || q > 1) throw new Error("概率须在 [0,1] 内。");
  if (model.kind === "finite") {
    if (q === 0) return model.masses[0].x;
    let sum = 0;
    for (const p of model.masses) {
      sum += p.y;
      if (sum >= q - 1e-14) return p.x;
    }
    return model.masses.at(-1)!.x;
  }
  if (q === 0)
    return model.kind === "geometric"
      ? 1
      : model.kind === "binomial" && model.p === 1
        ? model.n
        : 0;
  if (model.kind === "geometric") {
    if (model.p === 1) return 1;
    if (q === 1) return Infinity;
    let k = Math.max(1, Math.ceil(Math.log1p(-q) / Math.log1p(-model.p)));
    const logQ = Math.log1p(-model.p);
    while (k > 1 && -Math.expm1((k - 1) * logQ) >= q - 2e-15) k--;
    while (-Math.expm1(k * logQ) < q - 2e-15) k++;
    return k;
  }
  if (model.kind === "poisson" && q === 1)
    return model.lambda === 0 ? 0 : Infinity;
  let low = 0,
    high =
      model.kind === "binomial"
        ? model.n
        : Math.ceil(model.lambda + 50 * Math.sqrt(model.lambda + 1) + 100);
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (countProbability(model, -Infinity, mid) >= q) high = mid;
    else low = mid + 1;
  }
  return low;
}
export function affine(masses: Mass[], a: number, b: number) {
  return transformMasses(masses, (x) => a * x + b);
}
export function transformMasses(
  masses: Mass[],
  f: (x: number) => number,
): Mass[] {
  const out = new Map<number, number>();
  for (const p of masses) {
    const x = f(p.x);
    out.set(x, (out.get(x) ?? 0) + p.y);
  }
  return [...out].map(([x, y]) => ({ x, y })).sort((p, q) => p.x - q.x);
}
export function convolve(a: Mass[], b: Mass[]): Mass[] {
  const out = new Map<number, number>();
  for (const p of a)
    for (const q of b) {
      const x = p.x + q.x;
      out.set(x, (out.get(x) ?? 0) + p.y * q.y);
    }
  return [...out].map(([x, y]) => ({ x, y })).sort((p, q) => p.x - q.x);
}
export function binomialFromMoments(mean: number, variance: number) {
  if (mean <= 0 || variance < 0 || variance >= mean)
    throw new Error(
      "此模板要求 E(X)>0 且 0≤Var(X)<E(X)；退化零均值不能唯一确定 n。",
    );
  const p = 1 - variance / mean,
    rawN = mean / p,
    n = Math.round(rawN);
  if (Math.abs(rawN - n) > 1e-8 || n > 1000)
    throw new Error("约束不对应支持范围内的整数 n。");
  return { n, p };
}
export function minSuccessTrials(p: number, q: number) {
  if (p <= 0 || p > 1 || q <= 0 || q >= 1)
    throw new Error("此反求要求 0<p≤1、0<目标概率<1。");
  const n =
    p === 1 ? 1 : Math.max(1, Math.ceil(Math.log1p(-q) / Math.log1p(-p)));
  return { n, at: 1 - (1 - p) ** n, before: 1 - (1 - p) ** (n - 1) };
}

function integral(
  segment: Segment,
  power: number,
  low = segment.low,
  high = segment.high,
) {
  return segment.coefficients.reduce(
    (s, c, i) =>
      s +
      (c * (high ** (i + power + 1) - low ** (i + power + 1))) /
        (i + power + 1),
    0,
  );
}
function polynomial(segment: Segment, x: number) {
  return segment.coefficients.reduce((s, c, i) => s + c * x ** i, 0);
}
export function parseSegments(text: string): Segment[] {
  const rows = text
    .trim()
    .split(/\n|;/)
    .filter((r) => r.trim());
  if (!rows.length || rows.length > 20)
    throw new Error("密度模板接受 1–20 段，每行 low, high, c₀, c₁, c₂。");
  const segments = rows
    .map((row) => {
      const vals = row
        .trim()
        .split(/[,，\s]+/)
        .map(Number);
      if (
        vals.length < 3 ||
        vals.length > 5 ||
        vals.some((n) => !Number.isFinite(n) || Math.abs(n) > 1e4)
      )
        throw new Error("每行 3–5 个有限数，系数最多二次，绝对值≤10000。");
      const [low, high, ...coefficients] = vals;
      if (low >= high) throw new Error("每段要求 low<high。");
      return { low, high, coefficients };
    })
    .sort((a, b) => a.low - b.low);
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (i && s.low < segments[i - 1].high)
      throw new Error("区间内部不能重叠。");
    const points = [s.low, s.high],
      c = s.coefficients;
    if (c[2]) {
      const vertex = -c[1] / (2 * c[2]);
      if (vertex > s.low && vertex < s.high) points.push(vertex);
    }
    if (points.some((x) => polynomial(s, x) < -1e-12))
      throw new Error("该多项式在支持区间内为负，不能作为密度。");
  }
  return segments;
}
export function densityArea(d: Density) {
  return d.kind === "polynomial"
    ? d.segments.reduce((s, p) => s + integral(p, 0), 0)
    : 1;
}
export function validateDensity(d: Density) {
  const area = densityArea(d);
  if (!Number.isFinite(area) || Math.abs(area - 1) > 1e-8)
    throw new Error(`总面积为 ${area}，不等于 1。可显式点击“归一化”。`);
}
export function densityPdf(d: Density, x: number): number {
  if (d.kind === "exponential")
    return x < 0 ? 0 : d.rate * Math.exp(-d.rate * x);
  if (d.kind === "power")
    return x < 0 || x > 1 ? 0 : (d.power + 1) * x ** d.power;
  const segment = d.segments.find((s) => x >= s.low && x <= s.high);
  return segment ? Math.max(0, polynomial(segment, x)) : 0;
}
export function densityCdf(d: Density, x: number): number {
  if (d.kind === "exponential") return x <= 0 ? 0 : -Math.expm1(-d.rate * x);
  if (d.kind === "power") return x <= 0 ? 0 : x >= 1 ? 1 : x ** (d.power + 1);
  return clamp01(
    d.segments.reduce(
      (sum, s) =>
        sum + (x <= s.low ? 0 : integral(s, 0, s.low, Math.min(x, s.high))),
      0,
    ),
  );
}
export function densityMoment(d: Density, k: number): number {
  if (d.kind === "power") return (d.power + 1) / (d.power + k + 1);
  if (d.kind === "exponential") {
    let factorial = 1;
    for (let i = 2; i <= k; i++) factorial *= i;
    return factorial / d.rate ** k;
  }
  return d.segments.reduce((sum, s) => sum + integral(s, k), 0);
}
export function densityBounds(d: Density): [number, number] {
  return d.kind === "polynomial"
    ? [d.segments[0].low, d.segments.at(-1)!.high]
    : d.kind === "power"
      ? [0, 1]
      : [0, Infinity];
}
export function densityQuantile(d: Density, p: number): number {
  if (p < 0 || p > 1) throw new Error("分位概率须在 [0,1] 内。");
  if (d.kind === "exponential") return -Math.log1p(-p) / d.rate;
  if (d.kind === "power") return p ** (1 / (d.power + 1));
  let [low, high] = densityBounds(d);
  if (p === 0) return low;
  if (p === 1) return high;
  for (let i = 0; i < 80; i++) {
    const mid = (low + high) / 2;
    if (densityCdf(d, mid) >= p) high = mid;
    else low = mid;
  }
  return (low + high) / 2;
}
export function transformedCdf(
  d: Density,
  y: number,
  kind: "square" | "absolute" | "affine",
  a = 1,
  b = 0,
): number {
  if (kind === "affine") {
    if (a === 0) return y < b ? 0 : 1;
    return a > 0 ? densityCdf(d, (y - b) / a) : 1 - densityCdf(d, (y - b) / a);
  }
  if (y < 0) return 0;
  const root = kind === "square" ? Math.sqrt(y) : y;
  return clamp01(densityCdf(d, root) - densityCdf(d, -root));
}
export function transformedPdf(
  d: Density,
  y: number,
  kind: "square" | "absolute" | "affine",
  a = 1,
  b = 0,
): number {
  if (kind === "affine")
    return a === 0 ? NaN : densityPdf(d, (y - b) / a) / Math.abs(a);
  if (y <= 0) return 0;
  const root = kind === "square" ? Math.sqrt(y) : y;
  return (
    (densityPdf(d, root) + densityPdf(d, -root)) /
    (kind === "square" ? 2 * root : 1)
  );
}
export function iidSquareRoot(sum: Mass[]): Mass[] {
  if (sum.some((p) => !Number.isInteger(p.x) || p.x < 0 || p.x > 100))
    throw new Error("逆卷积模板限 0–100 的整数支持。");
  const min = sum[0].x,
    max = sum.at(-1)!.x;
  if (min % 2 || max % 2)
    throw new Error("和的最小/最大支持不能对应两个同分布整数变量。");
  const q = Array(max - min + 1).fill(0) as number[];
  sum.forEach((p) => {
    q[p.x - min] = p.y;
  });
  const degree = (max - min) / 2,
    root = [Math.sqrt(q[0])];
  for (let k = 1; k <= degree; k++) {
    let middle = 0;
    for (let i = 1; i < k; i++) middle += root[i] * root[k - i];
    const coefficient = (q[k] - middle) / (2 * root[0]);
    if (coefficient < -1e-9)
      throw new Error("平方根含负系数，不存在此独立同分布解。");
    root.push(Math.max(0, coefficient));
  }
  const masses = root
      .map((y, i) => ({ x: i + min / 2, y }))
      .filter((p) => p.y > 1e-12),
    check = convolve(masses, masses);
  const residual = Math.max(
    ...q.map((p, i) =>
      Math.abs(p - (check.find((c) => c.x === i + min)?.y ?? 0)),
    ),
  );
  if (residual > 1e-8 || Math.abs(root.reduce((s, v) => s + v, 0) - 1) > 1e-8)
    throw new Error("全部系数或归一约束不满足，不存在此模板内的解。");
  return masses;
}
