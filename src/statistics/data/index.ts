import type { ToolSpec } from "../workspace-types";
import { DataTool, CountingTool, ProbabilityTool } from "./tools";
import {
  dataInitial,
  countingInitial,
  probabilityInitial,
  validateData,
  validateCounting,
  validateProbability,
} from "./state";

export const dataTools: ToolSpec[] = [
  {
    id: "data",
    title: "数据与统计图",
    description: "数据、频数与分组表，分位数、编码和订正",
    courses: ["S1", "S2"],
    group: "数据与图表",
    component: DataTool,
    initialState: dataInitial,
    validate: validateData,
  },
  {
    id: "counting",
    title: "计数与排列组合",
    description: "可解释的约束模板、插空、捆绑与分组除重",
    courses: ["S1"],
    group: "随机试验",
    component: CountingTool,
    initialState: countingInitial,
    validate: validateCounting,
  },
  {
    id: "probability",
    title: "样本空间与条件概率",
    description: "概率权重、条件方向、抽取与停止规则",
    courses: ["S1"],
    group: "随机试验",
    component: ProbabilityTool,
    initialState: probabilityInitial,
    validate: validateProbability,
  },
];
