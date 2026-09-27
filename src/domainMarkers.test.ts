import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compileLatex } from "./latex.ts";
import { compilePolarEquation } from "./polarEquation.ts";
import { angleRange, polarSegments } from "./polar.ts";
import { excludedParameters, finiteOpenPoints } from "./domainMarkers.ts";
describe("undefined finite endpoints and zoomed polar sampling", () => {
  it("detects holes from squared denominator factors without marking positive denominators", () => {
    const range = { start: -2, end: 3 },
      view = { x: 0, y: 0, scale: 50 };
    const hole = compileLatex(String.raw`\frac{(x-0.3)^2}{(x-0.3)^2}`);
    const markers = finiteOpenPoints(
      excludedParameters(hole.domainGuards, range, {}),
      [hole.evaluate],
      range,
      {},
      view,
      600,
      600,
      false,
    );
    assert.equal(markers.length, 1);
    assert.ok(Math.hypot(markers[0][0] - 315, markers[0][1] - 250) < 0.1);
    const continuous = compileLatex(String.raw`\frac{1}{x^2+1}`);
    assert.deepEqual(
      excludedParameters(continuous.domainGuards, range, {}),
      [],
    );
  });
  it("keeps the tangent domain exclusion and marks the missing pole", () => {
    const eq = compilePolarEquation(
        "r^2",
        String.raw`\frac{a}{1+\tan(2\theta)}`,
      ),
      params = { a: 2 },
      range = angleRange("0", "2");
    assert.ok(eq.branches.every((f) => Number.isNaN(f(Math.PI / 4, params))));
    const roots = excludedParameters(eq.domainGuards, range, params);
    assert.ok(roots.some((t) => Math.abs(t - Math.PI / 4) < 1e-9));
    for (const scale of [40, 400, 1200]) {
      const view = { x: 0, y: 0, scale };
      const holes = finiteOpenPoints(
        roots,
        eq.branches,
        range,
        params,
        view,
        800,
        600,
        true,
        true,
      );
      assert.equal(holes.length, 1);
      assert.ok(Math.hypot(holes[0][0] - 400, holes[0][1] - 300) < 0.1);
      const segments = polarSegments(
        (t) => eq.branches[0](t, params),
        range,
        view,
        800,
        600,
        true,
      );
      // All visible ends are true domain boundaries at the pole. A zoom-based
      // curvature threshold must not cut the curve off at a finite radius.
      const visibleEnds = segments
        .flatMap((s) => [s[0], s.at(-1)!])
        .filter(([x, y]) => x > 0 && x < 800 && y > 0 && y < 600);
      for (const [x, y] of visibleEnds)
        assert.ok(
          Math.hypot(x - 400, y - 300) < 0.2 ||
            Math.hypot(x - 400 - Math.sqrt(2) * scale, y - 300) < 0.2,
          `false endpoint at zoom ${scale}`,
        );
    }
  });
  it("marks a removable Cartesian hole but not a vertical asymptote", () => {
    const range = { start: -2, end: 3 },
      view = { x: 0, y: 0, scale: 50 };
    const eq = compileLatex(String.raw`\frac{x^2-1}{x-1}`);
    const roots = excludedParameters(eq.domainGuards, range, {});
    const holes = finiteOpenPoints(
      roots,
      [eq.evaluate],
      range,
      {},
      view,
      600,
      600,
      false,
    );
    assert.equal(holes.length, 1);
    assert.ok(Math.hypot(holes[0][0] - 350, holes[0][1] - 200) < 0.2);
    const pole = compileLatex(String.raw`\frac{1}{x}`);
    assert.deepEqual(
      finiteOpenPoints(
        excludedParameters(pole.domainGuards, range, {}),
        [pole.evaluate],
        range,
        {},
        view,
        600,
        600,
        false,
      ),
      [],
    );
  });
  it("does not mark defined square-root endpoints or hidden negative radii as holes", () => {
    const eq = compilePolarEquation("r^2", String.raw`\cos(2\theta)`);
    assert.equal(eq.domainGuards.length, 0);
    const explicit = compileLatex(String.raw`\sqrt{x}`);
    assert.equal(explicit.domainGuards.length, 0);
    const negative = compilePolarEquation(
        "r",
        String.raw`-\frac{\sin(\theta)}{\theta}`,
      ),
      range = angleRange("0", "1"),
      view = { x: 0, y: 0, scale: 50 };
    const roots = excludedParameters(negative.domainGuards, range, {});
    assert.equal(
      finiteOpenPoints(
        roots,
        negative.branches,
        range,
        {},
        view,
        600,
        600,
        true,
        false,
      ).length,
      0,
    );
    assert.equal(
      finiteOpenPoints(
        roots,
        negative.branches,
        range,
        {},
        view,
        600,
        600,
        true,
        true,
      ).length,
      1,
    );
  });
});
