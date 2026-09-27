import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compilePolarEquation, realQuadraticRoots } from "./polarEquation.ts";
import { angleRange, polarSegments, POLAR_VIEW } from "./polar.ts";
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
describe("editable polar left side", () => {
  it("retains explicit radii and solves squared radii with both signs", () => {
    close(compilePolarEquation("r", "3").evaluate(0, {}), 3);
    const squared = compilePolarEquation("r^2", "9");
    assert.equal(squared.branches.length, 2);
    close(squared.branches[0](0, {}), 3);
    close(squared.branches[1](0, {}), -3);
    assert.ok(
      compilePolarEquation("r^2", "-1").branches.every((f) =>
        Number.isNaN(f(0, {})),
      ),
    );
  });
  it("collects parameters on both sides but never treats r as a slider", () => {
    const fn = compilePolarEquation("ar^2+br+c", String.raw`k\cos(\theta)`);
    assert.deepEqual(fn.params, ["c", "b", "a", "k"]);
    const values = { a: 1, b: -3, c: 2, k: 0 };
    close(fn.branches[0](0, values), 2);
    close(fn.branches[1](0, values), 1);
  });
  it("supports shifted squares, linear expressions and constant denominators", () => {
    close(compilePolarEquation("(r-1)^2", "4").branches[0](0, {}), 3);
    close(compilePolarEquation("(r-1)^2", "4").branches[1](0, {}), -1);
    close(compilePolarEquation("2r+1", "5").evaluate(0, {}), 2);
    close(
      compilePolarEquation(String.raw`\frac{r^2}{2}`, "8").evaluate(0, {}),
      4,
    );
  });
  it("keeps real-domain gaps in a lemniscate and honors negative-radius filtering", () => {
    const eq = compilePolarEquation("r^2", String.raw`9\cos(2\theta)`);
    assert.ok(eq.branches.every((f) => Number.isNaN(f(Math.PI / 2, {}))));
    const lobes = polarSegments(
      (t) => eq.branches[0](t, {}),
      angleRange("0", "2"),
      POLAR_VIEW,
      600,
      600,
      false,
    );
    for (const lobe of lobes.slice(1, -1))
      for (const [px, py] of [lobe[0], lobe.at(-1)!])
        assert.ok(
          Math.hypot(px - 300, py - 300) < 0.1,
          "real-domain endpoint should reach the pole",
        );
    const range = angleRange("0", "0.2");
    assert.equal(
      polarSegments(
        (t) => eq.branches[1](t, {}),
        range,
        POLAR_VIEW,
        600,
        600,
        false,
      ).length,
      0,
    );
    assert.ok(
      polarSegments(
        (t) => eq.branches[1](t, {}),
        range,
        POLAR_VIEW,
        600,
        600,
        true,
        true,
      ).length > 0,
    );
  });
  it("handles degeneracy, repeated roots and cancellation without inventing roots", () => {
    assert.deepEqual(realQuadraticRoots(1, -2, 1), [1, 1]);
    const linear = realQuadraticRoots(0, 2, -6);
    close(linear[0], 3);
    assert.ok(Number.isNaN(linear[1]));
    assert.ok(realQuadraticRoots(0, 0, 0).every(Number.isNaN));
    const roots = realQuadraticRoots(1, 1e8, 1);
    assert.ok(Math.abs(roots[0] + 1e-8) < 1e-16);
  });
  it("rejects unsupported equations instead of drawing a guessed radius", () => {
    for (const lhs of [
      "",
      "2",
      "r^3",
      String.raw`\sin(r)`,
      String.raw`\frac{1}{r}`,
      "r+",
    ])
      assert.throws(() => compilePolarEquation(lhs, "1"), lhs);
    assert.throws(() => compilePolarEquation("r^2", "r+1"));
  });
});
