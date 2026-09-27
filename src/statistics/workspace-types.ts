import type { ComponentType } from "react";

export type Course = "S1" | "S2" | "FS" | "拓展";
export type ToolGroup =
  | "数据与图表"
  | "随机试验"
  | "分布与变量"
  | "抽样与估计"
  | "假设检验"
  | "课堂探究";
export type ToolSpec = {
  id: string;
  title: string;
  description: string;
  courses: Course[];
  group: ToolGroup;
  component: ComponentType;
  initialState: unknown;
  validate: (value: unknown) => boolean;
};
export type SharedDistribution =
  | { kind: "normal"; mean: number; sd: number }
  | { kind: "binomial"; n: number; p: number }
  | { kind: "poisson"; lambda: number }
  | { kind: "geometric"; p: number }
  | { kind: "uniform"; low: number; high: number }
  | { kind: "exponential"; rate: number }
  | { kind: "finite"; values: number[]; probabilities: number[] };
export type SharedData = {
  sample?: number[];
  secondSample?: number[];
  label?: string;
  distribution?: SharedDistribution;
  design?: "single" | "independent" | "paired";
};
export type StatisticsDocument = {
  version: 1;
  activeTool: string;
  title: string;
  states: Record<string, unknown>;
  shared: SharedData;
  display?: { resultsHidden: boolean };
};
