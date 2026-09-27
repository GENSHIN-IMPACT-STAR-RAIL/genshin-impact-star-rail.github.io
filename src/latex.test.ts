import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compileLatex } from "./latex.ts";
const value = (s: string, x = 2, p: Record<string, number> = {}) =>
  compileLatex(s).evaluate(x, p);
const close = (actual: number, expected: number, tolerance = 1e-6) =>
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${actual} != ${expected}`,
  );
describe("structured formula evaluation", () => {
  it("preserves fractions, parentheses, powers, roots and juxtaposition", () => {
    close(value(String.raw`\frac{x+1}{x-1}`), 3);
    close(value(String.raw`ab^2x`, 2, { a: 2, b: 3 }), 36);
    close(value(String.raw`\sqrt[3]{x}`, -8), -2);
    close(value(String.raw`\left(x+1\right)\left(x-1\right)`), 3);
    close(value(String.raw`\frac{1}{\frac{2}{x}}`), 1);
  });
  it("retains named functions, Greek variables, subscripts and constants", () => {
    close(
      value(String.raw`k\sin(mx+\theta)`, 1, { k: 2, m: 1, θ: 0 }),
      2 * Math.sin(1),
    );
    assert.deepEqual(compileLatex(String.raw`a_1x+b_2`).params, ["a_1", "b_2"]);
    close(value(String.raw`\ln(e)+\log_{2}(8)`), 4);
    close(value(String.raw`\pi`, 1, { Pi: 0 }), Math.PI);
  });
  it("evaluates finite sums and products without leaking bound variables", () => {
    const sum = compileLatex(String.raw`\sum_{n=1}^{5}nx`);
    assert.deepEqual(sum.params, []);
    close(sum.evaluate(2, { n: 99 }), 30);
    close(value(String.raw`\prod_{n=1}^{4}n`), 24);
    assert.ok(Number.isNaN(value(String.raw`\sum_{n=1}^{101}n`)));
    assert.ok(Number.isNaN(value(String.raw`\sum_{n=1.5}^{5}n`)));
  });
  it("integrates smooth functions with a variable upper limit and reversed bounds", () => {
    const integral = compileLatex(String.raw`\int_0^x t^2\,\mathrm{d}t`);
    assert.deepEqual(integral.params, []);
    close(integral.evaluate(3, {}), 9);
    close(value(String.raw`\int_1^0 x^2\,\mathrm{d}x`), -1 / 3);
    close(value(String.raw`\int_0^{\pi}\sin(t)\,\mathrm{d}t`), 2);
    assert.ok(
      Number.isNaN(value(String.raw`\int_{-1}^1\frac{1}{t}\,\mathrm{d}t`)),
    );
  });
  it("computes first derivatives and excludes the cusp of abs(x)", () => {
    close(
      value(String.raw`\frac{\mathrm{d}}{\mathrm{d}x}\left(x^3\right)`, 2),
      12,
    );
    close(
      value(String.raw`\frac{\mathrm{d}}{\mathrm{d}x}\sin(x)`, 1),
      Math.cos(1),
    );
    assert.ok(
      Number.isNaN(
        value(String.raw`\frac{\mathrm{d}}{\mathrm{d}x}\left|x\right|`, 0),
      ),
    );
  });
  it("rejects empty slots, unsupported relations and indefinite integration explicitly", () => {
    for (const s of [
      String.raw`\frac{\placeholder{}}{x}`,
      String.raw`x<2`,
      String.raw`\int x^2\,\mathrm{d}x`,
      String.raw`\infty`,
    ])
      assert.throws(() => compileLatex(s));
  });
});
