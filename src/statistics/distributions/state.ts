import type { CountModel } from "./model.ts";

export type CountEvent = "le" | "lt" | "ge" | "gt" | "equal" | "interval";
export type RateUnit =
  | "second"
  | "minute"
  | "hour"
  | "centimetre"
  | "metre"
  | "kilometre"
  | "squareCentimetre"
  | "squareMetre"
  | "squareKilometre";
export type DiscreteState = {
  kind: "finite" | "binomial" | "geometric";
  table: string;
  n: number;
  p: number;
  event: CountEvent;
  low: number;
  high: number;
  q: number;
  task: "forward" | "moments" | "trials" | "geometric";
  targetMean: number;
  targetVariance: number;
  repetitions: number;
};
export type NormalState = {
  mean: number;
  scale: number;
  scaleKind: "sd" | "variance";
  event: "left" | "right" | "interval" | "outside" | "central";
  low: number;
  high: number;
  q: number;
  task: "forward" | "quantile" | "mean" | "sd" | "both" | "relation";
  x1: number;
  p1: number;
  x2: number;
  p2: number;
};
export type PoissonState = {
  rate: number;
  window: number;
  rateUnit: RateUnit;
  windowUnit: RateUnit;
  secondRate: number;
  combine: boolean;
  event: CountEvent;
  low: number;
  high: number;
  q: number;
  task: "forward" | "ratio" | "window" | "threshold";
  ratio: number;
  ratioK: number;
  binomialN: number;
  trials: number;
};
export type CombinationState = {
  kind: "finite" | "normal" | "poisson";
  table: string;
  secondTable: string;
  operation:
    "double" | "independent" | "affine" | "square" | "difference" | "mixture";
  a: number;
  b: number;
  weight: number;
  meanX: number;
  sdX: number;
  meanY: number;
  sdY: number;
  coefficientY: number;
  independent: boolean;
  threshold: number;
  lambdaX: number;
  lambdaY: number;
  task: "forward" | "target";
  target: number;
};
export type ContinuousState = {
  kind: "polynomial" | "exponential" | "power";
  segments: string;
  rate: number;
  power: number;
  low: number;
  high: number;
  cursor: number;
  q: number;
  transform: "square" | "absolute" | "affine";
  a: number;
  b: number;
  y: number;
  task: "forward" | "mean" | "quantile";
  targetMean: number;
  targetX: number;
  targetP: number;
};
export type PgfState = {
  kind: "finite" | "binomial" | "geometric" | "poisson" | "uniform";
  table: string;
  n: number;
  p: number;
  lambda: number;
  uniformN: number;
  operation: "original" | "independent" | "double" | "affine";
  a: number;
  b: number;
  selected: number;
  t: number;
  task: "forward" | "root";
  sumTable: string;
};
export const discreteInitial: DiscreteState = {
  kind: "binomial",
  table: "0, 1/4\n1, 1/2\n2, 1/4",
  n: 10,
  p: 0.4,
  event: "interval",
  low: 2,
  high: 5,
  q: 0.9,
  task: "forward",
  targetMean: 4,
  targetVariance: 2.4,
  repetitions: 5,
};
export const normalInitial: NormalState = {
  mean: 10,
  scale: 2,
  scaleKind: "sd",
  event: "interval",
  low: 8,
  high: 12,
  q: 0.95,
  task: "forward",
  x1: 8,
  p1: 0.15865525393145707,
  x2: 12,
  p2: 0.8413447460685429,
};
export const poissonInitial: PoissonState = {
  rate: 3,
  window: 1,
  rateUnit: "minute",
  windowUnit: "minute",
  secondRate: 1,
  combine: false,
  event: "le",
  low: 1,
  high: 5,
  q: 0.95,
  task: "forward",
  ratio: 1.5,
  ratioK: 1,
  binomialN: 100,
  trials: 200,
};
export const combinationInitial: CombinationState = {
  kind: "finite",
  table: "1, 1/6\n2, 1/6\n3, 1/6\n4, 1/6\n5, 1/6\n6, 1/6",
  secondTable: "1, 1/6\n2, 1/6\n3, 1/6\n4, 1/6\n5, 1/6\n6, 1/6",
  operation: "double",
  a: 2,
  b: 0,
  weight: 0.5,
  meanX: 10,
  sdX: 2,
  meanY: 7,
  sdY: 3,
  coefficientY: -1,
  independent: true,
  threshold: 0,
  lambdaX: 3,
  lambdaY: 4,
  task: "forward",
  target: 20,
};
export const continuousInitial: ContinuousState = {
  kind: "polynomial",
  segments: "0, 1, 0, 2",
  rate: 1,
  power: 1,
  low: 0,
  high: 0.5,
  cursor: 0.5,
  q: 0.5,
  transform: "square",
  a: 1,
  b: 0,
  y: 0.25,
  task: "forward",
  targetMean: 2 / 3,
  targetX: 0.5,
  targetP: 0.25,
};
export const pgfInitial: PgfState = {
  kind: "finite",
  table: "0, 1/2\n1, 1/2",
  n: 6,
  p: 0.4,
  lambda: 3,
  uniformN: 6,
  operation: "original",
  a: 2,
  b: 0,
  selected: 1,
  t: 0.5,
  task: "forward",
  sumTable: "0, 1/4\n1, 1/2\n2, 1/4",
};

type Check = (v: unknown) => boolean;
const num =
  (min = -1e6, max = 1e6, integer = false): Check =>
  (v) =>
    typeof v === "number" &&
    Number.isFinite(v) &&
    v >= min &&
    v <= max &&
    (!integer || Number.isInteger(v));
