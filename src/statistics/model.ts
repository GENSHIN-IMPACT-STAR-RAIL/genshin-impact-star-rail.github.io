export type EventKind = "interval" | "left" | "right" | "point";
export type CountEvent = {
  kind: EventKind;
  a: number;
  b: number;
  includeLower: boolean;
  includeUpper: boolean;
};
export type LabState = {
  version: 1;
  n: number;
  p: number;
  event: CountEvent;
  correction: boolean;
  showNormal: boolean;
};
export const STORAGE_KEY = "mathroom-statistics-binomial-v1";
export const DEFAULT_LAB: LabState = {
  version: 1,
  n: 40,
  p: 0.35,
  event: {
    kind: "interval",
    a: 10,
    b: 18,
    includeLower: true,
    includeUpper: true,
  },
  correction: true,
  showNormal: true,
};

/** Build around the mode, then normalise. Avoid factorial overflow and tiny P(X=0). */
export function binomialMasses(n: number, p: number): number[] {
  if (
    !Number.isInteger(n) ||
    n < 1 ||
    n > 200 ||
    !Number.isFinite(p) ||
    p < 0 ||
    p > 1
  )
    throw new RangeError("n 须为 1–200 的整数，p 须在 0–1 之间");
  const masses = Array<number>(n + 1).fill(0);
  if (p === 0 || p === 1) {
    masses[p === 0 ? 0 : n] = 1;
    return masses;
  }
  const mode = Math.min(n, Math.floor((n + 1) * p));
  masses[mode] = 1;
  for (let k = mode; k > 0; k--)
    masses[k - 1] = ((masses[k] * k) / (n - k + 1)) * ((1 - p) / p);
  for (let k = mode; k < n; k++)
    masses[k + 1] = ((masses[k] * (n - k)) / (k + 1)) * (p / (1 - p));
  const total = masses.reduce((sum, x) => sum + x, 0);
  return masses.map((x) => x / total);
}

export function integerBounds(event: CountEvent): [number, number] {
  const lower = event.a + (event.includeLower ? 0 : 1);
  const upper =
    (event.kind === "interval" ? event.b : event.a) -
    (event.includeUpper ? 0 : 1);
  switch (event.kind) {
    case "interval":
      return [lower, upper];
    case "left":
      return [-Infinity, upper];
    case "right":
      return [lower, Infinity];
    case "point":
      return [event.a, event.a];
  }
}
export function selectedCount(k: number, event: CountEvent): boolean {
  const [a, b] = integerBounds(event);
  return k >= a && k <= b;
}
export function binomialProbability(
  masses: number[],
  event: CountEvent,
): number {
  return Math.min(
    1,
    masses.reduce(
      (sum, mass, k) => sum + (selectedCount(k, event) ? mass : 0),
      0,
    ),
  );
}
export function normalBounds(
  event: CountEvent,
  correction: boolean,
): [number, number] {
  if (correction) {
    const [a, b] = integerBounds(event);
    if (a > b) return [0, 0];
    return [a - 0.5, b + 0.5];
  }
  switch (event.kind) {
    case "interval":
      return [event.a, event.b];
    case "left":
      return [-Infinity, event.a];
    case "right":
      return [event.a, Infinity];
    case "point":
      return [event.a, event.a];
  }
}
export function normalPdf(x: number, mean: number, sd: number): number {
  return sd > 0
    ? Math.exp(-0.5 * ((x - mean) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI))
    : 0;
}

/** Q(z)=phi(z)*integral_0^12 exp(-zt-t²/2)dt, z>=0.
 * Directly integrate the upper tail so Q(8) does not subtract nearly equal numbers.
 * Omitted integral is bounded by Q(12), < 2e-33 at z=0 and smaller for z>0.
 */
