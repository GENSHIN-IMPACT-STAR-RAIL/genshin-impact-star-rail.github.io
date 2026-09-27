import { logGamma, normalCdf, normalSf, normalQuantile } from '../math.ts';
import { probability, requireCondition, tailProbability } from './common.ts';
import type { Tail, TestState } from './state.ts';
export function binomialMass(n: number, p: number) {
  requireCondition(Number.isInteger(n) && n >= 1 && n <= 500 && Number.isFinite(p) && p >= 0 && p <= 1, '二项模型需要整数 1≤n≤500、0≤p≤1。');
  return Array.from({ length: n + 1 }, (_, k) => p === 0 ? Number(k === 0) : p === 1 ? Number(k === n) : Math.exp(logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1) + k * Math.log(p) + (n - k) * Math.log1p(-p)));
}
export function poissonMass(lambda: number) {
  requireCondition(Number.isFinite(lambda) && lambda > 0 && lambda <= 200, '泊松模型需要 0<λ≤200。');
  const max = Math.ceil(lambda + 16 * Math.sqrt(lambda + 1) + 50);
  return Array.from({ length: max + 1 }, (_, k) => Math.exp(-lambda + k * Math.log(lambda) - logGamma(k + 1)));
}
export function criticalRegion(masses: number[], tail: Tail, alpha: number) {
  requireCondition(alpha > 0 && alpha < .5 && masses.length > 0 && masses.every(v => Number.isFinite(v) && v >= 0), '显著性或概率模型无效。');
  const budget = tail === 'two' ? alpha / 2 : alpha;
  let lower = -1, upper = Infinity, accumulated = 0;
  if (tail !== 'upper') for (let k = 0; k < masses.length; k++) { accumulated += masses[k]; if (accumulated <= budget + 1e-13) lower = k; else break; }
  accumulated = 0;
  if (tail !== 'lower') for (let k = masses.length - 1; k >= 0; k--) { accumulated += masses[k]; if (accumulated <= budget + 1e-13) upper = k; else break; }
  const rejects = (k: number) => k <= lower || k >= upper;
  const actualAlpha = probability(masses.reduce((s, p, k) => s + (rejects(k) ? p : 0), 0));
  return { lower, upper, actualAlpha, rejects, budget };
}
export function discreteTest(state: TestState) {
  requireCondition(state.model !== 'z', '此函数只用于离散模型。');
  const masses = state.model === 'binomial' ? binomialMass(state.n, state.p0) : poissonMass(state.lambda0);
  const alternative = state.model === 'binomial' ? binomialMass(state.n, state.p1) : poissonMass(state.lambda1);
  requireCondition(Number.isInteger(state.observed) && state.observed >= 0 && (state.model !== 'binomial' || state.observed <= state.n), '观测统计量必须为模型支持内的非负整数。');
  const region = criticalRegion(masses, state.tail, state.alpha);
  const lowerP = probability(masses.reduce((s, p, k) => s + (k <= state.observed ? p : 0), 0));
  const upperP = probability(masses.reduce((s, p, k) => s + (k >= state.observed ? p : 0), 0));
  const pValue = state.tail === 'lower' ? lowerP : state.tail === 'upper' ? upperP : Math.min(1, 2 * Math.min(lowerP, upperP));
  const power = probability(alternative.reduce((s, p, k) => s + (region.rejects(k) ? p : 0), 0));
  const lowerNext = region.lower + 1 < masses.length ? masses.slice(0, region.lower + 2).reduce((a, b) => a + b, 0) : 1;
  const upperPrevious = region.upper === Infinity ? undefined : masses.slice(Math.max(0, region.upper - 1)).reduce((a, b) => a + b, 0);
  return { masses, alternative, ...region, pValue, power, beta: 1 - power, reject: region.rejects(state.observed), lowerNext, upperPrevious };
}
export function zTest(state: Pick<TestState, 'mean0' | 'mean1' | 'observed' | 'se' | 'alpha' | 'tail'>) {
  requireCondition([state.mean0, state.mean1, state.observed, state.se, state.alpha].every(Number.isFinite) && state.se > 0 && state.alpha > 0 && state.alpha < .5, 'z 检验需要有效均值、正标准误及显著性。');
  const critical = normalQuantile(1 - (state.tail === 'two' ? state.alpha / 2 : state.alpha));
  const lower = state.tail === 'upper' ? -Infinity : -critical, upper = state.tail === 'lower' ? Infinity : critical;
  const statistic = (state.observed - state.mean0) / state.se, shift = (state.mean1 - state.mean0) / state.se;
  const power = probability(normalCdf(lower - shift) + normalSf(upper - shift));
  return { statistic, shift, lower, upper, critical, pValue: tailProbability(statistic, state.tail), actualAlpha: state.alpha, power, beta: 1 - power, reject: statistic <= lower || statistic >= upper };
}

export function compatiblePRange(rejectAt: number, notRejectAt: number) {
  requireCondition(notRejectAt > 0 && rejectAt < 1 && notRejectAt < rejectAt, '不拒绝水平应小于拒绝水平。');
  return { lowerExclusive: notRejectAt, upperInclusive: rejectAt };
}

export function invertDiscreteBoundary(model: 'binomial' | 'poisson', n: number, observed: number, targetTailProbability: number, side: 'lower' | 'upper') {
  requireCondition(targetTailProbability > 0 && targetTailProbability < 1 && Number.isInteger(observed) && observed >= 0, '临界边界反求输入无效。');
  const tailAt = (parameter: number) => {
    const masses = model === 'binomial' ? binomialMass(n, parameter) : poissonMass(parameter);
    return masses.reduce((sum, p, k) => sum + ((side === 'upper' ? k >= observed : k <= observed) ? p : 0), 0);
  };
  let low = model === 'binomial' ? 0 : .01, high = model === 'binomial' ? 1 : 200;
  const fLow = tailAt(low), fHigh = tailAt(high);
  requireCondition(targetTailProbability >= Math.min(fLow, fHigh) && targetTailProbability <= Math.max(fLow, fHigh) && Math.abs(fLow - fHigh) > 1e-12, '当前观测边界在参数支持范围内没有此尾概率的唯一反解。');
  for (let i = 0; i < 52; i++) { const mid = (low + high) / 2; if ((tailAt(mid) < targetTailProbability) === (side === 'upper')) low = mid; else high = mid; }
  const parameter = (low + high) / 2;
  return { parameter, tailProbability: tailAt(parameter) };
}
