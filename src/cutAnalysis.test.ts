import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analysisCurves } from "./analysis.ts";
import { compileCartesianEntry } from "./cartesian.ts";
import { cutIntervals, lineIntegral, regionArea } from "./cutAnalysis.ts";
const curves = (...values: string[]) =>
  analysisCurves(
    values.map((value, i) => ({
      id: i,
      visible: true,
      color: "#123456",
      value,
      ...compileCartesianEntry({ value }),
    })),
    {},
    false,
    null,
    false,
    { x: 0, y: 0, scale: 60 },
    600,
  );
const close = (a: number, b: number, tol = 1e-6) =>
  assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
describe("intersection-bounded curve and region analysis", () => {
  it("finds parabola boundaries and computes the enclosed area", () => {
    const [f, g] = curves("x^2", "1");
    const cuts = cutIntervals(f, g);
    assert.equal(cuts.length, 1);
    close(cuts[0].a, -1);
    close(cuts[0].b, 1);
    close(regionArea(f, g, -1, 1), 4 / 3);
    close(regionArea(g, f, 1, -1), 4 / 3);
    close(lineIntegral(f, -1, 1), Math.sqrt(5) + Math.asinh(2) / 2);
  });
  it("splits at multiple intersections including tangencies", () => {
    const [f, g] = curves("x^2*(x^2-1)", "0");
    const cuts = cutIntervals(f, g);
    assert.equal(cuts.length, 2);
    close(cuts[0].a, -1);
    close(cuts[0].b, 0);
    close(cuts[1].b, 1);
    const [h, j] = curves("(x-0.137)^2*(x+1)*(x-1)", "0");
    assert.equal(cutIntervals(h, j).length, 2);
  });
  it("rejects coincident curves, isolated crossings and discontinuous boundaries", () => {
    for (const pair of [
      ["x", "x"],
      ["x", "0"],
      ["1/x", "x"],
      ["(x^2-1)/x", "0"],
    ]) {
      const [f, g] = curves(...pair);
      assert.equal(cutIntervals(f, g).length, 0, pair.join(","));
    }
  });
  it("computes weighted line integrals with orientation-independent ds", () => {
    const [f] = curves("x");
    close(lineIntegral(f, 0, 1), Math.SQRT2);
    close(
      lineIntegral(f, 1, 0, (x, y) => x + y),
      Math.SQRT2,
    );
    close(
      lineIntegral(f, 0, 1, () => -1),
      -Math.SQRT2,
    );
    assert.throws(() => lineIntegral(f, 0, 1, () => NaN));
  });
});
