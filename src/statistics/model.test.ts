import { test } from "node:test";
import assert from "node:assert/strict";
import {
  binomialMasses,
  binomialProbability,
  normalBounds,
  normalSurvival,
  normalInterval,
  DEFAULT_LAB,
  restoreLab,
  type CountEvent,
} from "./model.ts";
const close = (a: number, b: number, tolerance = 1e-11) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const event = (patch: Partial<CountEvent>): CountEvent => ({
  ...DEFAULT_LAB.event,
  ...patch,
});

test("binomial masses retain total, mean and variance at large n and extreme p", () => {
  for (const n of [1, 10, 40, 200])
    for (const p of [0, 0.00001, 0.2, 0.5, 0.99999, 1]) {
      const masses = binomialMasses(n, p);
      close(
        masses.reduce((s, x) => s + x, 0),
        1,
      );
      close(
        masses.reduce((s, x, k) => s + k * x, 0),
        n * p,
      );
      close(
        masses.reduce((s, x, k) => s + (k - n * p) ** 2 * x, 0),
        n * p * (1 - p),
      );
      assert.ok(masses.every((x) => x >= 0 && Number.isFinite(x)));
    }
});
test("point, open and closed tails and intervals select the correct integer masses", () => {
  const masses = binomialMasses(10, 0.5);
  close(binomialProbability(masses, event({ kind: "left", a: 2 })), 56 / 1024);
  close(
    binomialProbability(
      masses,
      event({ kind: "left", a: 2, includeUpper: false }),
    ),
    11 / 1024,
  );
  close(binomialProbability(masses, event({ kind: "right", a: 9 })), 11 / 1024);
  close(binomialProbability(masses, event({ kind: "point", a: 2 })), 45 / 1024);
  close(
    binomialProbability(
      masses,
      event({
        kind: "interval",
        a: 2,
        b: 3,
        includeLower: false,
        includeUpper: false,
      }),
    ),
    0,
  );
  for (let k = 0; k <= 10; k++)
    close(
      binomialProbability(masses, event({ kind: "left", a: k })) +
        binomialProbability(
          masses,
          event({ kind: "right", a: k, includeLower: false }),
        ),
      1,
    );
});
test("continuity correction follows all four inequality directions", () => {
  assert.deepEqual(normalBounds(event({ kind: "left", a: 5 }), true), [
    -Infinity,
    5.5,
  ]);
  assert.deepEqual(
    normalBounds(event({ kind: "left", a: 5, includeUpper: false }), true),
    [-Infinity, 4.5],
  );
  assert.deepEqual(normalBounds(event({ kind: "right", a: 5 }), true), [
    4.5,
    Infinity,
  ]);
  assert.deepEqual(
    normalBounds(event({ kind: "right", a: 5, includeLower: false }), true),
    [5.5, Infinity],
  );
  assert.deepEqual(
    normalBounds(
      event({ kind: "interval", a: 3, b: 7, includeLower: false }),
      true,
    ),
    [3.5, 7.5],
  );
  assert.deepEqual(
    normalBounds(event({ kind: "point", a: 5 }), true),
    [4.5, 5.5],
  );
  assert.deepEqual(normalBounds(event({ kind: "point", a: 5 }), false), [5, 5]);
});
test("normal tails agree with high precision anchors, including tiny upper tails", () => {
  close(normalSurvival(0), 0.5);
  close(normalSurvival(1), 0.15865525393145705);
  close(normalSurvival(-1.96), 0.9750021048517795);
  close(normalSurvival(8) / 6.220960574271784e-16, 1, 1e-9);
  close(normalSurvival(20) / 2.7536241186062337e-89, 1, 1e-9);
  assert.equal(normalSurvival(Infinity), 0);
  assert.equal(normalSurvival(-Infinity), 1);
});
test("normal interval avoids tail cancellation and handles empty/degenerate cases", () => {
  close(normalInterval(-Infinity, 12, 10, 2)!, 0.8413447460685429);
  close(normalInterval(-1, 1, 0, 1)!, 0.6826894921370859);
  close(normalInterval(8, 9, 0, 1)! / 6.21983198586583e-16, 1, 1e-9);
  assert.equal(normalInterval(4, 4, 5, 2), 0);
  assert.equal(normalInterval(4, 8, 5, 0), null);
  assert.equal(normalInterval(-Infinity, Infinity, 5, 2), 1);
});
test("saved lab round trips; corrupt, unsupported and inconsistent data is rejected", () => {
  assert.deepEqual(restoreLab(JSON.stringify(DEFAULT_LAB)), DEFAULT_LAB);
  for (const value of [
    null,
    {},
    { ...DEFAULT_LAB, n: 201 },
    { ...DEFAULT_LAB, p: null },
    { ...DEFAULT_LAB, event: { ...DEFAULT_LAB.event, a: 20, b: 3 } },
    { ...DEFAULT_LAB, correction: "false" },
    { ...DEFAULT_LAB, version: 2 },
  ])
    assert.equal(restoreLab(JSON.stringify(value)), null);
  assert.equal(restoreLab("broken"), null);
  assert.throws(() => binomialMasses(3.5, 0.4));
});
