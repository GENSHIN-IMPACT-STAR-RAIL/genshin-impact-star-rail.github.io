import assert from "node:assert/strict";
import { test } from "node:test";
import {
  solveSecondOrder,
  secondOrderFamily,
  secondOrderSegments,
} from "./odeSecondOrder.ts";
import { solveOdeLatex, odeSelection, EMPTY_ODE_STATE } from "./odeLatex.ts";

const near = (actual: number, expected: number, tolerance = 1e-9) =>
  assert.ok(
    Math.abs(actual - expected) < tolerance * Math.max(1, Math.abs(expected)),
    `${actual} != ${expected}`,
  );

test("distinct, repeated and complex characteristic roots reproduce known initial-value solutions", () => {
  const cases: [string, string, (x: number) => number][] = [
    ["y''-3y'+2y=0", "distinct", (x) => 2 * Math.exp(x) - Math.exp(2 * x)],
    ["y''+2y'+y=0", "repeated", (x) => (1 + x) * Math.exp(-x)],
    [
      "y''+2y'+5y=0",
      "complex",
      (x) => Math.exp(-x) * (Math.cos(2 * x) + 0.5 * Math.sin(2 * x)),
    ],
    ["-y''+y=0", "distinct", Math.cosh],
    ["y''-2y=0", "distinct", (x) => Math.cosh(Math.sqrt(2) * x)],
  ];
  for (const [input, kind, expected] of cases) {
    const solution = solveSecondOrder(input);
    assert.equal(solution.rootKind, kind);
    const curve = solution.initialCurve(0, 1, 0);
    for (const x of [-1, -0.23, 0.13, 0.75, 1.2])
      near(curve.evaluate(x), expected(x));
    near((curve.evaluate(1e-5) - curve.evaluate(-1e-5)) / 2e-5, 0, 1e-7);
  }
  assert.match(solveSecondOrder("y''-2y=0").general, /sqrt/);
  near(solveSecondOrder("y''-y=0").initialCurve(0, 1, -1).evaluate(1000), 0);
});

test("resonant trigonometric, repeated exponential and zero-root forcing", () => {
  const cases: [string, number, number, number, (x: number) => number][] = [
    ["y''+y=sin(x)", 0, 0, 0, (x) => 0.5 * (Math.sin(x) - x * Math.cos(x))],
    ["y''-2y'+y=exp(x)", 0, 0, 0, (x) => 0.5 * x * x * Math.exp(x)],
    ["y''=6x", 2, 10, 5, (x) => x ** 3 - 7 * x + 16],
    [
      "y''+2y'+5y=exp(-x)*cos(2x)",
      0,
      0,
      0,
      (x) => (x / 4) * Math.exp(-x) * Math.sin(2 * x),
    ],
    ["y''-y=x^2+2x+3", 0, -5, -2, (x) => -x * x - 2 * x - 5],
  ];
  for (const [input, x0, y0, slope0, expected] of cases) {
    const curve = solveSecondOrder(input).initialCurve(x0, y0, slope0);
    for (const x of [-0.75, -0.1, 0.3, 1.3, 2.2])
      near(curve.evaluate(x), expected(x));
    near(
      (curve.evaluate(x0 + 1e-5) - curve.evaluate(x0 - 1e-5)) / 2e-5,
      slope0,
      1e-7,
    );
  }
});

test("particular integrals satisfy the original operator for mixed forcing", () => {
  for (const input of [
    "y''+y=sin(3x)+2cos(2x)+exp(2x)+x^3",
    "2y''-3y'+y=x*exp(x)",
    "y''+4y=x*sin(2x)",
    "y''-y=exp(-x)",
    "y''-y=1/exp(x)",
    "y''+y=cos(x)^2",
    "y''+y=3sin(2x+1)",
  ]) {
    const s = solveSecondOrder(input),
      [a, b, c] = s.coefficients;
    for (const x of [-0.8, 0, 0.31, 1.4])
      near(
        a * s.particularSecondDerivative(x) +
          b * s.particularDerivative(x) +
          c * s.particularValue(x),
        s.forcing(x),
        1e-8,
      );
    const curve = s.initialCurve(0.4, 1.2, -0.7);
    for (const x of [-0.5, 0.2, 0.9]) {
      const h = 1e-5,
        second = (curve.derivative(x + h) - curve.derivative(x - h)) / (2 * h);
      near(
        a * second + b * curve.derivative(x) + c * curve.evaluate(x),
        s.forcing(x),
        1e-7,
      );
    }
  }
});

test("LaTeX accepts both second-derivative notations and requires both initial data", () => {
  for (const latex of [
    String.raw`y''+y=0`,
    String.raw`y^{\prime\prime}+y=0`,
    String.raw`\frac{\mathrm{d}^2y}{\mathrm{d}x^2}+y=0`,
    String.raw`\frac{d^2y}{dx^2}+y=0`,
  ]) {
    const s = solveOdeLatex(latex, 2);
    near(s.initialCurve(0, 1, 0).evaluate(1), Math.cos(1));
  }
  const solution = solveOdeLatex(String.raw`y''+y=0`, 2);
  const missing = odeSelection({
    ...EMPTY_ODE_STATE,
    solution,
    initialX: "0",
    initialY: "1",
  });
  assert.equal(missing.point, null);
  assert.match(missing.error, /初始斜率/);
  const selected = odeSelection({
    ...EMPTY_ODE_STATE,
    solution,
    initialX: String.raw`\frac{\pi}{2}`,
    initialY: "1",
    initialSlope: "0",
  });
  assert.deepEqual(selected.point, [Math.PI / 2, 1]);
  near(selected.curve!.evaluate(Math.PI), 0);
});

test("nonlinear, variable-coefficient, missing order and unsupported forcing are rejected", () => {
  for (const input of [
    "x*y''+y=0",
    "y*y''+y=0",
    "(y'')^2+y=0",
    "y''+sin(y)=0",
    "y'+y=0",
    "y''+y=log(x)",
    "y''/x=0",
  ])
    assert.throws(() => solveSecondOrder(input), input);
  assert.throws(() => solveOdeLatex(String.raw`y'''=0`, 2));
});

test("two-parameter families allow intersections and density remains bounded", () => {
  const s = solveSecondOrder("y''+y=0"),
    view = { x: 0, y: 0, scale: 52 };
  const flat = s.initialCurve(0, 1, 0),
    steep = s.initialCurve(0, 1, 2);
  near(flat.evaluate(0), steep.evaluate(0));
  assert.notEqual(flat.evaluate(0.5), steep.evaluate(0.5));
  const sparse = secondOrderFamily(s, view, 800, 600, 94),
    dense = secondOrderFamily(s, view, 800, 600, 32);
  assert.ok(dense.length > sparse.length);
  assert.ok(dense.length <= 39);
  assert.ok(
    secondOrderSegments(steep, view, 800, 600)
      .flat()
      .every((p) => p.every(Number.isFinite)),
  );
});
