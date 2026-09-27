import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  samplePolarPoints,
  formatAngle,
  formatDegrees,
} from "./polarPoints.ts";
import { compilePolarEquation } from "./polarEquation.ts";
import { angleRange } from "./polar.ts";
describe("equal-angle polar point sampling", () => {
  it("matches the reference eighth-division table and excludes its limiting endpoint", () => {
    const eq = compilePolarEquation(
      "r^2",
      String.raw`\frac{a}{1+\tan(2\theta)}`,
    );
    const rows = samplePolarPoints(
      eq,
      angleRange("0", "0.25"),
      8,
      { a: 1 },
      false,
    );
    assert.equal(rows.length, 9);
    // Calculate expected values from the defining equation.
    for (let i = 0; i < 8; i++) {
      assert.equal(rows[i].status, "defined");
      assert.ok(
        Math.abs(rows[i].r! - 1 / Math.sqrt(1 + Math.tan((i * Math.PI) / 16))) <
          1e-10,
      );
    }
    assert.ok(Math.abs(rows[1].r! - 0.91328) < 1e-5);
    assert.equal(formatAngle(rows[1].theta), "π/32");
    assert.equal(formatDegrees(rows[1].theta), "5.625°");
    assert.equal(rows[8].status, "excluded");
    assert.equal(rows[8].r, null);
    assert.equal(rows[8].limit, 0);
    assert.deepEqual(rows[8].point, [0, 0]);
  });
  it("samples nonzero starts and includes the exact final endpoint", () => {
    const range = angleRange("-0.5", "1.5");
    const rows = samplePolarPoints(
      compilePolarEquation("r", "2"),
      range,
      4,
      {},
      false,
    );
    assert.equal(rows.length, 5);
    assert.equal(rows[0].theta, range.start);
    assert.equal(rows[4].theta, range.end);
    assert.equal(formatAngle(rows[0].theta), "−π/2");
    assert.equal(formatAngle(rows[4].theta), "3π/2");
  });
  it("updates radii from parameters and includes negative roots only when enabled", () => {
    const eq = compilePolarEquation("r^2", "a^2"),
      range = angleRange("0", "1");
    assert.equal(samplePolarPoints(eq, range, 4, { a: 2 }, false).length, 5);
    const both = samplePolarPoints(eq, range, 4, { a: 3 }, true);
    assert.equal(both.length, 10);
    assert.equal(both[0].r, 3);
    assert.equal(both[1].r, -3);
    assert.equal(both[1].label, "Q0");
    assert.deepEqual(both[1].point, [-3, -0]);
  });
  it("does not invent a point for no real solutions or hidden negative radii", () => {
    const range = angleRange("0", "1");
    for (const row of samplePolarPoints(
      compilePolarEquation("r^2", "-1"),
      range,
      4,
      {},
      false,
    )) {
      assert.equal(row.status, "unavailable");
      assert.equal(row.point, null);
    }
    for (const row of samplePolarPoints(
      compilePolarEquation("r", "-2"),
      range,
      4,
      {},
      false,
    )) {
      assert.equal(row.status, "hidden");
      assert.equal(row.point, null);
    }
  });
  it("rejects fractional, empty-equivalent and unbounded subdivision counts", () => {
    for (const n of [0, -1, 2.5, 65, NaN, Infinity])
      assert.throws(() =>
        samplePolarPoints(
          compilePolarEquation("r", "1"),
          angleRange("0", "2"),
          n,
          {},
          false,
        ),
      );
  });
});
