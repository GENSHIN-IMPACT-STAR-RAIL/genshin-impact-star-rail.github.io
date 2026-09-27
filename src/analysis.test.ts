import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compileCartesianEntry } from "./cartesian.ts";
import { compilePolarEquation } from "./polarEquation.ts";
import {
  analysisCurves,
  curveMesh,
  snapPoint,
  tangent,
  integrateCurve,
  readCoordinate,
  type AnalysisCurve,
  type AnalysisEntry,
} from "./analysis.ts";
const view = { x: 0, y: 0, scale: 60 },
  w = 900,
  h = 650;
const close = (a: number, b: number, tolerance = 1e-6) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
function entries(
  values: {
    value: string;
    left?: string;
    kind?: "explicit" | "implicit" | "parametric";
    tStart?: string;
    tEnd?: string;
  }[],
): AnalysisEntry[] {
  return values.map((v, i) => ({
    ...v,
    id: i + 1,
    visible: true,
    color: "#4d657a",
    ...compileCartesianEntry(v),
  }));
}
const curves = (v: Parameters<typeof entries>[0]) =>
  analysisCurves(entries(v), {}, false, null, false, view, w);
const mesh = (cs: AnalysisCurve[]) => cs.map((c) => curveMesh(c, view, w, h));

describe("curve picking and differential analysis", () => {
  it("snaps to a stationary point and both intersecting curves", () => {
    const cs = curves([{ value: "x^2" }, { value: "1" }]);
    const stationary = snapPoint(mesh(cs), [0.05, 0.04], view.scale)!;
    assert.equal(stationary.kind, "驻点");
    close(stationary.xy[0], 0);
    close(stationary.xy[1], 0);
    const crossing = snapPoint(mesh(cs), [1.03, 1.04], view.scale)!;
    assert.equal(crossing.kind, "交点");
    close(crossing.xy[0], 1);
    close(crossing.xy[1], 1);
    assert.equal(crossing.hits.length, 2);
    assert.equal(snapPoint(mesh(cs), [4, -3], view.scale), null);
    const overlapping = curves([{ value: "x" }, { value: "x" }]);
    assert.equal(
      snapPoint(mesh(overlapping), [1, 1], view.scale)!.kind,
      "曲线上的点",
    );
    const touching = curves([{ value: "x^2" }, { value: "0" }]);
    assert.equal(
      snapPoint(mesh(touching), [0.03, 0.03], view.scale)!.kind,
      "交点",
    );
  });
  it("supports mixed implicit/parametric intersections and vertical tangents", () => {
    const cs = curves([
      { kind: "implicit", value: "x^2+y^2=4" },
      { kind: "parametric", left: "t", value: "t", tStart: "-3", tEnd: "3" },
    ]);
    const picked = snapPoint(mesh(cs), [1.42, 1.42], view.scale)!;
    assert.equal(picked.kind, "交点");
    close(picked.xy[0], Math.SQRT2);
    close(picked.xy[1], Math.SQRT2);
    const vertical = tangent(cs[0], { key: cs[0].key, xy: [2, 0] })!;
    assert.equal(vertical.latex, "x=2");
    assert.equal(
      tangent(curves([{ kind: "implicit", value: "x^2+y^2=0" }])[0], {
        key: "1:0",
        xy: [0, 0],
      }),
      null,
    );
  });
  it("does not mistake a cusp, hole or pole for a regular tangent/point", () => {
    const cusp = curves([{ value: "\\left|x\\right|" }])[0];
    assert.equal(tangent(cusp, { key: cusp.key, xy: [0, 0], u: 0 }), null);
    const hole = curves([{ value: "\\frac{x^2-1}{x-1}" }])[0];
    assert.ok(Number.isNaN(hole.at(1)[1]));
    const pole = curves([{ value: "1/x" }]);
    assert.equal(snapPoint(mesh(pole), [0, 0], view.scale), null);
  });
  it("computes ordinary and parametric tangent directions", () => {
    const cs = curves([
      { value: "x^2" },
      { kind: "parametric", left: "2\\cos(t)", value: "\\sin(t)" },
    ]);
    const t = tangent(cs[0], { key: cs[0].key, xy: [2, 4], u: 2 })!;
    close(t.direction[1] / t.direction[0], 4);
    assert.equal(t.latex, "y=4x-4");
    assert.equal(
      tangent(cs[1], { key: cs[1].key, xy: [2, 0], u: 0 })!.latex,
      "x=2",
    );
  });
  it("reads fractions, pi, negatives and scientific notation and rejects variables", () => {
    close(readCoordinate("pi/2"), Math.PI / 2);
    close(readCoordinate("-1/4"), -0.25);
    close(readCoordinate("1e-3"), 0.001);
    assert.throws(() => readCoordinate("a"));
    assert.throws(() => readCoordinate("1/0"));
    assert.throws(() => readCoordinate(""));
  });
});

describe("bounded numerical integrals", () => {
  it("computes signed integrals, reversed limits, zero length and parameter direction", () => {
    const c = curves([{ value: "x^2" }])[0];
    close(integrateCurve(c, -1, 2), 3);
    close(integrateCurve(c, 2, -1), -3);
    close(integrateCurve(c, 1, 1), 0);
    const negative = curves([{ value: "-x^2" }])[0];
    close(integrateCurve(negative, 0, 1), -1 / 3);
    const p = curves([
      { kind: "parametric", left: "2\\cos(t)", value: "\\sin(t)" },
    ])[0];
    close(integrateCurve(p, 0, 2 * Math.PI), -2 * Math.PI);
    close(integrateCurve(curves([{ value: "\\cos(256\\pi x)" }])[0], 0, 1), 0);
  });
  it("rejects intervals crossing undefined points rather than reporting a principal value", () => {
    for (const value of ["1/x", "1/(x-0.1234)", "1/(x-0.1234)^2", "\\tan(x)"]) {
      const c = curves([{ value }])[0];
      assert.throws(() => integrateCurve(c, -2, 2), Error, value);
    }
    assert.throws(() =>
      integrateCurve(curves([{ value: "\\sqrt{x}" }])[0], -1, 1),
    );
    assert.throws(() =>
      integrateCurve(
        curves([{ kind: "implicit", value: "x^2+y^2=1" }])[0],
        0,
        1,
      ),
    );
  });
  it("uses polar swept area and respects negative-r visibility and real branches", () => {
    const polar = (left: string, value: string, negative: boolean) =>
      analysisCurves(
        [
          {
            id: 1,
            visible: true,
            color: "#4d657a",
            left,
            value,
            fn: compilePolarEquation(left, value),
            parameterInterval: null,
          },
        ],
        {},
        true,
        { start: 0, end: 2 * Math.PI },
        negative,
        view,
        w,
      );
    const circle = polar("r", "2", false)[0];
    close(integrateCurve(circle, 0, Math.PI / 2), Math.PI);
    const negative = polar("r", "-2", false)[0];
    assert.ok(Number.isNaN(negative.at(0)[0]));
    close(integrateCurve(polar("r", "-2", true)[0], 0, Math.PI / 2), Math.PI);
    assert.equal(polar("r^2", "4", true).length, 2);
    assert.throws(() => integrateCurve(circle, -1, 1));
  });
});
