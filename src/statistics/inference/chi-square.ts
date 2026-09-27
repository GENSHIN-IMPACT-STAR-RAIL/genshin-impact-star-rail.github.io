import { mean, populationVariance, normalCdf, normalSf, chiSquareSf, chiSquareQuantile } from '../math.ts';
import { numbers, requireCondition } from './common.ts';
import { binomialMass, poissonMass } from './hypothesis.ts';
import { initialChi, type ChiState } from './state.ts';
export function parseGroups(text: string, count: number): number[][] {
  if (!text.trim()) return Array.from({ length: count }, (_, i) => [i]);
  const groups = text.split('|').map(group => group.trim().split(/[\s,]+/).map(x => Number(x) - 1));
  const flattened = groups.flat();
  requireCondition(flattened.length === count && flattened.every((value, i) => Number.isInteger(value) && value === i) && groups.every(g => g.length > 0), '合并分组必须按顺序覆盖每个原类别且不重复，例如 1,2|3|4。');
  return groups;
}
export function serializeGroups(groups: number[][]) { return groups.map(g => g.map(i => i + 1).join(',')).join('|'); }
export function mergeAdjacent(groups: number[][], index: number) {
  requireCondition(Number.isInteger(index) && index >= 0 && index < groups.length - 1, '只能合并一对相邻组。');
  return [...groups.slice(0, index), [...groups[index], ...groups[index + 1]], ...groups.slice(index + 2)];
}
export function modelProbabilities(state: ChiState): { probabilities: number[]; labels: string[] } {
  if (state.model === 'given') {
    const probabilities = numbers(state.probabilities, 2, 40);
    requireCondition(probabilities.every(p => p >= 0 && p <= 1) && Math.abs(probabilities.reduce((a, b) => a + b, 0) - 1) < 1e-9, '给定模型概率必须非负且总和为 1；不会自动归一化。');
    return { probabilities, labels: probabilities.map((_, i) => `类别 ${i + 1}`) };
  }
  const edges = numbers(state.cutoffs, 1, 39);
  requireCondition(edges.every((x, i) => i === 0 || x > edges[i - 1]), '分组切点必须严格递增。');
  const discrete = state.model === 'binomial' || state.model === 'poisson';
  let cdf: (x: number) => number, sf: (x: number) => number;
  if (discrete) {
    requireCondition(edges.every(x => Number.isInteger(x) && x >= 0 && (state.model !== 'binomial' || x < state.trials)), '离散分组切点必须为支持内非负整数，且小于二项 n。');
    const mass = state.model === 'binomial' ? binomialMass(state.trials, state.probability) : poissonMass(state.lambda);
    cdf = x => mass.reduce((sum, p, i) => sum + (i <= x ? p : 0), 0);
    sf = x => mass.reduce((sum, p, i) => sum + (i > x ? p : 0), 0);
  } else if (state.model === 'normal') {
    requireCondition(state.sigma > 0 && Number.isFinite(state.sigma) && Number.isFinite(state.mu), '正态模型需要正标准差和有限均值。');
    cdf = x => normalCdf((x - state.mu) / state.sigma); sf = x => normalSf((x - state.mu) / state.sigma);
  } else {
    requireCondition(state.rate > 0 && Number.isFinite(state.rate) && edges.every(x => x > 0), '指数模型需要正发生率和正切点。');
    cdf = x => -Math.expm1(-state.rate * x); sf = x => Math.exp(-state.rate * x);
  }
  const probabilities = [cdf(edges[0]), ...edges.slice(1).map((edge, i) => {
    const left = edges[i]; return cdf(left) > .5 ? sf(left) - sf(edge) : cdf(edge) - cdf(left);
  }), sf(edges[edges.length - 1])];
  const labels = [`${discrete ? '0' : state.model === 'exponential' ? '0' : '−∞'} 至 ${edges[0]}`, ...edges.slice(1).map((edge, i) => discrete ? `${edges[i] + 1} 至 ${edge}` : `(${edges[i]}, ${edge}]`), `${discrete ? '≥ ' + (edges.at(-1)! + 1) : '> ' + edges.at(-1)}`];
  return { probabilities, labels };
}
export function chiDecision(statistic: number, df: number, expected: number[], alpha: number) {
  requireCondition(alpha > 0 && alpha < .5, '显著性应在 (0,0.5)。');
  const reasons: string[] = [];
  if (df <= 0) reasons.push('自由度必须大于 0。');
  if (expected.some(e => e < 5)) reasons.push('课程模式要求每组最终期望频数至少为 5，请合法合并类别。');
  const valid = reasons.length === 0;
  const pValue = df > 0 && Number.isFinite(statistic) ? chiSquareSf(statistic, df) : undefined;
  const critical = df > 0 ? chiSquareQuantile(1 - alpha, df) : undefined;
  return { valid, reasons, pValue, critical, reject: valid && pValue !== undefined ? pValue <= alpha : undefined };
}

