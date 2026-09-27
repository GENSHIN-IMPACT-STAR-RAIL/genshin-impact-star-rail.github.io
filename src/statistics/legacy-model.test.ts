import { test } from "node:test";
import assert from "node:assert/strict";
import { regression } from "./legacy-model.ts";
test("regression keeps both directions and handles perfect/undefined correlation", () => {
  const r = regression([1, 2, 3, 4], [3, 5, 7, 9]);
  assert.equal(r.r, 1);
  assert.equal(r.a, 1);
  assert.equal(r.b, 2);
  assert.equal(r.bReverse, 0.5);
  assert.equal(r.aReverse, -0.5);
  assert.equal(r.pValue, 0);
  assert.throws(() => regression([1, 1, 1], [1, 2, 3]));
  assert.throws(() => regression([1, 2, 3], [1, 2]));
});
