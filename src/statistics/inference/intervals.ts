import { mean, normalCdf, normalQuantile, tCdf, tQuantile } from '../math.ts';
import { numbers, requireCondition, summary } from './common.ts';
import type { IntervalState } from './state.ts';
export function interval(state: IntervalState) {
  const { method, level } = state;
  requireCondition(Number.isFinite(level) && level > 0 && level < 1, '置信水平必须在 0 与 1 之间。');
  let first = { n: state.n, center: state.center, sd: state.sd };
  let second = { n: state.n2, center: state.center2, sd: state.sd2 };
  if (state.source === 'raw' && method !== 'proportion' || method === 'paired') {
    const a = numbers(state.sample, method === 'known' ? 1 : 2), b = method === 'paired' || method === 'pooled' || method === 'independent-large' ? numbers(state.sample2, 2) : [];
    if (method === 'paired') { requireCondition(a.length === b.length, '配对样本必须逐项对应且长度相等。'); first = summary(a.map((x, i) => x - b[i])); }
    else { first = method === 'known' ? { n: a.length, center: mean(a), sd: state.sd } : summary(a); if (b.length) second = summary(b); }
  }
  requireCondition(Number.isInteger(first.n) && first.n >= (method === 'known' ? 1 : 2) && first.n <= 1e6 && Number.isInteger(second.n) && second.n >= 2 && second.n <= 1e6, '已知 σ 的正态均值允许 n≥1；未知方差及两样本的样本量要求 n≥2，上限 1,000,000。');
  requireCondition([first.center, second.center, first.sd, second.sd].every(Number.isFinite) && first.sd >= 0 && second.sd >= 0, '均值与标准差必须有效。');
  let center = first.center, se = 0, df: number | undefined, pooledVariance: number | undefined;
  const warnings: string[] = [];
  if (method === 'proportion') {
    requireCondition(Number.isInteger(state.successes) && state.successes >= 0 && state.successes <= state.n, '成功次数应为 0 至 n 的整数。');
    center = state.successes / state.n; se = Math.sqrt(center * (1 - center) / state.n);
    if (state.successes < 5 || state.n - state.successes < 5) warnings.push('成功或失败次数不足 5，正态近似条件不足；这里仅显示公式结果，不应据此作可靠推断。');
  } else if (method === 'pooled' || method === 'independent-large') {
    center = first.center - second.center;
    if (method === 'pooled') {
      df = first.n + second.n - 2;
      pooledVariance = ((first.n - 1) * first.sd ** 2 + (second.n - 1) * second.sd ** 2) / df;
      se = Math.sqrt(pooledVariance * (1 / first.n + 1 / second.n));
    } else { se = Math.sqrt(first.sd ** 2 / first.n + second.sd ** 2 / second.n); if (Math.min(first.n, second.n) < 30) warnings.push('至少一组 n<30；不能仅凭选择此方法断言大样本近似足够。'); }
  } else {
    se = (method === 'known' ? state.sd : first.sd) / Math.sqrt(first.n);
    if (method === 't' || method === 'paired') df = first.n - 1;
    if (method === 'large' && first.n < 30) warnings.push('n<30：大样本 z 近似需要另行论证。');
  }
  requireCondition(Number.isFinite(se) && (se > 0 || method === 'proportion'), '标准误必须为正；常数样本不能进行未知方差的 t 推断。');
  const critical = df === undefined ? normalQuantile((1 + level) / 2) : tQuantile((1 + level) / 2, df);
  const halfWidth = critical * se, low = center - halfWidth, high = center + halfWidth;
  if (method === 'proportion' && (low < 0 || high > 1)) warnings.push('Wald 正态近似区间越出 [0,1]，已保留原结果，不静默截断为其他方法。');
  return { center, se, df, pooledVariance, critical, low, high, halfWidth, width: 2 * halfWidth, first, second, warnings };
}

export function minimumNormalSampleSize(sd: number, level: number, fullWidth: number, minimumN = 1) {
  requireCondition(Number.isFinite(sd) && sd > 0 && Number.isFinite(fullWidth) && fullWidth > 0 && level > 0 && level < 1, '规划标准差、全宽必须为正，置信水平在 (0,1)。');
  requireCondition(Number.isInteger(minimumN) && minimumN >= 1 && minimumN <= 1e6, '规划样本量下限必须为正整数。');
  const z = normalQuantile((1 + level) / 2), widthAt = (n: number) => 2 * z * sd / Math.sqrt(n);
  const raw = (2 * z * sd / fullWidth) ** 2;
  requireCondition(Number.isFinite(raw) && raw <= 1e9, '目标宽度需要超过 10⁹ 个观测，请调整规划范围。');
  let n = Math.max(minimumN, Math.ceil(raw));
  while (widthAt(n) > fullWidth) n++;
  while (n > minimumN && widthAt(n - 1) <= fullWidth) n--;
  return { n, raw, width: widthAt(n), previousWidth: n > minimumN ? widthAt(n - 1) : undefined };
}

export function minimumTSampleSize(sd: number, level: number, fullWidth: number, pairedGroups = false) {
  requireCondition(Number.isFinite(sd) && sd > 0 && Number.isFinite(fullWidth) && fullWidth > 0 && level > 0 && level < 1, '规划标准差和全宽必须为正。');
  const widthAt = (n: number) => 2 * tQuantile((1 + level) / 2, pairedGroups ? 2 * n - 2 : n - 1) * sd / Math.sqrt(n);
  let high = 2;
  while (widthAt(high) > fullWidth && high < 1e6) high = Math.min(1e6, high * 2);
  requireCondition(widthAt(high) <= fullWidth, '此 t 区间规划需要超过每组 10⁶ 个观测。');
  let low = 2;
  while (low < high) { const mid = Math.floor((low + high) / 2); if (widthAt(mid) <= fullWidth) high = mid; else low = mid + 1; }
  return { n: low, width: widthAt(low), previousWidth: low > 2 ? widthAt(low - 1) : undefined };
}

export function invertInterval(low: number, high: number, level: number, se: number, df?: number) {
  requireCondition(Number.isFinite(low) && Number.isFinite(high) && low < high && se > 0 && Number.isFinite(se) && level > 0 && level < 1, '反求需要下限 < 上限、有效置信度及正标准误。');
  const halfWidth = (high - low) / 2;
  const critical = df === undefined ? normalQuantile((1 + level) / 2) : tQuantile((1 + level) / 2, df);
  const cdf = df === undefined ? normalCdf(halfWidth / se) : tCdf(halfWidth / se, df);
  return { center: (low + high) / 2, inferredSe: halfWidth / critical, inferredLevel: Math.max(0, Math.min(1, 2 * cdf - 1)) };
}

export function normalCoverage(level: number, n: number, sigma: number, seed: number, count = 50) {
  requireCondition(level > 0 && level < 1 && Number.isInteger(n) && n >= 1 && sigma > 0 && Number.isFinite(sigma), '覆盖实验参数无效。');
  let randomState = seed >>> 0;
  const rng = () => { randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0; return (randomState + .5) / 4294967296; };
  const se = sigma / Math.sqrt(n), halfWidth = normalQuantile((1 + level) / 2) * se;
  return Array.from({ length: count }, () => { const standardNormal = Math.sqrt(-2 * Math.log(rng())) * Math.cos(2 * Math.PI * rng()); const center = se * standardNormal; return { low: center - halfWidth, high: center + halfWidth, covers: Math.abs(center) <= halfWidth }; });
}
