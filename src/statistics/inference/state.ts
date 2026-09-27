export type Tail = 'lower' | 'upper' | 'two';
export type IntervalMethod = 'known' | 'large' | 'proportion' | 't' | 'paired' | 'pooled' | 'independent-large';
export type IntervalState = { method: IntervalMethod; source: 'summary' | 'raw'; sample: string; sample2: string; center: number; center2: number; sd: number; sd2: number; n: number; n2: number; successes: number; level: number; targetWidth: number; inverseLow: number; inverseHigh: number; coverageSeed: number };
export type TestState = { model: 'binomial' | 'poisson' | 'z'; tail: Tail; alpha: number; n: number; p0: number; p1: number; lambda0: number; lambda1: number; observed: number; mean0: number; mean1: number; se: number };
export type MeanState = { design: 'single' | 'paired' | 'independent'; sample: string; sample2: string; known: boolean; normal: boolean; large: boolean; equalVariance: boolean; sigma: number; sigma2: number; nullValue: number; alpha: number; tail: Tail; viewDf: number };
export type ChiState = { mode: 'gof' | 'independence'; observed: string; probabilities: string; model: 'given' | 'binomial' | 'poisson' | 'normal' | 'exponential'; cutoffs: string; trials: number; probability: number; lambda: number; mu: number; sigma: number; rate: number; parameterSource: 'given' | 'sample'; estimatedCount: number; groups: string; table: string; rowGroups: string; columnGroups: string; alpha: number; scale: number; fitMode?: 'manual' | 'raw'; rawSample?: string };
export type RankState = { design: 'single' | 'paired' | 'independent'; method: 'sign' | 'signedrank' | 'ranksum'; sample: string; sample2: string; median: number; tail: Tail; alpha: number; approximation: 'auto' | 'normal' };

export const initialIntervals: IntervalState = { method: 'known', source: 'summary', sample: '12, 15, 9, 16, 11, 14, 13, 10', sample2: '10, 12, 8, 14, 9, 11, 12, 8', center: 12.5, center2: 10.5, sd: 3, sd2: 2.5, n: 36, n2: 30, successes: 21, level: .95, targetWidth: 2, inverseLow: 11.52, inverseHigh: 13.48, coverageSeed: 1 };
export const initialTests: TestState = { model: 'binomial', tail: 'upper', alpha: .05, n: 20, p0: .5, p1: .75, lambda0: 5, lambda1: 9, observed: 15, mean0: 100, mean1: 104, se: 2 };
export const initialMeans: MeanState = { design: 'single', sample: '12, 15, 9, 16, 11, 14, 13, 10', sample2: '10, 12, 8, 14, 9, 11, 12, 8', known: false, normal: true, large: false, equalVariance: true, sigma: 3, sigma2: 3, nullValue: 10, alpha: .05, tail: 'two', viewDf: 7 };
export const initialChi: ChiState = { mode: 'gof', observed: '18, 24, 30, 28', probabilities: '.25, .25, .25, .25', model: 'given', cutoffs: '2, 4, 6', trials: 10, probability: .5, lambda: 4, mu: 4, sigma: 2, rate: .5, parameterSource: 'given', estimatedCount: 0, groups: '', table: '30, 20, 10\n15, 25, 20', rowGroups: '', columnGroups: '', alpha: .05, scale: 1, fitMode: 'manual', rawSample: '0 0 1 1 1 1 1 1 2 2 2 2 2 2 2 2 3 3 3 3 3 3 3 3 4 4 4 4 4 4 5 5 5 5 6 6 6 7 7 8' };
export const initialRanks: RankState = { design: 'single', method: 'signedrank', sample: '12, 14, 7, 15, 9, 16, 18, 19', sample2: '1, 3, 5, 7, 9, 11', median: 10, tail: 'two', alpha: .05, approximation: 'auto' };

type RecordValue = Record<string, unknown>;
function shape(v: unknown, template: object): v is RecordValue {
  return !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === Object.keys(template).length && Object.keys(template).every(k => Object.hasOwn(v, k));
}
const finite = (v: unknown, low = -1e9, high = 1e9): v is number => typeof v === 'number' && Number.isFinite(v) && v >= low && v <= high;
const integer = (v: unknown, low: number, high: number) => finite(v, low, high) && Number.isInteger(v);
const oneOf = (v: unknown, xs: readonly string[]) => typeof v === 'string' && xs.includes(v);
const numericText = (v: unknown, max = 6000) => typeof v === 'string' && v.length > 0 && v.length <= max && /^[\s,;，、+\-.eE\d]+$/.test(v) && v.trim().split(/[\s,;，、]+/).every(x => finite(Number(x)));
const groupText = (v: unknown) => typeof v === 'string' && v.length <= 500 && /^\d*(?:[\s,|]+\d+)*$/.test(v);
const alpha = (v: unknown) => finite(v, .0001, .3);
const tail = (v: unknown) => oneOf(v, ['lower', 'upper', 'two']);
const sampleText = (v: unknown) => numericText(v) && (v as string).trim().split(/[\s,;，、]+/).length <= 200;