export function normalSurvival(z: number): number {
  if (z === Infinity) return 0;
  if (z === -Infinity) return 1;
  if (Number.isNaN(z)) return NaN;
  if (z < 0) return 1 - normalSurvival(-z);
  if (z === 0) return 0.5;
  if (z >= 39) return 0;
  const f = (t: number) => Math.exp(-z * t - (t * t) / 2);
  const integrate = (
    a: number,
    b: number,
    fa: number,
    fm: number,
    fb: number,
    whole: number,
    eps: number,
    depth: number,
  ): number => {
    const middle = (a + b) / 2;
    const fl = f((a + middle) / 2),
      fr = f((middle + b) / 2);
    const left = ((middle - a) / 6) * (fa + 4 * fl + fm);
    const right = ((b - middle) / 6) * (fm + 4 * fr + fb);
    const delta = left + right - whole;
    if (depth === 0 || Math.abs(delta) <= 15 * eps)
      return left + right + delta / 15;
    return (
      integrate(a, middle, fa, fl, fm, left, eps / 2, depth - 1) +
      integrate(middle, b, fm, fr, fb, right, eps / 2, depth - 1)
    );
  };
  return (
    (Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI)) *
    integrate(0, 12, 1, f(6), f(12), 2 * (1 + 4 * f(6) + f(12)), 1e-12, 22)
  );
}
export function normalInterval(
  lower: number,
  upper: number,
  mean: number,
  sd: number,
): number | null {
  if (!(sd > 0)) return null;
  if (lower >= upper) return 0;
  const a = (lower - mean) / sd,
    b = (upper - mean) / sd;
  const probability =
    a >= 0
      ? normalSurvival(a) - normalSurvival(b)
      : b <= 0
        ? normalSurvival(-b) - normalSurvival(-a)
        : 1 - normalSurvival(-a) - normalSurvival(b);
  return Math.max(0, Math.min(1, probability));
}
export function eventText(event: CountEvent, variable = "X"): string {
  switch (event.kind) {
    case "interval":
      return `${event.a} ${event.includeLower ? "≤" : "<"} ${variable} ${event.includeUpper ? "≤" : "<"} ${event.b}`;
    case "left":
      return `${variable} ${event.includeUpper ? "≤" : "<"} ${event.a}`;
    case "right":
      return `${variable} ${event.includeLower ? "≥" : ">"} ${event.a}`;
    case "point":
      return `${variable} = ${event.a}`;
  }
}
export function normalEventText(
  event: CountEvent,
  correction: boolean,
): string {
  const [a, b] = normalBounds(event, correction);
  if (a === b) return a === 0 && correction ? "空事件" : `Y = ${a}`;
  if (a === -Infinity) return `Y < ${b}`;
  if (b === Infinity) return `Y > ${a}`;
  return `${a} < Y < ${b}`;
}
export function formatProbability(value: number): string {
  if (value === 0 || value === 1) return String(value);
  if (value < 0.000001) return value.toExponential(3);
  if (value > 0.999999) return `1 − ${(1 - value).toExponential(2)}`;
  return value.toFixed(6);
}
export function restoreLab(raw: string | null): LabState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as LabState;
    if (
      !value ||
      value.version !== 1 ||
      !Number.isInteger(value.n) ||
      value.n < 1 ||
      value.n > 200 ||
      !Number.isFinite(value.p) ||
      value.p < 0 ||
      value.p > 1 ||
      typeof value.correction !== "boolean" ||
      typeof value.showNormal !== "boolean"
    )
      return null;
    const e = value.event;
    if (
      !e ||
      !["interval", "left", "right", "point"].includes(e.kind) ||
      ![e.a, e.b].every((x) => Number.isInteger(x) && x >= 0 && x <= value.n) ||
      e.a > e.b ||
      typeof e.includeLower !== "boolean" ||
      typeof e.includeUpper !== "boolean"
    )
      return null;
    return {
      version: 1,
      n: value.n,
      p: value.p,
      correction: value.correction,
      showNormal: value.showNormal,
      event: {
        kind: e.kind,
        a: e.a,
        b: e.b,
        includeLower: e.includeLower,
        includeUpper: e.includeUpper,
      },
    };
  } catch {
    return null;
  }
}
