import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalSf } from '../math.ts';
import { interval, invertInterval, minimumNormalSampleSize, minimumTSampleSize, normalCoverage } from './intervals.ts';
import { binomialMass, poissonMass, criticalRegion, discreteTest, zTest, invertDiscreteBoundary, compatiblePRange } from './hypothesis.ts';
import { meanInference } from './means.ts';
import { fitRawModel, goodnessOfFit, independence, modelProbabilities, parseGroups } from './chi-square.ts';
import { signedRankDistribution, rankSumDistribution, rankInference } from './ranks.ts';
import { initialIntervals, initialTests, initialMeans, initialChi, initialRanks, validateIntervals, validateTests, validateMeans, validateChi, validateRanks } from './state.ts';
const close = (actual: number, expected: number, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

test('known sigma CI uses population sigma, and raw data changes center and n only', () => {
  const r = interval({ ...initialIntervals, center: 100, sd: 15, n: 100 });
  close(r.low, 97.0600540231899); close(r.high, 102.9399459768101); close(r.se, 1.5);
  const raw = interval({ ...initialIntervals, source: 'raw', sample: '1 3 5 7', sd: 10 });
  close(raw.center, 4); close(raw.se, 5);
});
test('known normal sigma CI and width planning allow n=1; unknown variance does not', () => {
  const state = { ...initialIntervals, n: 1, successes: 1, center: 7, sd: 2 };
  const r = interval(state); close(r.se, 2); close(r.low, 3.0800720309199); close(r.high, 10.9199279690801);
  const raw = interval({ ...state, source: 'raw', sample: '7' }); close(raw.low, r.low); close(raw.high, r.high);
  assert.throws(() => interval({ ...state, method: 't' }), /n≥2/);
  assert.throws(() => interval({ ...state, source: 'raw', sample: '7', method: 't' }), /2–200/);
  const plan = minimumNormalSampleSize(2, .95, 10); assert.equal(plan.n, 1); assert.equal(plan.previousWidth, undefined);
  assert.equal(minimumNormalSampleSize(2, .95, 10, 2).n, 2);
  assert.equal(normalCoverage(.95, 1, 2, 1).length, 50);
  assert.ok(validateIntervals(state)); assert.ok(!validateIntervals({ ...state, method: 't' }));
});
test('paired and pooled t use the correct variance and degrees of freedom', () => {
  const paired = interval({ ...initialIntervals, method: 'paired', sample: '3 7 11', sample2: '1 3 5' });
  close(paired.center, 4); close(paired.se, 2 / Math.sqrt(3)); assert.equal(paired.df, 2);
  const pooled = interval({ ...initialIntervals, method: 'pooled', source: 'raw', sample: '5 6 7', sample2: '1 2 3 4' });
  close(pooled.pooledVariance!, 1.4); close(pooled.se, Math.sqrt(49 / 60)); close(pooled.center, 3.5); assert.equal(pooled.df, 5);
  assert.throws(() => interval({ ...initialIntervals, method: 'paired', sample: '1 2', sample2: '1 2 3' }), /配对/);
});
test('proportion CI retains out-of-domain limits and warns, no silent truncation', () => {
  const r = interval({ ...initialIntervals, method: 'proportion', n: 10, successes: 1 });
  assert.ok(r.low < 0); assert.ok(r.warnings.some(w => w.includes('[0,1]'))); assert.ok(r.warnings.some(w => w.includes('不足')));
  assert.throws(() => interval({ ...initialIntervals, method: 'proportion', successes: 100 }), /成功/);
});
test('width planning verifies smallest neighboring integer for z and t', () => {
  const z = minimumNormalSampleSize(3, .95, 2); assert.equal(z.n, 35); assert.ok(z.width <= 2 && z.previousWidth! > 2);
  for (const pooled of [false, true]) { const t = minimumTSampleSize(3, .95, 2, pooled); assert.ok(t.width <= 2 && t.previousWidth! > 2); }
  assert.throws(() => minimumNormalSampleSize(0, .95, 2));
});
test('inverse CI recovers center, standard error, confidence and reproducible coverage', () => {
  const r = invertInterval(-1.95996398454005, 1.95996398454005, .95, 1);
  close(r.center, 0); close(r.inferredSe, 1); close(r.inferredLevel, .95);
  const a = normalCoverage(.95, 36, 3, 123), b = normalCoverage(.95, 36, 3, 123);
  assert.deepEqual(a, b); assert.equal(a.length, 50); assert.ok(a.every(r => r.covers === (r.low <= 0 && r.high >= 0)));
});
test('discrete mass functions preserve total and moments near boundaries', () => {
  for (const p of [0, .0001, .4, .9999, 1]) { const masses = binomialMass(100, p); close(sum(masses), 1, 1e-11); close(sum(masses.map((p, k) => p * k)), 100 * p, 1e-8); }
  for (const lambda of [.01, 1, 50, 200]) { const masses = poissonMass(lambda); close(sum(masses), 1, 1e-11); close(sum(masses.map((p, k) => p * k)), lambda, 1e-8); }
});
test('binomial critical rule and beta keep one null rejection region', () => {
  const r = discreteTest({ ...initialTests, n: 20, p0: .5, p1: .75, observed: 15 });
  assert.equal(r.upper, 15); assert.equal(r.lower, -1); close(r.actualAlpha, 21700 / 1048576); assert.ok(r.upperPrevious! > .05);
  const changed = discreteTest({ ...initialTests, n: 20, p0: .5, p1: .9, observed: 15 });
  assert.equal(changed.upper, r.upper); close(changed.actualAlpha, r.actualAlpha); assert.ok(changed.power > r.power); close(r.power + r.beta, 1);
});
test('equal-tail discrete test uses explicit alpha/2 and matching p values', () => {
  const r = discreteTest({ ...initialTests, n: 10, p0: .5, p1: .7, observed: 9, tail: 'two' });
  assert.equal(r.lower, 1); assert.equal(r.upper, 9); close(r.actualAlpha, 22 / 1024); close(r.pValue, 22 / 1024); assert.equal(r.reject, true);
  const tiny = criticalRegion(binomialMass(2, .5), 'two', .05); assert.equal(tiny.actualAlpha, 0); assert.equal(tiny.upper, Infinity);
});
test('Poisson threshold and alternative acceptance probability agree with finite sums', () => {
  const r = discreteTest({ ...initialTests, model: 'poisson', lambda0: 1, lambda1: 2, observed: 4 });
  assert.equal(r.upper, 4); close(r.actualAlpha, 1 - Math.exp(-1) * (1 + 1 + .5 + 1 / 6)); close(r.beta, Math.exp(-2) * (1 + 2 + 2 + 8 / 6));
});
test('z power, parameter inversion and p-value interval preserve the tail rule', () => {
  const z = zTest({ mean0: 0, mean1: 2, observed: 2, se: 1, alpha: .05, tail: 'upper' }); close(z.power, .638759968687665, 1e-7);
  close(zTest({ mean0: 0, mean1: 0, observed: 0, se: 1, alpha: .05, tail: 'two' }).power, .05);
  close(invertDiscreteBoundary('binomial', 20, 15, 21700 / 1048576, 'upper').parameter, .5);
  close(invertDiscreteBoundary('poisson', 20, 4, 1 - Math.exp(-1) * 8 / 3, 'upper').parameter, 1);
  assert.deepEqual(compatiblePRange(.05, .01), { lowerExclusive: .01, upperInclusive: .05 });
  assert.throws(() => invertDiscreteBoundary('binomial', 20, 0, .05, 'upper'));
});
test('mean method selector enforces design assumptions and CI/test duality', () => {
  const r = meanInference(initialMeans); assert.equal(r.method, '单样本 t'); assert.equal(r.df, 7); assert.equal(r.reject, !r.nullInside);
  const inside = meanInference({ ...initialMeans, nullValue: r.estimate }); assert.equal(inside.reject, false); assert.equal(inside.nullInside, true);
  assert.throws(() => meanInference({ ...initialMeans, normal: false }), /大样本/);
  assert.throws(() => meanInference({ ...initialMeans, design: 'independent', equalVariance: false }), /共同方差/);
  assert.throws(() => meanInference({ ...initialMeans, design: 'paired', normal: false }), /差值总体正态/);
  const paired = meanInference({ ...initialMeans, design: 'paired', sample: '3 7 11', sample2: '1 3 5' }); close(paired.estimate, 4); close(paired.se, 2 / Math.sqrt(3));
});
test('independent large-sample mean difference adds separate variance contributions', () => {
  const values = Array.from({ length: 30 }, (_, i) => i + 1);
  const r = meanInference({ ...initialMeans, design: 'independent', normal: false, large: true, equalVariance: false, sample: values.join(' '), sample2: values.map(x => x * 2).join(' ') });
  close(r.estimate, -15.5); close(r.se ** 2, (77.5 + 310) / 30); assert.equal(r.df, undefined);
});
test('GOF gives known chi-square statistic and blocks invalid expected counts', () => {
  const r = goodnessOfFit({ ...initialChi, observed: '10 30', probabilities: '.5 .5' }); close(r.statistic, 10); assert.equal(r.df, 1); close(r.pValue!, .00156540225800255, 1e-11); assert.equal(r.reject, true);
  const sparse = goodnessOfFit({ ...initialChi, observed: '1 3', probabilities: '.5 .5' }); assert.equal(sparse.valid, false); assert.equal(sparse.reject, undefined);
  assert.throws(() => goodnessOfFit({ ...initialChi, observed: '1 3', probabilities: '0 1' }), /零概率/);
});
test('GOF merges observed and expected before computing contributions and degrees of freedom', () => {
  const r = goodnessOfFit({ ...initialChi, observed: '8 12 40 40', probabilities: '.1 .2 .3 .4', groups: '1,2|3|4', parameterSource: 'sample', estimatedCount: 1 });
  assert.equal(r.rows[0].observed, 20); close(r.rows[0].expected, 30); close(r.rows[0].contribution, 10 / 3); close(r.statistic, 20 / 3); assert.equal(r.df, 1);
  assert.notEqual(r.rows[0].contribution, .4 + 3.2);
  assert.throws(() => parseGroups('1,3|2|4', 4)); assert.throws(() => parseGroups('1|2|2|4', 4));
});
test('supported GOF models include all tail groups without normalization', () => {
  const p = modelProbabilities({ ...initialChi, model: 'poisson', lambda: 1, cutoffs: '0 1' }); close(p.probabilities[0], Math.exp(-1)); close(p.probabilities[2], 1 - 2 / Math.E); close(sum(p.probabilities), 1);
  const normal = modelProbabilities({ ...initialChi, model: 'normal', mu: 0, sigma: 1, cutoffs: '-1 0 1' }); close(normal.probabilities[0], .158655253931457); close(sum(normal.probabilities), 1);
  const exp = modelProbabilities({ ...initialChi, model: 'exponential', rate: 2, cutoffs: '1 2' }); close(exp.probabilities[2], Math.exp(-4));
  assert.throws(() => modelProbabilities({ ...initialChi, probabilities: '.3 .3' }), /总和/);
});
test('raw Poisson fitting generates O and E from one sample and automatically subtracts one parameter', () => {
  const rawSample = Array.from({ length: 10 }, () => [0, 1, 1, 2, 2, 3, 3, 4]).flat().join(' ');
  const r = goodnessOfFit({ ...initialChi, model: 'poisson', parameterSource: 'sample', fitMode: 'raw', rawSample, cutoffs: '0 1 2', estimatedCount: 1, observed: '999 888', lambda: 99 });
  close(r.fit!.state.lambda, 2); assert.deepEqual(r.originalObserved, [10, 20, 20, 30]); assert.equal(r.total, 80); assert.equal(r.estimated, 1); assert.equal(r.df, 2); assert.equal(r.valid, true);
  const expected = [80 * Math.exp(-2), 160 * Math.exp(-2), 160 * Math.exp(-2), 80 * (1 - 5 * Math.exp(-2))];
  expected.forEach((e, i) => close(r.originalExpected[i], e)); close(sum(r.originalExpected), 80);
  close(r.statistic, [10, 20, 20, 30].reduce((s, o, i) => s + (o - expected[i]) ** 2 / expected[i], 0));
});
test('raw fixed-n binomial fitting matches a rational anchor and accounts for one estimated p', () => {
  const rawSample = Array.from({ length: 20 }, () => [0, 1, 1, 2, 2, 3, 3, 4]).flat().join(' ');
  const r = goodnessOfFit({ ...initialChi, model: 'binomial', parameterSource: 'sample', fitMode: 'raw', rawSample, cutoffs: '0 1 2 3', trials: 4, probability: .99, estimatedCount: 1 });
  close(r.fit!.state.probability, .5); assert.deepEqual(r.originalObserved, [20, 40, 40, 40, 20]);
  [10, 40, 60, 40, 10].forEach((e, i) => close(r.originalExpected[i], e)); close(r.statistic, 80 / 3); assert.equal(r.df, 3); assert.equal(r.estimated, 1); assert.equal(r.valid, true);
});
test('raw normal fit uses MLE variance N, includes both tails and automatically subtracts two parameters', () => {
  const rawSample = Array.from({ length: 20 }, () => [-3, -1, 1, 3]).flat().join(' ');
  const r = goodnessOfFit({ ...initialChi, model: 'normal', parameterSource: 'sample', fitMode: 'raw', rawSample, cutoffs: '-2 0 2', estimatedCount: 1, mu: 99, sigma: 99 });
  close(r.fit!.state.mu, 0); close(r.fit!.state.sigma, Math.sqrt(5)); assert.deepEqual(r.originalObserved, [20, 20, 20, 20]);
  close(r.originalExpected[0], 80 * .185546684761348, 1e-9); close(r.originalExpected[3], r.originalExpected[0]); close(sum(r.originalExpected), 80);
  assert.equal(r.estimated, 2); assert.equal(r.df, 1); assert.equal(r.valid, true);
  const merged = goodnessOfFit({ ...initialChi, model: 'normal', parameterSource: 'sample', fitMode: 'raw', rawSample, cutoffs: '-2 0 2', estimatedCount: 2, groups: '1,2|3|4' });
  assert.equal(merged.df, 0); assert.equal(merged.reject, undefined);
});
test('automatic fitting uses actual values in open tails and refuses incompatible or degenerate data', () => {
  const base = { ...initialChi, model: 'poisson' as const, parameterSource: 'sample' as const, fitMode: 'raw' as const, estimatedCount: 1, cutoffs: '0 1 2' };
  const first = fitRawModel({ ...base, rawSample: '0 1 2 3 40' }), second = fitRawModel({ ...base, rawSample: '0 1 2 3 80' });
  assert.deepEqual(first.observed, second.observed); close(first.state.lambda, 9.2); close(second.state.lambda, 17.2);
  assert.throws(() => fitRawModel({ ...base, rawSample: '0 0 0' }), /边界估计/);
  assert.throws(() => fitRawModel({ ...base, rawSample: '0 1.5 2' }), /非负整数/);
  assert.throws(() => fitRawModel({ ...base, model: 'binomial', trials: 2, rawSample: '0 1 3' }), /给定 n/);
  assert.throws(() => fitRawModel({ ...base, model: 'normal', rawSample: '3 3 3' }), /正方差/);
  assert.throws(() => fitRawModel({ ...base, model: 'given', rawSample: '1 2 3' }), /支持/);
});
test('contingency expected counts, scale exploration, legal row merges and df are recomputed', () => {
  const state = { ...initialChi, table: '10 20\n20 10' };
  const r = independence(state); assert.deepEqual(r.expected, [[15, 15], [15, 15]]); close(r.statistic, 20 / 3); assert.equal(r.df, 1);
  close(independence({ ...state, scale: 3 }).statistic, 20);
  const merged = independence({ ...state, rowGroups: '1,2' }); assert.equal(merged.df, 0); assert.equal(merged.reject, undefined); assert.deepEqual(merged.expected, [[30, 30]]);
  assert.throws(() => independence({ ...state, table: '0 0\n1 2' }), /边际/);
});
test('signed-rank and rank-sum exact distributions agree with independent enumeration', () => {
  assert.deepEqual(signedRankDistribution(3), [1, 1, 1, 2, 1, 1, 1].map(x => x / 8));
  const r = rankSumDistribution(2, 2); assert.deepEqual(r, [0, 0, 0, 1, 1, 2, 1, 1].map(x => x / 6));
  close(sum(signedRankDistribution(25)), 1); close(sum(rankSumDistribution(20, 20)), 1, 1e-12);
});
test('rank-sum preserves group identity and distinguishes reverse sum from other group', () => {
  const r = rankInference({ ...initialRanks, design: 'independent', method: 'ranksum', sample: '1 5', sample2: '2 3 4', median: 0 });
  assert.equal(r.statistic, 6); assert.equal(r.reverseSum, 6); assert.equal(r.otherGroupSum, 9); close(r.expected, 6); close(r.variance, 3);
  assert.deepEqual(r.rows.filter(row => row.group === 'A').map(row => row.rank), [1, 5]);
});
test('sign and signed-rank tail direction and continuity corrections match event definitions', () => {
  const state = { ...initialRanks, method: 'sign' as const, sample: '1 2 3 4 -1', median: 0, tail: 'upper' as const };
  const exact = rankInference(state); close(exact.pValue, 6 / 32); assert.equal(exact.statistic, 4);
  const approx = rankInference({ ...state, approximation: 'normal' }); close(approx.pValue, normalSf((4 - .5 - 2.5) / Math.sqrt(1.25)));
  const signed = rankInference(initialRanks); assert.equal(signed.statistic + signed.negativeSum!, 36); assert.equal(signed.statistic, 32);
});
test('FS rank modes reject zeros, tied ranks, false pairing and retain sign repetitions', () => {
  assert.throws(() => rankInference({ ...initialRanks, sample: '10 11 12' }), /零配对差/);
  assert.throws(() => rankInference({ ...initialRanks, sample: '8 12 13' }), /并列秩/);
  assert.throws(() => rankInference({ ...initialRanks, design: 'independent', method: 'ranksum', sample: '1 2', sample2: '2 3', median: 0 }), /并列值/);
  assert.throws(() => rankInference({ ...initialRanks, design: 'paired', sample: '1 2', sample2: '1 2 3' }), /等长/);
  assert.doesNotThrow(() => rankInference({ ...initialRanks, method: 'sign', sample: '1 1 -1', median: 0 }));
});
test('validators strictly reject malformed shapes, nonfinite fields, unsupported enums and ranges', () => {
  const cases = [[initialIntervals, validateIntervals], [initialTests, validateTests], [initialMeans, validateMeans], [initialChi, validateChi], [initialRanks, validateRanks]] as const;
  for (const [state, validate] of cases) { assert.ok(validate(state)); assert.ok(!validate(null)); assert.ok(!validate({ ...state, unexpected: 1 })); assert.ok(!validate({})); }
  assert.ok(!validateIntervals({ ...initialIntervals, n: 2.5 })); assert.ok(!validateIntervals({ ...initialIntervals, level: Infinity }));
  assert.ok(!validateTests({ ...initialTests, observed: 100 })); assert.ok(!validateTests({ ...initialTests, tail: 'both' }));
  assert.ok(!validateMeans({ ...initialMeans, sample: '1 2 NaN' })); assert.ok(!validateMeans({ ...initialMeans, known: 1 }));
  assert.ok(!validateChi({ ...initialChi, parameterSource: 'given', estimatedCount: 1 }));
  const { fitMode: _fitMode, rawSample: _rawSample, ...legacyChi } = initialChi;
  assert.ok(validateChi(legacyChi)); assert.ok(!validateChi({ ...initialChi, fitMode: 'unknown' })); assert.ok(!validateChi({ ...initialChi, rawSample: null })); assert.ok(!validateChi({ ...initialChi, rawSample: '1 NaN' }));
  assert.ok(!validateChi({ ...initialChi, model: 'given', parameterSource: 'sample', estimatedCount: 1, fitMode: 'raw' }));
  assert.ok(!validateRanks({ ...initialRanks, design: 'independent', method: 'sign' }));
});
