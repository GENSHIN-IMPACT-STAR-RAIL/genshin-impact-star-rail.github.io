import assert from "node:assert/strict";
import { test } from "node:test";
import {
  solveOdeLatex,
  parseInitialLatex,
  odeSelection,
  EMPTY_ODE_STATE,
} from "./odeLatex.ts";

test("visual fractions and prime notation describe the same derivative", () => {
  for (const latex of [
    String.raw`\frac{dy}{dx}=xy`,
    String.raw`\frac{\mathrm{d}y}{\mathrm{d}x}=xy`,
    String.raw`y'=xy`,
    String.raw`y^{\prime}=xy`,
  ]) {
    assert.equal(solveOdeLatex(latex).slope(2, 3), 6);
  }
  const reverse = solveOdeLatex(
    String.raw`\frac{\mathrm{d}x}{\mathrm{d}y}+x=y`,
  );
  assert.equal(reverse.independent, "y");
  assert.equal(reverse.slope(2, 3), 1);
});

test("structured arithmetic keeps signs, fractions, powers and functions", () => {
  assert.equal(
    solveOdeLatex(String.raw`y'=\frac{x\left(1-y^2\right)}{2}`).slope(2, 3),
    -8,
  );
  assert.equal(solveOdeLatex(String.raw`y'=-\frac{x}{y}`).slope(2, 4), -0.5);
  assert.ok(
    Math.abs(solveOdeLatex(String.raw`y'=x\sin y`).slope(2, Math.PI / 2) - 2) <
      1e-12,
  );
  assert.equal(solveOdeLatex(String.raw`y'=\sqrt{y}`).slope(1, 4), 2);
  assert.ok(
    Math.abs(solveOdeLatex(String.raw`y'=e^{-x}`).slope(1, 0) - Math.exp(-1)) <
      1e-12,
  );
});

test("initial conditions use the same LaTeX editor and validate the original domain", () => {
  assert.equal(parseInitialLatex(String.raw`\frac{1}{2}`), 0.5);
  assert.ok(
    Math.abs(parseInitialLatex(String.raw`\frac{\pi}{4}`) - Math.PI / 4) <
      1e-12,
  );
  assert.equal(parseInitialLatex(String.raw`\sqrt{4}`), 2);
  const solution = solveOdeLatex(String.raw`y'=\frac{x}{y}`);
  const valid = odeSelection({
    ...EMPTY_ODE_STATE,
    solution,
    initialX: "0",
    initialY: String.raw`\frac12`,
  });
  assert.deepEqual(valid.point, [0, 0.5]);
  assert.equal(
    odeSelection({ ...EMPTY_ODE_STATE, solution, initialX: "0", initialY: "0" })
      .point,
    null,
  );
  assert.throws(() => solveOdeLatex(String.raw`y''=x`));
  assert.throws(() => solveOdeLatex(String.raw`\frac{dy}{dx}=\placeholder{}`));
});