const str: Check = (v) => typeof v === "string" && v.length <= 8000;
const bool: Check = (v) => typeof v === "boolean";
const choice =
  (...values: string[]): Check =>
  (v) =>
    typeof v === "string" && values.includes(v);
const event = choice("le", "lt", "ge", "gt", "equal", "interval");
function schema(shape: Record<string, Check>): Check {
  return (value) =>
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === Object.keys(shape).length &&
    Object.entries(shape).every(
      ([key, check]) =>
        Object.hasOwn(value, key) &&
        check((value as Record<string, unknown>)[key]),
    );
}
const discreteShape = schema({
  kind: choice("finite", "binomial", "geometric"),
  table: str,
  n: num(0, 1000, true),
  p: num(0, 1),
  event,
  low: num(),
  high: num(),
  q: num(0, 1),
  task: choice("forward", "moments", "trials", "geometric"),
  targetMean: num(0, 1e5),
  targetVariance: num(0, 1e5),
  repetitions: num(1, 1000, true),
});
const normalShape = schema({
  mean: num(),
  scale: num(1e-16, 1e12),
  scaleKind: choice("sd", "variance"),
  event: choice("left", "right", "interval", "outside", "central"),
  low: num(),
  high: num(),
  q: num(0, 1),
  task: choice("forward", "quantile", "mean", "sd", "both", "relation"),
  x1: num(),
  p1: num(1e-10, 1 - 1e-10),
  x2: num(),
  p2: num(1e-10, 1 - 1e-10),
});
export const validatePoisson = schema({
  rate: num(0, 1000),
  window: num(0, 1e6),
  rateUnit: choice(
    "second",
    "minute",
    "hour",
    "centimetre",
    "metre",
    "kilometre",
    "squareCentimetre",
    "squareMetre",
    "squareKilometre",
  ),
  windowUnit: choice(
    "second",
    "minute",
    "hour",
    "centimetre",
    "metre",
    "kilometre",
    "squareCentimetre",
    "squareMetre",
    "squareKilometre",
  ),
  secondRate: num(0, 1000),
  combine: bool,
  event,
  low: num(),
  high: num(),
  q: num(1e-10, 1 - 1e-10),
  task: choice("forward", "ratio", "window", "threshold"),
  ratio: num(0, 1000),
  ratioK: num(0, 10000, true),
  binomialN: num(1, 1000, true),
  trials: num(10, 2000, true),
});
const combinationShape = schema({
  kind: choice("finite", "normal", "poisson"),
  table: str,
  secondTable: str,
  operation: choice(
    "double",
    "independent",
    "affine",
    "square",
    "difference",
    "mixture",
  ),
  a: num(-100, 100),
  b: num(-1e4, 1e4),
  weight: num(0, 1),
  meanX: num(),
  sdX: num(1e-8, 1e6),
  meanY: num(),
  sdY: num(1e-8, 1e6),
  coefficientY: num(-100, 100),
  independent: bool,
  threshold: num(),
  lambdaX: num(0, 500),
  lambdaY: num(0, 500),
  task: choice("forward", "target"),
  target: num(),
});
export const validateContinuous = schema({
  kind: choice("polynomial", "exponential", "power"),
  segments: str,
  rate: num(1e-6, 1000),
  power: num(0, 1000),
  low: num(),
  high: num(),
  cursor: num(),
  q: num(0, 1),
  transform: choice("square", "absolute", "affine"),
  a: num(-100, 100),
  b: num(-1e4, 1e4),
  y: num(),
  task: choice("forward", "mean", "quantile"),
  targetMean: num(0, 1),
  targetX: num(1e-10, 1 - 1e-10),
  targetP: num(1e-10, 1 - 1e-10),
});
const pgfShape = schema({
  kind: choice("finite", "binomial", "geometric", "poisson", "uniform"),
  table: str,
  n: num(0, 100, true),
  p: num(0, 1),
  lambda: num(0, 100),
  uniformN: num(1, 30, true),
  operation: choice("original", "independent", "double", "affine"),
  a: num(-20, 20, true),
  b: num(-100, 100, true),
  selected: num(-1e9, 1e9, true),
  t: num(-2, 2),
  task: choice("forward", "root"),
  sumTable: str,
});
export function validateDiscrete(value: unknown): boolean {
  if (!discreteShape(value)) return false;
  const state = value as DiscreteState;
  return state.kind !== "geometric" || state.p > 0;
}
export function validateNormal(value: unknown): boolean {
  if (!normalShape(value)) return false;
  const state = value as NormalState;
  return (
    state.scaleKind === "variance" ||
    (state.scale >= 1e-8 && state.scale <= 1e6)
  );
}
export function validateCombination(value: unknown): boolean {
  if (!combinationShape(value)) return false;
  const state = value as CombinationState;
  return state.kind === "poisson"
    ? ["double", "independent"].includes(state.operation)
    : state.kind === "normal"
      ? state.operation !== "square"
      : true;
}
export function validatePgf(value: unknown): boolean {
  if (!pgfShape(value)) return false;
  const state = value as PgfState;
  return state.kind !== "geometric" || state.p > 0;
}
export function discreteModel(
  s: DiscreteState,
  parse: (text: string) => { x: number; y: number }[],
): CountModel {
  if (s.kind === "finite") return { kind: "finite", masses: parse(s.table) };
  if (s.kind === "geometric" && s.p === 0)
    throw new Error("几何分布要求 p>0。");
  return s.kind === "geometric"
    ? { kind: "geometric", p: s.p }
    : { kind: "binomial", n: s.n, p: s.p };
}
