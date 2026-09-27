export type DataState = {
  mode: "raw" | "frequency" | "grouped" | "summary";
  raw: string;
  frequency: string;
  grouped: string;
  second: string;
  name: string;
  unit: string;
  precision: number;
  percentile: number;
  quartiles: "position" | "halves";
  density: "frequency" | "probability";
  n: number;
  sum: number;
  sumSquares: number;
  codeA: number;
  codeB: number;
  coded: boolean;
  selected: number;
  editValue: number;
  targetMean: number;
  history: string;
  observationIds: number[];
  nextId: number;
  histogramBins: number;
};
export const dataInitial: DataState = {
  mode: "raw",
  raw: "2, 3, 3, 5, 6, 8, 9, 12",
  frequency: "2 1\n3 2\n5 1\n6 1\n8 1\n9 1\n12 1",
  grouped: "0 5 3\n5 10 4\n10 20 1",
  second: "3, 4, 4, 5, 6, 7, 8, 9",
  name: "观测值",
  unit: "",
  precision: 1,
  percentile: 50,
  quartiles: "halves",
  density: "frequency",
  n: 8,
  sum: 48,
  sumSquares: 372,
  codeA: 0,
  codeB: 1,
  coded: false,
  selected: 0,
  editValue: 10,
  targetMean: 7,
  history: "",
  observationIds: [1, 2, 3, 4, 5, 6, 7, 8],
  nextId: 9,
  histogramBins: 5,
};

export type CountingTemplate =
  | "permutation"
  | "repeated"
  | "multiset"
  | "adjacent"
  | "nonadjacent"
  | "notall"
  | "endpoint"
  | "distance"
  | "selection"
  | "groups";
export type CountingState = {
  template: CountingTemplate;
  n: number;
  r: number;
  k: number;
  distance: number;
  repeated: string;
  distinguish: boolean;
  required: number;
  excluded: number;
  quotaSize: number;
  quotaMin: number;
  quotaMax: number;
  requiredMembers: string;
  excludedMembers: string;
  quotaMembers: string;
  groups: string;
  named: boolean;
};
export const countingInitial: CountingState = {
  template: "groups",
  n: 6,
  r: 3,
  k: 2,
  distance: 2,
  repeated: "2, 2, 1",
  distinguish: false,
  required: 0,
  excluded: 0,
  quotaSize: 3,
  quotaMin: 1,
  quotaMax: 2,
  requiredMembers: "",
  excludedMembers: "",
  quotaMembers: "",
  groups: "2, 2",
  named: false,
};

export type ProbabilityState = {
  template: "table" | "dice" | "bag" | "source" | "success";
  outcomes: string;
  direction: "A|B" | "B|A";
  dieSides: number;
  eventA: number;
  eventB: number;
  red: number;
  blue: number;
  draws: number;
  replacement: "yes" | "no" | "red-only";
  stop: "fixed" | "first-red" | "second-red";
  successP: number;
  successR: number;
  successK: number;
  sourceP: number;
  sourceA: number;
  sourceB: number;
  totalTarget: number;
  view: "table" | "venn" | "tree";
};
export const probabilityInitial: ProbabilityState = {
  template: "bag",
  outcomes: "甲 0.2 1 1\n乙 0.3 1 0\n丙 0.1 0 1\n丁 0.4 0 0",
  direction: "A|B",
  dieSides: 6,
  eventA: 8,
  eventB: 4,
  red: 3,
  blue: 2,
  draws: 2,
  replacement: "no",
  stop: "fixed",
  successP: 0.4,
  successR: 2,
  successK: 4,
  sourceP: 0.3,
  sourceA: 0.8,
  sourceB: 0.2,
  totalTarget: 0.5,
  view: "table",
};

function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
const text = (v: unknown, max = 20000) =>
  typeof v === "string" && v.length <= max;
