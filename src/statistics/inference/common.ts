import { mean, sampleVariance, normalCdf, normalSf, tCdf, tSf } from '../math.ts';
import type { Tail } from './state.ts';
export function requireCondition(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
export function numbers(text: string, minimum = 1, maximum = 200): number[] {
  const tokens = text.trim().split(/[\s,;，、]+/);
  requireCondition(text.trim() && tokens.length >= minimum && tokens.length <= maximum && tokens.every(t => /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(t)), `请输入 ${minimum}–${maximum} 个有效数值，以逗号或空格分隔。`);
  const values = tokens.map(Number);
  requireCondition(values.every(v => Number.isFinite(v) && Math.abs(v) <= 1e9), '观测必须是有限数，绝对值不超过 10⁹。');
  return values;
}
export function summary(values: number[]) {
  requireCondition(values.length >= 2 && values.every(Number.isFinite), '至少需要两个有限观测值。');
  return { n: values.length, center: mean(values), sd: Math.sqrt(sampleVariance(values)) };
}
export function probability(value: number) { return Math.min(1, Math.max(0, value)); }
export function tailProbability(statistic: number, tail: Tail, df?: number) {
  const lower = df === undefined ? normalCdf(statistic) : tCdf(statistic, df);
  const upper = df === undefined ? normalSf(statistic) : tSf(statistic, df);
  return probability(tail === 'lower' ? lower : tail === 'upper' ? upper : 2 * Math.min(lower, upper));
}
export function captured<T>(calculation: () => T): { result?: T; error?: string } {
  try { return { result: calculation() }; } catch (error) { return { error: error instanceof Error ? error.message : '输入无效。' }; }
}
export function conclusion(reject: boolean) { return reject ? '有充分证据支持 H₁（在所选显著性水平下）。' : '没有充分证据支持 H₁；不拒绝 H₀ 并不证明 H₀。'; }
