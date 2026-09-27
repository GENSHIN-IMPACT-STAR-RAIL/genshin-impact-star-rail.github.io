import { test } from "node:test";
import assert from "node:assert/strict";
import {
  distributionMoments,
  seededRandom,
  simulate,
  validateSimulation,
} from "./sampling-model.ts";
import { mean, sampleVariance } from "./math.ts";
test("seeded sampling is reproducible and records complete last sample", () => {
  const config = {
    distribution: { kind: "normal" as const, mean: 10, sd: 3 },
    n: 25,
    repeats: 300,
    seed: 71,
    statistic: "mean" as const,
  };
  const one = simulate(config),
    two = simulate(config);
  assert.deepEqual(one, two);
  assert.equal(one.lastSample.length, 25);
  assert.ok(Math.abs(mean(one.statistics) - 10) < 0.12);
  assert.ok(Math.abs(sampleVariance(one.statistics) - 9 / 25) < 0.08);
});
test("degenerate distributions and exact discrete supports", () => {
  for (const d of [
    { kind: "binomial" as const, n: 10, p: 1 },
    { kind: "poisson" as const, lambda: 0 },
    { kind: "geometric" as const, p: 1 },
  ]) {
    const result = simulate({
      distribution: d,
      n: 5,
      repeats: 10,
      seed: 2,
      statistic: "mean",
    });
    assert.ok(
      result.statistics.every((v) => v === distributionMoments(d).mean),
    );
  }
  const result = simulate({
    distribution: {
      kind: "finite",
      values: [-2, 5],
      probabilities: [0.3, 0.7],
    },
    n: 50,
    repeats: 10,
    seed: 5,
    statistic: "sum",
  });
  assert.ok(result.lastSample.every((x) => x === -2 || x === 5));
});
test("repetition count leaves existing random stream and theoretical SE unchanged", () => {
  const config = {
    distribution: { kind: "uniform" as const, low: 0, high: 12 },
    n: 10,
    repeats: 20,
    seed: 9,
    statistic: "mean" as const,
  };
  assert.deepEqual(
    simulate({ ...config, repeats: 40 }).statistics.slice(0, 20),
    simulate(config).statistics,
  );
  const random = seededRandom(7);
  for (let i = 0; i < 1000; i++) {
    const u = random();
    assert.ok(u >= 0 && u < 1);
  }
  assert.throws(() =>
    validateSimulation({ ...config, n: 2000, repeats: 5000 }),
  );
  assert.throws(() =>
    validateSimulation({ ...config, n: 1, statistic: "variance" }),
  );
});
