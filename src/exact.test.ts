import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  analysisCurves,
  curveMesh,
  snapPoint,
  integrateCurve,
} from "./analysis.ts";
import { compileCartesianEntry } from "./cartesian.ts";
import { compilePolarEquation } from "./polarEquation.ts";
import {
  exactInput,
  exactAt,
  enrichExact,
  exactTangent,
  exactIntegral,
} from "./exact.ts";
const view = { x: 0, y: 0, scale: 60 };
function curves(
  values: {
    value: string;
    left?: string;
    kind?: "explicit" | "implicit" | "parametric";
  }[],
) {
  return analysisCurves(
    values.map((v, i) => ({
      ...v,
      id: i + 1,
      visible: true,
      color: "#4d657a",
      ...compileCartesianEntry(v),
    })),
    {},
    false,
    null,
    false,
    view,
    900,
  );
}
const input = exactInput;
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
describe("exact analysis values and provenance", () => {
  it("retains fractions, radicals, pi multiples and literal decimal values", () => {
    assert.equal(input("1/3").latex, "\\frac{1}{3}");
    assert.equal(input("sqrt(2)").latex, "\\sqrt{2}");
    assert.equal(input("pi/4").latex, "\\frac{\\pi}{4}");
    assert.notEqual(input("0.333333333").latex, input("1/3").latex);
    close(input("1e-3").value, 0.001);
    assert.throws(() => input("sqrt(-1)"));
  });
  it("evaluates exact trigonometric coordinates without approximating arbitrary trig values", () => {
    const c = curves([{ value: "\\sin(x)" }])[0];
    const p = exactAt(c, input("pi/4"))!;
    assert.equal(p[0]!.latex, "\\frac{\\pi}{4}");
    assert.equal(p[1]!.latex, "\\frac{\\sqrt{2}}{2}");
    const small = exactAt(curves([{ value: "\\cos(x)" }])[0], input("1e-12"))!;
    assert.notEqual(small[1]!.latex, "1");
    const compiled = compileCartesianEntry({ value: "a\\sin(bx+c)" });
    const defaultCurve = analysisCurves(
      [
        {
          id: 1,
          visible: true,
          color: "#4d657a",
          value: "a\\sin(bx+c)",
          ...compiled,
        },
      ],
      { a: 2, b: 1, c: 0 },
      false,
      null,
      false,
      view,
      900,
    )[0];
    assert.equal(exactAt(defaultCurve, input("0"))![1]!.latex, "0");
    const integral = exactIntegral(defaultCurve, input("0"), input("pi/4"))!;
    assert.equal(integral.latex, "2-\\sqrt{2}");
  });
  it("verifies radical intersections and pi stationary points symbolically", () => {
    const cs = curves([{ value: "x^2" }, { value: "2" }]);
    const p = enrichExact(
      snapPoint(
        cs.map((c) => curveMesh(c, view, 900, 650)),
        [1.42, 2.01],
        60,
      )!,
      cs,
    );
    assert.equal(p.exactXY?.[0]?.latex, "\\sqrt{2}");
    assert.equal(p.exactXY?.[1]?.value, 2);
    const sine = curves([{ value: "\\sin(x)" }]);
    const stationary = enrichExact(
      snapPoint(
        sine.map((c) => curveMesh(c, view, 900, 650)),
        [1.57, 1.02],
        60,
      )!,
      sine,
    );
    assert.equal(stationary.exactXY?.[0]?.latex, "\\frac{\\pi}{2}");
    const ordinary = enrichExact(
      {
        xy: [Math.PI, Math.sin(Math.PI)],
        hits: [{ key: sine[0].key, xy: [Math.PI, 0], u: Math.PI }],
        kind: "曲线上的点",
      },
      sine,
    );
    assert.equal(ordinary.exactXY, undefined);
    const quadratic = curves([{ value: "x^2-x-1" }]);
    const golden = enrichExact(
      snapPoint(
        quadratic.map((c) => curveMesh(c, view, 900, 650)),
        [1.62, 0.01],
        60,
      )!,
      quadratic,
    );
    assert.ok(golden.exactXY?.[0]?.latex.includes("\\sqrt{5}"));
  });
  it("does not infer an exact root merely from a nearby decimal", () => {
    const cs = curves([{ value: "x-1.000000001" }]);
    const pick = enrichExact(
      {
        xy: [1.000000001, 0],
        hits: [{ key: cs[0].key, xy: [1.000000001, 0], u: 1.000000001 }],
        kind: "x 轴交点",
      },
      cs,
    );
    assert.equal(pick.exactXY, undefined);
  });
  it("constructs exact tangent coefficients from symbolic derivatives", () => {
    const c = curves([{ value: "x^2" }])[0],
      u = input("sqrt(2)"),
      xy = exactAt(c, u)!;
    const latex = exactTangent(
      c,
      { key: c.key, xy: [u.value, 2], u: u.value, exactU: u },
      xy,
    )!;
    assert.ok(latex.includes("\\sqrt{2}"), latex);
    assert.ok(latex.includes("-2"), latex);
    const circle = curves([{ kind: "implicit", value: "x^2+y^2=2" }])[0];
    assert.equal(
      exactTangent(circle, { key: circle.key, xy: [Math.SQRT2, 0] }, [
        input("sqrt(2)"),
        input("0"),
      ]),
      "x=\\sqrt{2}",
    );
  });
  it("integrates polynomials, sine, scaled cosine squared and reciprocal exactly", () => {
    for (const [expr, a, b, expected] of [
      ["x^2", "0", "sqrt(2)", (2 * Math.SQRT2) / 3],
      ["\\sin(x)", "0", "pi", 2],
      ["\\cos(4x)^2", "0", "pi/16", Math.PI / 32 + 1 / 16],
      ["1/x", "1", "2", Math.log(2)],
      ["\\sqrt{x}", "1", "4", 14 / 3],
      ["1/x^2", "1", "2", 0.5],
      ["e^x", "0", "1", Math.E - 1],
    ] as const) {
      const c = curves([{ value: expr }])[0],
        lo = input(a),
        hi = input(b),
        result = exactIntegral(
          c,
          lo,
          hi,
          integrateCurve(c, lo.value, hi.value),
        );
      assert.ok(result, expr);
      close(result.value, expected);
      if (expr === "1/x") assert.equal(result.latex, "\\ln(2)");
    }
    const c = curves([{ value: "x^2" }])[0];
    close(exactIntegral(c, input("2"), input("0"))!.value, -8 / 3);
    assert.equal(exactIntegral(c, undefined, input("2")), null);
  });
  it("preserves polar branch values and parametric integral direction", () => {
    const c = analysisCurves(
      [
        {
          id: 1,
          visible: true,
          color: "#4d657a",
          left: "r",
          value: "3\\cos(4\\theta)",
          fn: compilePolarEquation("r", "3\\cos(4\\theta)"),
          parameterInterval: null,
        },
      ],
      {},
      true,
      { start: 0, end: Math.PI / 8 },
      false,
      view,
      900,
    )[0];
    const result = exactIntegral(
      c,
      input("0"),
      input("pi/16"),
      integrateCurve(c, 0, Math.PI / 16),
    );
    assert.ok(result);
    close(result.value, (9 * Math.PI) / 64 + 9 / 32);
    const ellipse = curves([
      { kind: "parametric", left: "2\\cos(t)", value: "\\sin(t)" },
    ])[0];
    const param = exactIntegral(
      ellipse,
      input("0"),
      input("2pi"),
      -2 * Math.PI,
    );
    assert.ok(param);
    close(param.value, -2 * Math.PI);
  });
});
