import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseMasses,
  binomialMasses,
  countProbability,
  countMoments,
  displayMasses,
  countQuantile,
  poissonPmf,
  poissonCdf,
  poissonTail,
  moments,
  affine,
  convolve,
  transformMasses,
  binomialFromMoments,
  minSuccessTrials,
  parseSegments,
  densityArea,
  validateDensity,
  densityCdf,
  densityMoment,
  densityQuantile,
  transformedCdf,
  transformedPdf,
  iidSquareRoot,
} from "./model.ts";
import {
  eventProbability,
  eventBounds,
  normalFromQuantiles,
  normalInterval,
  poissonWindow,
  poissonWindowForCdf,
  seededPoissonSamples,
  seededPoissonWindow,
  normalMarkerPatch,
  continuousMarkerPatch,
} from "./tasks.ts";
import {
  exactMasses,
  exactConvolve,
  exactAffine,
  polynomialText,
  rationalText,
} from "./exact.ts";
import * as states from "./state.ts";
const near = (actual: number, expected: number, tolerance = 1e-11) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} ≉ ${expected}`,
  );
test("binomial anchors, degeneracy and exact strict event boundaries", () => {
  near(
    countProbability({ kind: "binomial", n: 10, p: 0.5 }, 9, Infinity),
    11 / 1024,
  );
  assert.deepEqual(binomialMasses(0, 0.3), [{ x: 0, y: 1 }]);
  near(countMoments({ kind: "binomial", n: 10, p: 0.4 }).variance, 2.4);
  near(
    eventProbability({ kind: "binomial", n: 10, p: 0.5 }, "gt", 8.2, 0),
    11 / 1024,
  );
  assert.deepEqual(eventBounds("gt", 8, 0), [9, Infinity]);
  assert.deepEqual(eventBounds("lt", 8.3, 0), [-Infinity, 8]);
  near(
    eventProbability({ kind: "binomial", n: 10, p: 0.5 }, "equal", 2.5, 0),
    0,
  );
  assert.equal(countQuantile({ kind: "binomial", n: 10, p: 1 }, 0), 10);
});
test("geometric convention, quantile at jump and retained infinite tail", () => {
  const model = { kind: "geometric" as const, p: 0.2 };
  near(countProbability(model, 5, Infinity), 0.4096);
  near(countMoments(model).mean, 5);
  near(countMoments(model).variance, 20);
  assert.equal(countQuantile(model, 0.488), 3);
  assert.equal(countQuantile(model, 1), Infinity);
  assert.equal(countQuantile({ kind: "geometric", p: 1 }, 1), 1);
  const view = displayMasses({ kind: "geometric", p: 0.00001 });
  assert.ok(view.tail > 0.99);
  near(view.masses.reduce((sum, p) => sum + p.y, 0) + view.tail, 1);
});
test("Poisson exact anchors, upper tail, degenerate and large rate", () => {
  near(poissonPmf(0, 3), Math.exp(-3));
  near(poissonCdf(1, 3), 4 * Math.exp(-3));
  near(poissonTail(2, 3), 1 - 4 * Math.exp(-3));
  assert.equal(poissonTail(1, 0), 0);
  assert.equal(poissonCdf(0, 0), 1);
  assert.equal(countQuantile({ kind: "poisson", lambda: 0 }, 1), 0);
  const large = displayMasses({ kind: "poisson", lambda: 1000 });
  near(large.masses.reduce((sum, p) => sum + p.y, 0) + large.tail, 1, 1e-10);
  // Independent anchor: 80-digit Decimal exp(-3) * sum(3**k/k!, k=50..199).
  assert.ok(poissonTail(50, 3) > 0);
  near(
    poissonTail(50, 3),
    1.248535487154192883806556018852914192855e-42,
    1e-54,
  );
});
test("moment and probability inverse tasks have admissibility and neighbouring checks", () => {
  const solved = binomialFromMoments(4, 2.4);
  assert.equal(solved.n, 10);
  near(solved.p, 0.4);
  assert.throws(() => binomialFromMoments(0, 0));
  assert.throws(() => binomialFromMoments(3, 3));
  assert.throws(() => binomialFromMoments(3, 1));
  const trials = minSuccessTrials(0.2, 0.95);
  assert.equal(trials.n, 14);
  assert.ok(trials.at >= 0.95 && trials.before < 0.95);
});
test("normal quantile pair, incompatible conditions and stable remote interval", () => {
  const result = normalFromQuantiles(
    8,
    0.15865525393145707,
    12,
    0.8413447460685429,
  );
  near(result.mean, 10);
  near(result.sd, 2, 1e-8);
  assert.ok(result.residual < 1e-12);
  assert.throws(() => normalFromQuantiles(1, 0.5, 2, 0.5));
  assert.throws(() => normalFromQuantiles(2, 0.2, 1, 0.8));
  near(normalInterval(10, 2, -Infinity, 12), 0.8413447460685429, 1e-9);
  near(normalInterval(0, 1, 8, 9), 6.21983198586583e-16, 1e-22);
});
test("Poisson dimensional scale and inverse observation window", () => {
  const p = states.poissonInitial;
  near(
    poissonWindow({
      ...p,
      rate: 3,
      window: 60,
      rateUnit: "minute",
      windowUnit: "second",
    }).lambda,
    3,
  );
  near(
    poissonWindow({
      ...p,
      rate: 3,
      window: 1,
      rateUnit: "minute",
      windowUnit: "hour",
    }).lambda,
    180,
  );
  assert.throws(() =>
    poissonWindow({ ...p, rateUnit: "metre", windowUnit: "minute" }),
  );
  near(
    poissonWindow({
      ...p,
      rate: 3,
      window: 50,
      rateUnit: "metre",
      windowUnit: "centimetre",
    }).lambda,
    1.5,
  );
  near(
    poissonWindow({
      ...p,
      rate: 2,
      window: 100,
      rateUnit: "squareMetre",
      windowUnit: "squareCentimetre",
    }).lambda,
    0.02,
  );
  const inverse = poissonWindowForCdf(0, Math.exp(-3), 3);
  near(inverse.lambda, 3);
  near(inverse.window, 1);
  assert.ok(inverse.residual < 1e-12);
  assert.deepEqual(seededPoissonSamples(0, 4), [0, 0, 0, 0]);
  assert.deepEqual(
    seededPoissonSamples(3, 4, 42),
    seededPoissonSamples(3, 4, 42),
  );
  const positions = seededPoissonWindow(3, 42);
  assert.equal(positions.length, seededPoissonSamples(3, 1, 42)[0]);
  assert.ok(
    positions.every(
      (x, i) => x > 0 && x <= 1 && (i === 0 || x > positions[i - 1]),
    ),
  );
});
test("same dice vs independent dice and multi-to-one transformations", () => {
  const die = parseMasses(
      Array.from({ length: 6 }, (_, i) => `${i + 1}, 1/6`).join("\n"),
    ),
    double = affine(die, 2, 0),
    sum = convolve(die, die);
  near(moments(double).mean, 7);
  near(moments(sum).mean, 7);
  near(moments(double).variance, 35 / 3);
  near(moments(sum).variance, 35 / 6);
  assert.deepEqual(
    double.map((p) => p.x),
    [2, 4, 6, 8, 10, 12],
  );
  near(sum.find((p) => p.x === 7)!.y, 1 / 6);
  assert.deepEqual(
    transformMasses(parseMasses("-1, 1/4\n1, 3/4"), (x) => x * x),
    [{ x: 1, y: 1 }],
  );
  assert.throws(() => parseMasses("0, 0.3\n1, 0.3"));
  assert.throws(() => parseMasses("0, -0.1\n1, 1.1"));
});
test("linear and piecewise PDF integrals, CDF continuity and quantiles", () => {
  const d = {
    kind: "polynomial" as const,
    segments: parseSegments("0, 1, 0, 2"),
  };
  validateDensity(d);
  near(densityCdf(d, 0.5), 0.25);
  near(densityMoment(d, 1), 2 / 3);
  near(densityMoment(d, 2) - (2 / 3) ** 2, 1 / 18);
  near(densityQuantile(d, 0.5), 1 / Math.sqrt(2));
  const triangular = {
    kind: "polynomial" as const,
    segments: parseSegments("0, 1, 0, 1\n1, 2, 2, -1"),
  };
  near(densityArea(triangular), 1);
  near(densityCdf(triangular, 1), 0.5);
  near(densityMoment(triangular, 1), 1);
  near(densityMoment(triangular, 2) - 1, 1 / 6);
  near(
    densityCdf(triangular, 1 + 1e-8) - densityCdf(triangular, 1 - 1e-8),
    2e-8,
    1e-14,
  );
  const unnormalised = {
    kind: "polynomial" as const,
    segments: parseSegments("0, 1, 2"),
  };
  assert.throws(() => validateDensity(unnormalised));
  assert.throws(() => parseSegments("-1, 1, -0.1, 0, 1"));
  assert.throws(() => parseSegments("0, 2, 1\n1, 3, 1"));
});
test("two square preimages and affine direction reversal", () => {
  const d = {
    kind: "polynomial" as const,
    segments: parseSegments("-1, 1, 0.5"),
  };
  near(transformedCdf(d, 0.25, "square"), 0.5);
  near(transformedPdf(d, 0.25, "square"), 1);
  near(transformedCdf(d, 0.25, "absolute"), 0.25);
  near(transformedCdf(d, 0.5, "affine", -2, 1), 0.375);
  assert.equal(transformedCdf(d, 1, "affine", 0, 2), 0);
  assert.equal(transformedCdf(d, 2, "affine", 0, 2), 1);
  const exponential = { kind: "exponential" as const, rate: 2 };
  near(densityMoment(exponential, 2), 0.5);
  near(densityQuantile(exponential, 0.5), Math.log(2) / 2);
  assert.equal(densityQuantile(exponential, 1), Infinity);
});
test("exact rational PGF coefficients and independently verified inverse convolution", () => {
  const fair = exactMasses("0, 1/2\n1, 1/2"),
    sum = exactConvolve(fair),
    double = exactAffine(fair, 2, 0);
  assert.deepEqual(
    sum.map((p) => rationalText(p.p)),
    ["1/4", "1/2", "1/4"],
  );
  assert.deepEqual(
    double.map((p) => p.x),
    [0, 2],
  );
  assert.equal(polynomialText(fair, 1), "1/2");
  assert.equal(polynomialText(fair, 2), "0");
  assert.equal(
    polynomialText(exactMasses("-1, 1/4\n0, 1/2\n1, 1/4"), 1),
    "-1/4·t^(-2) + 1/4",
  );
  const recovered = iidSquareRoot(parseMasses("0, 1/4\n1, 1/2\n2, 1/4", true));
  assert.deepEqual(recovered, [
    { x: 0, y: 0.5 },
    { x: 1, y: 0.5 },
  ]);
  assert.throws(() =>
    iidSquareRoot(parseMasses("0, 1/10\n1, 4/5\n2, 1/10", true)),
  );
  assert.throws(() => iidSquareRoot(parseMasses("1, 1", true)));
});
test("all initial states validate; hostile shapes and numeric domains reject", () => {
  for (const [initial, validate] of [
    [states.discreteInitial, states.validateDiscrete],
    [states.normalInitial, states.validateNormal],
    [states.poissonInitial, states.validatePoisson],
    [states.combinationInitial, states.validateCombination],
    [states.continuousInitial, states.validateContinuous],
    [states.pgfInitial, states.validatePgf],
  ] as const) {
    assert.equal(validate(initial), true);
    assert.equal(validate(null), false);
    assert.equal(validate({ ...initial, extra: true }), false);
    assert.equal(validate([]), false);
  }
  assert.equal(
    states.validateDiscrete({ ...states.discreteInitial, n: 2.5 }),
    false,
  );
  assert.equal(
    states.validateNormal({ ...states.normalInitial, scale: 0 }),
    false,
  );
  assert.equal(
    states.validatePoisson({ ...states.poissonInitial, rate: NaN }),
    false,
  );
  assert.equal(
    states.validateContinuous({
      ...states.continuousInitial,
      segments: "x".repeat(8001),
    }),
    false,
  );
  assert.equal(states.validatePgf({ ...states.pgfInitial, a: 1.5 }), false);
  assert.equal(
    states.validateDiscrete({
      ...states.discreteInitial,
      kind: "geometric",
      p: 0,
    }),
    false,
  );
  assert.equal(
    states.validateCombination({
      ...states.combinationInitial,
      kind: "normal",
      operation: "square",
    }),
    false,
  );
  assert.equal(
    states.validateNormal({
      ...states.normalInitial,
      scaleKind: "variance",
      scale: 1e12,
    }),
    true,
  );
});
test("plot marker edits preserve ordered bounds, unbounded cursor meaning and saved domains", () => {
  const normal = states.normalInitial;
  assert.deepEqual(normalMarkerPatch(normal, 0, 50), { low: normal.high });
  assert.deepEqual(normalMarkerPatch(normal, 1, -50), { high: normal.low });
  assert.deepEqual(normalMarkerPatch({ ...normal, event: "left" }, 0, 50), {
    low: 50,
  });
  assert.deepEqual(normalMarkerPatch({ ...normal, event: "right" }, 0, 2e6), {
    low: 1e6,
  });
  assert.deepEqual(
    normalMarkerPatch({ ...normal, event: "central" }, 0, 3),
    {},
  );
  assert.deepEqual(normalMarkerPatch(normal, 0, NaN), {});
  const continuous = states.continuousInitial;
  const upperPatch = continuousMarkerPatch(continuous, 1, -10);
  assert.deepEqual(upperPatch, { high: continuous.low });
  assert.deepEqual(continuousMarkerPatch(continuous, 0, 10), {
    low: continuous.high,
  });
  assert.deepEqual(continuousMarkerPatch(continuous, 2, -2), { cursor: -2 });
  assert.deepEqual(continuousMarkerPatch(continuous, 2, 2e6), { cursor: 1e6 });
  assert.equal(
    states.validateContinuous({ ...continuous, ...upperPatch }),
    true,
  );
  const shifted = { ...normal, ...normalMarkerPatch(normal, 0, 10) };
  near(
    normalInterval(shifted.mean, shifted.scale, shifted.low, shifted.high),
    0.3413447460685429,
    1e-9,
  );
});
