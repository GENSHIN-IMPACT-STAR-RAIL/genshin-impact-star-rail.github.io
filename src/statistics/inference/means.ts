import { logGamma, normalQuantile, tQuantile } from '../math.ts';
import { numbers, requireCondition, summary, tailProbability } from './common.ts';
import type { MeanState } from './state.ts';
export function meanInference(state: MeanState) {
  const a = numbers(state.sample, 2), b = state.design === 'single' ? [] : numbers(state.sample2, 2);
  requireCondition(state.alpha > 0 && state.alpha < .5 && Number.isFinite(state.nullValue), '显著性或假设值无效。');
  const first = summary(a), second = b.length ? summary(b) : undefined;
  let estimate = first.center, se: number, df: number | undefined, pooledVariance: number | undefined, method: string, reason: string, differences: number[] = [];
  if (state.design === 'paired') {
    requireCondition(a.length === b.length, '配对设计要求一一对应且样本数相等；n 相等本身不能证明存在配对。');
    differences = a.map((x, i) => x - b[i]);
    const d = summary(differences); estimate = d.center;
    requireCondition(state.normal, '配对 t 需要差值总体正态；请先核实差值条件。当前界面不以两个边际总体正态替代该条件。');
    se = d.sd / Math.sqrt(d.n); df = d.n - 1; method = '配对 t'; reason = '对每一对的 A−B 做单样本 t；样本标准差来自差值。';
  } else if (state.design === 'single') {
    if (state.known) {
      requireCondition(state.sigma > 0 && Number.isFinite(state.sigma) && (state.normal || state.large && a.length >= 30), '已知 σ 的 z 检验需要正态总体，或有足够样本的 CLT 依据。');
      se = state.sigma / Math.sqrt(a.length); method = state.normal ? '已知 σ 的 z' : '大样本 z（已知 σ）'; reason = '标准误使用已知总体 σ/√n。';
    } else if (state.normal) { se = first.sd / Math.sqrt(a.length); df = a.length - 1; method = '单样本 t'; reason = '正态总体、σ 未知；s² 使用 n−1 分母。'; }
    else { requireCondition(state.large && a.length >= 30, '未知 σ 且没有正态条件时，需要独立大样本；本演示以 n≥30 为起点，不能保证任意总体均适用。'); se = first.sd / Math.sqrt(a.length); method = '大样本近似 z'; reason = '用 s 估计 σ；CLT 近似需结合总体形态论证。'; }
  } else {
    requireCondition(second, '需要第二个独立样本。'); estimate = first.center - second.center;
    if (state.known) {
      requireCondition(state.sigma > 0 && state.sigma2 > 0 && [state.sigma, state.sigma2].every(Number.isFinite) && (state.normal || state.large && Math.min(a.length, b.length) >= 30), '两已知方差 z 需要两个正态总体，或两组均有足够的 CLT 依据。');
      se = Math.sqrt(state.sigma ** 2 / a.length + state.sigma2 ** 2 / b.length); method = '已知方差的独立均差 z'; reason = '两个独立样本的均值方差相加。';
    } else if (state.normal && state.equalVariance) {
      df = a.length + b.length - 2; pooledVariance = ((a.length - 1) * first.sd ** 2 + (b.length - 1) * second.sd ** 2) / df;
      se = Math.sqrt(pooledVariance * (1 / a.length + 1 / b.length)); method = 'pooled t'; reason = '两个独立正态总体且有共同未知方差，合并两组无偏方差。';
    } else {
      requireCondition(state.large && Math.min(a.length, b.length) >= 30, '没有共同方差条件时不使用 pooled t。现行课程路径需两个独立大样本，Welch 不作为默认替代。');
      se = Math.sqrt(first.sd ** 2 / a.length + second.sd ** 2 / b.length); method = '独立大样本均差 z'; reason = '各组 s² 分别除以 n 后相加，未假设共同方差。';
    }
  }
  requireCondition(se > 0 && Number.isFinite(se), '标准误为零或无效，无法进行所选推断。');
  const statistic = (estimate - state.nullValue) / se, pValue = tailProbability(statistic, state.tail, df);
  const quantile = (p: number) => df === undefined ? normalQuantile(p) : tQuantile(p, df);
  const critical = quantile(1 - (state.tail === 'two' ? state.alpha / 2 : state.alpha));
  const ciCritical = quantile(1 - state.alpha / 2), low = estimate - ciCritical * se, high = estimate + ciCritical * se;
  // Critical-value decisions use the same quantile as the interval, including the endpoint convention.
  const reject = state.tail === 'two' ? Math.abs(statistic) >= critical : state.tail === 'upper' ? statistic >= critical : statistic <= -critical;
  return { a, b, first, second, differences, estimate, se, df, pooledVariance, method, reason, statistic, pValue, reject, low, high, critical, duality: state.tail === 'two', nullInside: state.nullValue > low && state.nullValue < high };
}
export function standardDensity(x: number, df?: number) {
  if (df === undefined) return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
  return Math.exp(logGamma((df + 1) / 2) - logGamma(df / 2) - .5 * Math.log(df * Math.PI) - (df + 1) / 2 * Math.log1p(x * x / df));
}