export function fitRawModel(state: ChiState) {
  requireCondition(['poisson', 'binomial', 'normal'].includes(state.model), '原始样本自动估参支持泊松、固定 n 的二项和正态模型。');
  const values = numbers(state.rawSample ?? initialChi.rawSample!, 2, 200), center = mean(values);
  let fitted: ChiState, estimated: number, parameters: { name: string; value: number }[], convention: string;
  if (state.model === 'poisson') {
    requireCondition(values.every(x => Number.isInteger(x) && x >= 0), '泊松原始观测必须为非负整数。');
    requireCondition(center > 0 && center <= 200, '估计 λ 必须在 (0,200]；全零样本的边界估计不能作常规 χ² 近似检验。');
    fitted = { ...state, lambda: center }; estimated = 1; parameters = [{ name: 'λ̂=原样本均值', value: center }]; convention = 'λ̂=Σx/N，扣除 1 个估计参数。';
  } else if (state.model === 'binomial') {
    requireCondition(Number.isInteger(state.trials) && state.trials >= 1 && state.trials <= 500 && values.every(x => Number.isInteger(x) && x >= 0 && x <= state.trials), '二项原始观测必须为 0 至给定 n 的整数，每个观测使用同一已知 n。');
    const p = center / state.trials;
    requireCondition(p > 0 && p < 1, 'p̂=0 或 1 是边界估计，不能据此作常规 χ² 近似检验。');
    fitted = { ...state, probability: p }; estimated = 1; parameters = [{ name: 'p̂=原样本均值/n', value: p }]; convention = '二项试验次数 n 由题目给定；只扣除估计 p 的 1 个参数。';
  } else {
    const variance = populationVariance(values), sigma = Math.sqrt(variance);
    requireCondition(Number.isFinite(sigma) && sigma > 0, '正态原样本需要正方差；常数样本不能进行此拟合检验。');
    fitted = { ...state, mu: center, sigma }; estimated = 2; parameters = [{ name: 'μ̂=原样本均值', value: center }, { name: 'σ̂（MLE）', value: sigma }, { name: 'σ̂²（分母 N）', value: variance }]; convention = '正态采用极大似然估计：μ̂=Σx/N，σ̂²=Σ(x−μ̂)²/N；扣除 2 个参数。这里不是 t 推断所用的 n−1 无偏样本方差。';
  }
  // Reuse the model's edge validation before assigning every original observation to exactly one bin.
  modelProbabilities(fitted);
  const edges = numbers(state.cutoffs, 1, 39), observed = new Array<number>(edges.length + 1).fill(0);
  for (const value of values) { const index = edges.findIndex(edge => value <= edge); observed[index < 0 ? edges.length : index]++; }
  return { state: fitted, values, observed, estimated, parameters, convention };
}