export function validateIntervals(v: unknown): v is IntervalState {
  return shape(v, initialIntervals) && oneOf(v.method, ['known', 'large', 'proportion', 't', 'paired', 'pooled', 'independent-large']) && oneOf(v.source, ['summary', 'raw']) && sampleText(v.sample) && sampleText(v.sample2) && ['center', 'center2', 'inverseLow', 'inverseHigh'].every(k => finite(v[k])) && finite(v.sd, 1e-8, 1e8) && finite(v.sd2, 1e-8, 1e8) && integer(v.n, v.method === 'known' ? 1 : 2, 1e6) && integer(v.n2, 2, 1e6) && integer(v.successes, 0, v.n as number) && finite(v.level, .5, .9999) && finite(v.targetWidth, 1e-8, 1e9) && integer(v.coverageSeed, 1, 1e9);
}
export function validateTests(v: unknown): v is TestState {
  return shape(v, initialTests) && oneOf(v.model, ['binomial', 'poisson', 'z']) && tail(v.tail) && alpha(v.alpha) && integer(v.n, 1, 500) && finite(v.p0, .0001, .9999) && finite(v.p1, 0, 1) && finite(v.lambda0, .01, 200) && finite(v.lambda1, .01, 200) && finite(v.observed) && (v.model === 'z' || integer(v.observed, 0, v.model === 'binomial' ? v.n as number : 1000)) && finite(v.mean0) && finite(v.mean1) && finite(v.se, 1e-8, 1e8);
}
export function validateMeans(v: unknown): v is MeanState {
  return shape(v, initialMeans) && oneOf(v.design, ['single', 'paired', 'independent']) && sampleText(v.sample) && sampleText(v.sample2) && ['known', 'normal', 'large', 'equalVariance'].every(k => typeof v[k] === 'boolean') && finite(v.sigma, 1e-8, 1e8) && finite(v.sigma2, 1e-8, 1e8) && finite(v.nullValue) && alpha(v.alpha) && tail(v.tail) && integer(v.viewDf, 1, 200);
}
export function validateChi(value: unknown): value is ChiState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  // Optional fields keep pre-fitting saved works readable; present fields are still strictly checked.
  const v: Record<string, unknown> = { fitMode: 'manual', rawSample: initialChi.rawSample, ...value };
  if (v.parameterSource === 'sample' && v.fitMode === 'raw' && !oneOf(v.model, ['binomial', 'poisson', 'normal'])) return false;
  return shape(v, initialChi) && oneOf(v.mode, ['gof', 'independence']) && numericText(v.observed, 1000) && numericText(v.probabilities, 1000) && oneOf(v.model, ['given', 'binomial', 'poisson', 'normal', 'exponential']) && numericText(v.cutoffs, 1000) && integer(v.trials, 1, 500) && finite(v.probability, 0, 1) && finite(v.lambda, .01, 200) && finite(v.mu) && finite(v.sigma, 1e-8, 1e8) && finite(v.rate, 1e-8, 1e8) && oneOf(v.parameterSource, ['given', 'sample']) && (v.parameterSource === 'sample' ? integer(v.estimatedCount, 1, v.model === 'normal' ? 2 : v.model === 'given' ? 10 : 1) : v.estimatedCount === 0) && groupText(v.groups) && groupText(v.rowGroups) && groupText(v.columnGroups) && numericText(v.table, 2500) && alpha(v.alpha) && integer(v.scale, 1, 100) && oneOf(v.fitMode, ['manual', 'raw']) && sampleText(v.rawSample);
}
export function validateRanks(v: unknown): v is RankState {
  return shape(v, initialRanks) && oneOf(v.design, ['single', 'paired', 'independent']) && oneOf(v.method, ['sign', 'signedrank', 'ranksum']) && ((v.design === 'independent') === (v.method === 'ranksum')) && sampleText(v.sample) && sampleText(v.sample2) && finite(v.median) && tail(v.tail) && alpha(v.alpha) && oneOf(v.approximation, ['auto', 'normal']);
}
