import type {
  SharedData,
  SharedDistribution,
  StatisticsDocument,
  ToolSpec,
} from "./workspace-types.ts";

export const MAX_DOCUMENT_BYTES = 2_000_000;
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e100;
const vector = (v: unknown) =>
  Array.isArray(v) && v.length > 0 && v.length <= 10000 && v.every(finite);
export function validDistribution(d: unknown): d is SharedDistribution {
  if (!record(d)) return false;
  switch (d.kind) {
    case "normal":
      return finite(d.mean) && finite(d.sd) && d.sd > 0;
    case "binomial":
      return (
        finite(d.n) &&
        Number.isInteger(d.n) &&
        d.n >= 0 &&
        d.n <= 10000 &&
        finite(d.p) &&
        d.p >= 0 &&
        d.p <= 1
      );
    case "poisson":
      return finite(d.lambda) && d.lambda >= 0 && d.lambda <= 10000;
    case "geometric":
      return finite(d.p) && d.p > 0 && d.p <= 1;
    case "uniform":
      return finite(d.low) && finite(d.high) && d.low < d.high;
    case "exponential":
      return finite(d.rate) && d.rate > 0;
    case "finite":
      return (
        vector(d.values) &&
        vector(d.probabilities) &&
        (d.values as number[]).length ===
          (d.probabilities as number[]).length &&
        (d.probabilities as number[]).every((p) => p >= 0) &&
        Math.abs((d.probabilities as number[]).reduce((s, p) => s + p, 0) - 1) <
          1e-8
      );
    default:
      return false;
  }
}
export function validShared(s: unknown): s is SharedData {
  return (
    record(s) &&
    (s.sample === undefined || vector(s.sample)) &&
    (s.secondSample === undefined || vector(s.secondSample)) &&
    (s.label === undefined ||
      (typeof s.label === "string" && s.label.length <= 200)) &&
    (s.design === undefined ||
      ["single", "independent", "paired"].includes(s.design as string)) &&
    (s.distribution === undefined || validDistribution(s.distribution))
  );
}
export function initialDocument(tools: ToolSpec[]): StatisticsDocument {
  return {
    version: 1,
    title: "我的统计探究",
    activeTool: "data",
    states: Object.fromEntries(
      tools.map((t) => [t.id, structuredClone(t.initialState)]),
    ),
    shared: {},
    display: { resultsHidden: false },
  };
}
export function parseDocument(
  raw: string,
  tools: ToolSpec[],
): StatisticsDocument {
  if (raw.length > MAX_DOCUMENT_BYTES) throw new Error("作品文件超过 2 MB");
  const value: unknown = JSON.parse(raw);
  if (!record(value) || value.version !== 1)
    throw new Error("不是支持的统计作品版本");
  if (
    typeof value.title !== "string" ||
    value.title.length > 80 ||
    typeof value.activeTool !== "string" ||
    !record(value.states) ||
    !validShared(value.shared)
  )
    throw new Error("作品结构或共享数据无效");
  if (
    value.display !== undefined &&
    (!record(value.display) || typeof value.display.resultsHidden !== "boolean")
  )
    throw new Error("课堂显示设置无效");
  const registry = new Map(tools.map((t) => [t.id, t]));
  if (!registry.has(value.activeTool) && value.activeTool !== "binomial-demo")
    throw new Error("作品包含未知工具入口");
  for (const [id, state] of Object.entries(value.states)) {
    const spec = registry.get(id);
    if (!spec || !spec.validate(state))
      throw new Error(`“${spec?.title ?? id}”的数据不符合范围要求`);
  }
  return {
    version: 1,
    title: value.title,
    activeTool: value.activeTool,
    states: {
      ...initialDocument(tools).states,
      ...structuredClone(value.states),
    },
    shared: structuredClone(value.shared),
    display: {
      resultsHidden:
        value.display === undefined
          ? false
          : (value.display as { resultsHidden: boolean }).resultsHidden,
    },
  };
}
