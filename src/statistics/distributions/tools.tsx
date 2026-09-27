import type { ToolSpec } from "../workspace-types";
import { DiscreteTool } from "./discrete";
import { NormalTool } from "./normal";
import { PoissonTool } from "./poisson";
import { CombinationTool } from "./combinations";
import { ContinuousTool } from "./continuous";
import { PgfTool } from "./pgf";
import {
  discreteInitial,
  normalInitial,
  poissonInitial,
  combinationInitial,
  continuousInitial,
  pgfInitial,
  validateDiscrete,
  validateNormal,
  validatePoisson,
  validateCombination,
  validateContinuous,
  validatePgf,
} from "./state";
export const distributionTools: ToolSpec[] = [
  {
    id: "discrete",
    title: "离散随机变量",
    description: "概率表、二项、几何与参数反求",
    courses: ["S1"],
    group: "分布与变量",
    component: DiscreteTool,
    initialState: discreteInitial,
    validate: validateDiscrete,
  },
  {
    id: "normal",
    title: "正态顺求与反求",
    description: "标准化、分位数与一 / 两参数反求",
    courses: ["S1", "S2"],
    group: "分布与变量",
    component: NormalTool,
    initialState: normalInitial,
    validate: validateNormal,
  },
  {
    id: "poisson",
    title: "泊松过程与计数",
    description: "率与窗口、独立计数、近似与反求",
    courses: ["S2", "FS"],
    group: "分布与变量",
    component: PoissonTool,
    initialState: poissonInitial,
    validate: validatePoisson,
  },
  {
    id: "combinations",
    title: "变量变换与组合",
    description: "2X 与独立和、正态组合、离散卷积",
    courses: ["S1", "S2", "FS"],
    group: "分布与变量",
    component: CombinationTool,
    initialState: combinationInitial,
    validate: validateCombination,
  },
  {
    id: "continuous",
    title: "PDF、CDF 与变换",
    description: "合法密度、面积、矩、分位与多原像",
    courses: ["S2", "FS"],
    group: "分布与变量",
    component: ContinuousTool,
    initialState: continuousInitial,
    validate: validateContinuous,
  },
  {
    id: "pgf",
    title: "PGF 与卷积",
    description: "精确有限系数、导数矩、独立和与仿射",
    courses: ["FS"],
    group: "分布与变量",
    component: PgfTool,
    initialState: pgfInitial,
    validate: validatePgf,
  },
];
