import { normalCdf, normalSf, normalQuantile } from '../math.ts';
import { numbers, probability, requireCondition } from './common.ts';
import { binomialMass, criticalRegion } from './hypothesis.ts';
import type { RankState, Tail } from './state.ts';
export function signedRankDistribution(n: number): number[] {
  requireCondition(Number.isInteger(n) && n >= 1 && n <= 25, '符号秩精确分布支持 1–25 个无零差、无并列绝对差的观测。');
  const counts = new Array(n * (n + 1) / 2 + 1).fill(0); counts[0] = 1;
  for (let rank = 1; rank <= n; rank++) for (let sum = counts.length - 1; sum >= rank; sum--) counts[sum] += counts[sum - rank];
  return counts.map(x => x / 2 ** n);
}
export function rankSumDistribution(m: number, n: number): number[] {
  requireCondition(Number.isInteger(m) && Number.isInteger(n) && m >= 1 && n >= 1 && m + n <= 40, '秩和精确分布支持合计不超过 40 的两个非空无并列样本。');
  const total = m + n, max = m * (2 * total - m + 1) / 2;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(max + 1).fill(0)); dp[0][0] = 1;
  for (let rank = 1; rank <= total; rank++) for (let size = Math.min(m, rank); size >= 1; size--) for (let sum = max; sum >= rank; sum--) dp[size][sum] += dp[size - 1][sum - rank];
  const count = dp[m].reduce((a, b) => a + b, 0);
  return dp[m].map(x => x / count);
}
export function exactRankTails(masses: number[], observed: number, tail: Tail) {
  const lower = probability(masses.reduce((s, p, k) => s + (k <= observed ? p : 0), 0));
  const upper = probability(masses.reduce((s, p, k) => s + (k >= observed ? p : 0), 0));
  return tail === 'lower' ? lower : tail === 'upper' ? upper : Math.min(1, 2 * Math.min(lower, upper));
}
export type RankRow = { index: number; group: 'A' | 'B'; value: number; other?: number; difference: number; absolute: number; rank?: number; positive: boolean };
export function rankInference(state: RankState) {
  requireCondition((state.design === 'independent') === (state.method === 'ranksum'), '秩和用于独立两样本；符号与符号秩用于单样本或配对差。');
  const a = numbers(state.sample, 2), b = state.design === 'single' ? [] : numbers(state.sample2, 2);
  requireCondition(state.alpha > 0 && state.alpha < .5 && Number.isFinite(state.median), '显著性或假设中位数无效。');
  let rows: RankRow[], statistic: number, expected: number, variance: number, masses: number[] | undefined, negativeSum: number | undefined, otherGroupSum: number | undefined, reverseSum: number | undefined, totalRanks: number | undefined;
  const warnings: string[] = [];
  if (state.method === 'ranksum') {
    rows = [...a.map((value, index): RankRow => ({ index, group: 'A', value, difference: value - state.median, absolute: Math.abs(value - state.median), positive: true })), ...b.map((value, index): RankRow => ({ index, group: 'B', value, difference: value, absolute: Math.abs(value), positive: false }))];
    const sorted = [...rows].sort((x, y) => x.difference - y.difference);
    requireCondition(sorted.every((r, i) => i === 0 || r.difference !== sorted[i - 1].difference), '检测到合并样本的并列值（tied ranks）。数据已保留；FS 考试模式不计算平均秩或套用无 ties 精确分布/方差。');
    sorted.forEach((row, i) => { row.rank = i + 1; });
    const m = a.length, n = b.length, total = m + n;
    statistic = rows.filter(r => r.group === 'A').reduce((s, r) => s + r.rank!, 0);
    totalRanks = total * (total + 1) / 2; otherGroupSum = totalRanks - statistic; reverseSum = m * (total + 1) - statistic;
    expected = m * (total + 1) / 2; variance = m * n * (total + 1) / 12;
    if (state.approximation === 'auto' && total <= 40) masses = rankSumDistribution(m, n);
    else if (Math.min(m, n) < 10) warnings.push('至少一组不足 10；正态近似可能较差，可选自动精确方法。');
  } else {
    if (state.design === 'paired') requireCondition(a.length === b.length, '配对样本必须等长且逐项对应。');
    rows = a.map((value, index) => {
      const other = state.design === 'paired' ? b[index] : undefined;
      const difference = value - (other ?? 0) - state.median;
      return { index, group: 'A', value, other, difference, absolute: Math.abs(difference), positive: difference > 0 };
    });
    requireCondition(rows.every(r => r.difference !== 0), '检测到等于假设中位数的观测或零配对差。数据已保留；FS 考试模式停止计算，不静默删掉零差。');
    const n = rows.length;
    if (state.method === 'sign') {
      statistic = rows.filter(r => r.positive).length; expected = n / 2; variance = n / 4;
      if (state.approximation === 'auto' && n <= 100) masses = binomialMass(n, .5);
      else if (n < 20) warnings.push('n<20，符号计数的正态近似可能较差。');
    } else {
      const sorted = [...rows].sort((x, y) => x.absolute - y.absolute);
      requireCondition(sorted.every((r, i) => i === 0 || r.absolute !== sorted[i - 1].absolute), '检测到绝对差的并列秩。FS 考试模式停止计算，不能使用无 ties 的方差或精确分布。');
      sorted.forEach((row, i) => { row.rank = i + 1; });
      statistic = rows.filter(r => r.positive).reduce((s, r) => s + r.rank!, 0); totalRanks = n * (n + 1) / 2; negativeSum = totalRanks - statistic;
      expected = n * (n + 1) / 4; variance = n * (n + 1) * (2 * n + 1) / 24;
      if (state.approximation === 'auto' && n <= 25) masses = signedRankDistribution(n);
      else if (n < 10) warnings.push('n<10，符号秩的正态近似可能较差。');
    }
  }
  const sd = Math.sqrt(variance), lowerZ = (statistic + .5 - expected) / sd, upperZ = (statistic - .5 - expected) / sd;
  let pValue: number, lower: number, upper: number, actualAlpha: number | undefined;
  if (masses) { pValue = exactRankTails(masses, statistic, state.tail); const region = criticalRegion(masses, state.tail, state.alpha); ({ lower, upper, actualAlpha } = region); }
  else {
    pValue = probability(state.tail === 'lower' ? normalCdf(lowerZ) : state.tail === 'upper' ? normalSf(upperZ) : 2 * Math.min(normalCdf(lowerZ), normalSf(upperZ)));
    const z = normalQuantile(1 - (state.tail === 'two' ? state.alpha / 2 : state.alpha));
    lower = state.tail === 'upper' ? -Infinity : Math.floor(expected - z * sd - .5); upper = state.tail === 'lower' ? Infinity : Math.ceil(expected + z * sd + .5);
  }
  return { rows, statistic, expected, variance, sd, masses, exact: !!masses, pValue, lower, upper, actualAlpha, lowerZ, upperZ, reject: statistic <= lower || statistic >= upper, negativeSum, otherGroupSum, reverseSum, totalRanks, warnings };
}
