import type { ToolSpec } from '../workspace-types';
import { IntervalsTool, TestsTool, MeansTool, ChiSquareTool, RanksTool } from './tools';
import { initialIntervals, initialTests, initialMeans, initialChi, initialRanks, validateIntervals, validateTests, validateMeans, validateChi, validateRanks } from './state';

export const inferenceTools: ToolSpec[] = [
  { id: 'intervals', title: '置信区间', description: '构造、反求与重复抽样覆盖', courses: ['S2', 'FS'], group: '抽样与估计', component: IntervalsTool, initialState: initialIntervals, validate: validateIntervals },
  { id: 'tests', title: '检验与两类错误', description: '固定拒绝域观察实际显著性、β 与功效', courses: ['S2', 'FS'], group: '假设检验', component: TestsTool, initialState: initialTests, validate: validateTests },
  { id: 'means', title: '正态与 t 均值推断', description: '从样本设计与条件选择 z、t 或 pooled t', courses: ['S2', 'FS'], group: '假设检验', component: MeansTool, initialState: initialMeans, validate: validateMeans },
  { id: 'chi-square', title: 'χ² 检验', description: '拟合优度、列联表及合法合并后的贡献', courses: ['FS'], group: '假设检验', component: ChiSquareTool, initialState: initialChi, validate: validateChi },
  { id: 'ranks', title: '符号与 Wilcoxon', description: '符号、符号秩和秩和的精确与近似推断', courses: ['FS'], group: '假设检验', component: RanksTool, initialState: initialRanks, validate: validateRanks },
];