export function goodnessOfFit(state: ChiState) {
  const fit = state.parameterSource === 'sample' && state.fitMode === 'raw' ? fitRawModel(state) : undefined;
  const observed = (fit?.observed ?? numbers(state.observed, 2, 40)).map(x => x * state.scale);
  requireCondition(observed.every(x => Number.isInteger(x) && x >= 0 && x <= 1e9) && observed.some(x => x > 0), '观测频数必须为非负整数且总数大于 0。');
  const { probabilities, labels } = modelProbabilities(fit?.state ?? state);
  requireCondition(observed.length === probabilities.length, `当前模型产生 ${probabilities.length} 组，观测频数必须逐组匹配并包含两端尾组。`);
  const total = observed.reduce((a, b) => a + b, 0), expected = probabilities.map(p => total * p);
  requireCondition(!expected.some((e, i) => e === 0 && observed[i] > 0), '模型给某组零概率，但该组存在观测；数据与模型支持矛盾，不能进行常规 χ² 近似。');
  const groups = parseGroups(state.groups, observed.length);
  const rows = groups.map(group => {
    const o = group.reduce((s, i) => s + observed[i], 0), e = group.reduce((s, i) => s + expected[i], 0);
    return { label: group.map(i => labels[i]).join(' + '), observed: o, expected: e, probability: group.reduce((s, i) => s + probabilities[i], 0), contribution: e > 0 ? (o - e) ** 2 / e : 0 };
  });
  const estimated = fit?.estimated ?? (state.parameterSource === 'given' ? 0 : state.estimatedCount);
  const maxEstimated = state.model === 'normal' ? 2 : state.model === 'given' ? 10 : 1;
  requireCondition(Number.isInteger(estimated) && (state.parameterSource === 'given' ? estimated === 0 : estimated >= 1 && estimated <= maxEstimated), '本样本估参个数必须与模型及参数来源相符。');
  const df = rows.length - 1 - estimated, statistic = rows.reduce((s, row) => s + row.contribution, 0);
  return { rows, groups, originalExpected: expected, originalObserved: observed, total, estimated, df, statistic, fit, ...chiDecision(statistic, df, rows.map(r => r.expected), state.alpha) };
}
export function parseTable(text: string) {
  const table = text.trim().split(/[\n;]/).filter(row => row.trim()).map(row => numbers(row, 2, 10));
  requireCondition(table.length >= 2 && table.length <= 10 && table.every(row => row.length === table[0].length && row.every(x => Number.isInteger(x) && x >= 0)), '列联表应为 2–10 行和 2–10 列，行等长，填写非负整数。');
  return table;
}
export function independence(state: ChiState) {
  const table = parseTable(state.table);
  const rowGroups = parseGroups(state.rowGroups, table.length), columnGroups = parseGroups(state.columnGroups, table[0].length);
  const observed = rowGroups.map(rg => columnGroups.map(cg => rg.reduce((a, i) => a + cg.reduce((b, j) => b + table[i][j] * state.scale, 0), 0)));
  const rowTotals = observed.map(row => row.reduce((a, b) => a + b, 0)), columnTotals = observed[0].map((_, j) => observed.reduce((s, row) => s + row[j], 0)), total = rowTotals.reduce((a, b) => a + b, 0);
  requireCondition(total > 0 && rowTotals.every(x => x > 0) && columnTotals.every(x => x > 0), '每一行和每一列的边际总数都必须为正。');
  const expected = observed.map((row, i) => row.map((_, j) => rowTotals[i] * columnTotals[j] / total));
  const contributions = observed.map((row, i) => row.map((o, j) => (o - expected[i][j]) ** 2 / expected[i][j]));
  const statistic = contributions.flat().reduce((a, b) => a + b, 0), df = (observed.length - 1) * (observed[0].length - 1);
  return { observed, expected, contributions, rowGroups, columnGroups, rowTotals, columnTotals, total, statistic, df, ...chiDecision(statistic, df, expected.flat(), state.alpha) };
}
