import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compileExpression, curveSegments, DEFAULT_VIEW } from "./math.ts";
const params = { a: 2, b: 1, c: 0 };
describe("expression engine", () => {
  it("evaluates parameters, implicit multiplication and common notation", () => {
    assert.equal(
      compileExpression("a*sin(b*x+c)").evaluate(Math.PI / 2, params),
      2,
    );
    assert.equal(compileExpression("y = 2x² − 1").evaluate(3, params), 17);
    assert.ok(
      Math.abs(compileExpression("ln(e)").evaluate(0, params) - 1) < 1e-12,
    );
    assert.deepEqual(compileExpression("a*x+c").params, ["a", "c"]);
  });
  it("rejects assignments and executable or non-mathematical syntax", () => {
    for (const value of [
      "a=3",
      "x;2",
      "random()",
      'import("a")',
      "[1,2]",
      "x!",
    ])
      assert.throws(() => compileExpression(value));
  });
  it("reads juxtaposed letters and parentheses as products with correct powers", () => {
    const scope = { a: 2, b: 3, k: 4, m: 5, θ: 2 };
    for (const [input, expected] of [
      ["ab", 6],
      ["ab^2", 18],
      ["ax", 4],
      ["a(x+1)", 6],
      ["(x+1)(x-1)", 3],
      ["2abx", 24],
      ["k sin(mx)", 4 * Math.sin(10)],
      ["θx", 4],
    ] as const) {
      assert.ok(
        Math.abs(compileExpression(input).evaluate(2, scope) - expected) <
          1e-10,
        input,
      );
    }
  });
  it("discovers arbitrary shared parameters, defaults new ones to one and protects constants", () => {
    assert.deepEqual(compileExpression("kmx+n+θ+q+r").params, [
      "k",
      "m",
      "n",
      "θ",
      "q",
      "r",
    ]);
    assert.equal(compileExpression("kmx+n").evaluate(2, {}), 3);
    assert.equal(
      compileExpression("e+pi").evaluate(0, { e: 0, pi: 0 }),
      Math.E + Math.PI,
    );
  });
  it("preserves named functions, constants, scientific notation and legacy input", () => {
    for (const input of [
      "asin(x)",
      "sinh(x)",
      "log10(x)",
      "ln(x)",
      "sqrt(x)",
      "exp(x)",
    ])
      assert.deepEqual(compileExpression(input).params, [], input);
    assert.equal(compileExpression("1e-3x").evaluate(2, {}), 0.002);
    assert.equal(compileExpression("2πx").evaluate(1, {}), 2 * Math.PI);
    assert.equal(
      compileExpression("a sin(bx+c)").evaluate(1, params),
      compileExpression("a*sin(b*x+c)").evaluate(1, params),
    );
  });
  it("returns gaps for values outside the real domain", () => {
    assert.ok(Number.isNaN(compileExpression("sqrt(x)").evaluate(-1, params)));
    assert.ok(Number.isNaN(compileExpression("1/x").evaluate(0, params)));
  });
});
describe("curve sampling", () => {
  it("does not connect across reciprocal or tangent poles", () => {
    for (const source of ["1/x", "tan(x)"]) {
      const fn = compileExpression(source);
      const lines = curveSegments(
        (x) => fn.evaluate(x, params),
        DEFAULT_VIEW,
        901,
        600,
      );
      assert.ok(lines.length > 1);
      for (const line of lines)
        for (let i = 1; i < line.length; i++) {
          const x1 = (line[i - 1][0] - 901 / 2) / DEFAULT_VIEW.scale;
          const x2 = (line[i][0] - 901 / 2) / DEFAULT_VIEW.scale;
          if (source === "1/x") assert.ok(!(x1 < 0 && x2 > 0));
          else
            assert.equal(
              Math.floor((x1 + Math.PI / 2) / Math.PI),
              Math.floor((x2 + Math.PI / 2) / Math.PI),
            );
        }
    }
  });
  it("keeps a smooth sine curve continuous", () => {
    assert.equal(curveSegments(Math.sin, DEFAULT_VIEW, 900, 600).length, 1);
  });
});