const num = (v: unknown, low = -1e12, high = 1e12) =>
  typeof v === "number" && Number.isFinite(v) && v >= low && v <= high;
const integer = (v: unknown, low: number, high: number) =>
  num(v, low, high) && Number.isInteger(v);
const one = (v: unknown, choices: readonly string[]) =>
  typeof v === "string" && choices.includes(v);
const keys = (v: Record<string, unknown>, init: object) =>
  Object.keys(v).length === Object.keys(init).length &&
  Object.keys(init).every((k) => Object.hasOwn(v, k));
export function validateData(v: unknown): v is DataState {
  return (
    record(v) &&
    keys(v, dataInitial) &&
    one(v.mode, ["raw", "frequency", "grouped", "summary"]) &&
    ["raw", "frequency", "grouped", "second"].every((k) => text(v[k])) &&
    text(v.name, 100) &&
    text(v.unit, 40) &&
    text(v.history, 1000) &&
    num(v.precision, 0, 1e6) &&
    num(v.percentile, 0, 100) &&
    one(v.quartiles, ["position", "halves"]) &&
    one(v.density, ["frequency", "probability"]) &&
    integer(v.n, 1, 1e8) &&
    num(v.sum, -1e40, 1e40) &&
    num(v.sumSquares, 0, 1e80) &&
    num(v.codeA, -1e6, 1e6) &&
    num(v.codeB, -1e6, 1e6) &&
    v.codeB !== 0 &&
    typeof v.coded === "boolean" &&
    integer(v.selected, 0, 9999) &&
    num(v.editValue) &&
    num(v.targetMean) &&
    Array.isArray(v.observationIds) &&
    v.observationIds.length <= 2000 &&
    v.observationIds.every((x) => integer(x, 1, 1e9)) &&
    new Set(v.observationIds).size === v.observationIds.length &&
    integer(v.nextId, 1, 1e9) &&
    integer(v.histogramBins, 1, 30) &&
    v.observationIds.every((x) => x < (v.nextId as number))
  );
}
export function validateCounting(v: unknown): v is CountingState {
  return (
    record(v) &&
    keys(v, countingInitial) &&
    one(v.template, [
      "permutation",
      "repeated",
      "multiset",
      "adjacent",
      "nonadjacent",
      "notall",
      "endpoint",
      "distance",
      "selection",
      "groups",
    ]) &&
    [
      "n",
      "r",
      "k",
      "required",
      "excluded",
      "quotaSize",
      "quotaMin",
      "quotaMax",
    ].every((k) => integer(v[k], 0, 100)) &&
    integer(v.distance, 1, 100) &&
    text(v.repeated, 500) &&
    text(v.groups, 500) &&
    text(v.requiredMembers, 500) &&
    text(v.excludedMembers, 500) &&
    text(v.quotaMembers, 500) &&
    typeof v.named === "boolean" &&
    typeof v.distinguish === "boolean"
  );
}
export function validateProbability(v: unknown): v is ProbabilityState {
  return (
    record(v) &&
    keys(v, probabilityInitial) &&
    one(v.template, ["table", "dice", "bag", "source", "success"]) &&
    text(v.outcomes) &&
    one(v.direction, ["A|B", "B|A"]) &&
    one(v.view, ["table", "venn", "tree"]) &&
    integer(v.dieSides, 2, 12) &&
    integer(v.eventA, 2, 24) &&
    integer(v.eventB, 1, 12) &&
    integer(v.red, 0, 30) &&
    integer(v.blue, 0, 30) &&
    integer(v.draws, 1, 10) &&
    one(v.replacement, ["yes", "no", "red-only"]) &&
    one(v.stop, ["fixed", "first-red", "second-red"]) &&
    ["successP", "sourceP", "sourceA", "sourceB", "totalTarget"].every((k) =>
      num(v[k], 0, 1),
    ) &&
    integer(v.successR, 1, 20) &&
    integer(v.successK, 1, 50)
  );
}
