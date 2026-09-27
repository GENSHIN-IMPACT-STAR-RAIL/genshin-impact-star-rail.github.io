import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalQuantile,
  normalCdf,
  tQuantile,
  tCdf,
  tSf,
  chiSquareQuantile,
  chiSquareSf,
  chiSquareCdf,
  parseNumbers,
  mean,
  sampleVariance,
  populationVariance,
  logGamma,
} from "./math.ts";
const close = (actual: number, expected: number, error = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= error, `${actual} vs ${expected}`);
test("normal inverse and tail round trips including 1e-12", () => {
  close(normalQuantile(0.975), 1.959963984540054);
  for (const p of [1e-12, 0.001, 0.05, 0.5, 0.95, 0.999])
    close(normalCdf(normalQuantile(p)), p, 1e-12);
});
test("t distribution independent Cauchy identity and table anchors", () => {
  for (const x of [-10, -1, 0, 1, 10])
    close(tCdf(x, 1), 0.5 + Math.atan(x) / Math.PI);
  close(tQuantile(0.975, 10), 2.2281388519649385);
  close(tQuantile(0.95, 20), 1.7247182429207857);
  close(tSf(0, 10), 0.5);
  for (const df of [1, 2, 10, 200])
    for (const p of [0.001, 0.1, 0.9, 0.999])
      close(tCdf(tQuantile(p, df), df), p);
});
test("chi-square distribution anchors, exponential identity and stable tails", () => {
  close(chiSquareQuantile(0.95, 1), 3.841458820694124);
  close(chiSquareQuantile(0.95, 10), 18.307038053275146);
  for (const x of [0, 0.1, 2, 10, 100])
    close(chiSquareSf(x, 2), Math.exp(-x / 2), 1e-12);
  close(chiSquareSf(100, 2) / Math.exp(-50), 1, 1e-10);
  for (const df of [1, 3, 10, 100])
    for (const p of [0.01, 0.5, 0.99])
      close(chiSquareCdf(chiSquareQuantile(p, df), df), p);
});
test("stable sample moments and explicit input parser", () => {
  close(mean([1, 2, 3]), 2);
  close(sampleVariance([1, 2, 3]), 1);
  close(populationVariance([1, 2, 3]), 2 / 3);
  close(sampleVariance([1e12 + 1, 1e12 + 2, 1e12 + 3]), 1);
  assert.deepEqual(parseNumbers("1/2，2; -3e-1\n4"), [0.5, 2, -0.3, 4]);
  for (const text of ["", "2oops", "1/0", "Infinity", "1 2 x"])
    assert.throws(() => parseNumbers(text));
  assert.throws(() => sampleVariance([1]));
  close(logGamma(6), Math.log(120));
});
