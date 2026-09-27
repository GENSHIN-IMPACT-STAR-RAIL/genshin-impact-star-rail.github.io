import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  compileImplicit,
  compileParametric,
  implicitSegments,
  parametricSegments,
  parameterRange,
  compileCartesianEntry,
} from "./cartesian.ts";
const view = { x: 0, y: 0, scale: 50 };
const close = (a: number, b: number, tol = 1e-5) =>
  assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
describe("mixed Cartesian expression entries", () => {
  it("compiles explicit, implicit and parametric rows together using shared parameters", () => {
    const entries = [
      compileCartesianEntry({ kind: "explicit", value: "ax" }),
      compileCartesianEntry({ kind: "implicit", value: "x^2+y^2=a^2" }),
      compileCartesianEntry({
        kind: "parametric",
        left: "a\\cos(t)",
        value: "a\\sin(t)",
        tStart: "0",
        tEnd: "pi/2",
      }),
    ];
    close(entries[0].fn.evaluate(2, { a: 3 }), 6);
    close(entries[1].fn.implicit!(3, 0, { a: 3 }), 0);
    close(entries[2].fn.parametric!(Math.PI / 2, { a: 3 })[1], 3);
    assert.equal(entries[0].parameterInterval, null);
    assert.equal(entries[1].parameterInterval, null);
    close(entries[2].parameterInterval!.end, Math.PI / 2);
  });
  it("keeps parameter intervals independent and validates each row", () => {
    const first = compileCartesianEntry({
      kind: "parametric",
      left: "t",
      value: "t^2",
      tStart: "-2",
      tEnd: "2",
    });
    const second = compileCartesianEntry({
      kind: "parametric",
      left: "t",
      value: "-t",
      tStart: "0",
      tEnd: "5",
    });
    assert.deepEqual(first.parameterInterval, { start: -2, end: 2 });
    assert.deepEqual(second.parameterInterval, { start: 0, end: 5 });
    assert.throws(() =>
      compileCartesianEntry({
        kind: "parametric",
        left: "t",
        value: "t",
        tStart: "1",
        tEnd: "0",
      }),
    );
    assert.throws(() =>
      compileCartesianEntry({ kind: "explicit", value: "x-y^2" }),
    );
    assert.ok(
      compileCartesianEntry({ kind: "implicit", value: "y=x-y^2" }).fn.implicit,
    );
  });
});
describe("implicit equations", () => {
  it("keeps a closed circle connected at viewport-dependent grid intersections", () => {
    const f = compileImplicit("x^2+y^2=9");
    const lines = implicitSegments(
      (x, y) => f.implicit!(x, y, {}),
      { x: 0, y: 0, scale: 52 },
      944,
      720,
    );
    const counts = new Map<string, number>();
    for (const line of lines)
      for (const p of line) {
        const key = p.map((n) => n.toFixed(6)).join(",");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    assert.ok(counts.size > 50);
    for (const count of counts.values())
      assert.equal(count, 2, "closed contour must not have isolated endpoints");
  });
  it("reserves both coordinates, collects remaining parameters and draws a circle", () => {
    const f = compileImplicit("x^2+y^2=a^2");
    assert.deepEqual(f.params, ["a"]);
    const lines = implicitSegments(
      (x, y) => f.implicit!(x, y, { a: 2 }),
      view,
      400,
      400,
    );
    assert.ok(lines.length > 60);
    for (const [px, py] of lines.flat())
      close(((px - 200) / 50) ** 2 + ((200 - py) / 50) ** 2, 4, 1e-5);
  });
  it("draws vertical lines and both branches of xy=1", () => {
    const vertical = compileImplicit("x=1");
    const line = implicitSegments(
      (x, y) => vertical.implicit!(x, y, {}),
      view,
      400,
      400,
    ).flat();
    assert.ok(line.length > 20);
    for (const [px] of line) close(px, 250, 1e-4);
    const hyperbola = compileImplicit("xy=1");
    const points = implicitSegments(
      (x, y) => hyperbola.implicit!(x, y, {}),
      view,
      400,
      400,
    ).flat();
    assert.ok(points.some(([x]) => x > 200) && points.some(([x]) => x < 200));
    for (const [px, py] of points)
      close(((px - 200) * (200 - py)) / 2500, 1, 1e-5);
  });
  it("does not mistake a sign change across an asymptote for a contour", () => {
    const f = compileImplicit(String.raw`\frac{1}{x-0.13}=0`);
    assert.equal(
      implicitSegments((x, y) => f.implicit!(x, y, {}), view, 400, 400).length,
      0,
    );
  });
  it("handles squared zero sets and rejects inequalities and spatially constant equations", () => {
    const f = compileImplicit("(x^2+y^2-4)^2=0");
    assert.ok(
      implicitSegments((x, y) => f.implicit!(x, y, {}), view, 400, 400).length >
        60,
    );
    for (const latex of ["a=2", "x<y", "x="])
      assert.throws(() => compileImplicit(latex));
  });
});
describe("parametric equations", () => {
  it("parses numeric, fractional and π-based parameter limits", () => {
    close(parameterRange("0", "2π").end, 2 * Math.PI);
    close(parameterRange("-pi/2", "3*pi/2").start, -Math.PI / 2);
    close(parameterRange("1/2", "2").start, 0.5);
    close(parameterRange("0", "1e-3").end, 0.001);
    for (const [a, b] of [
      ["", "2"],
      ["0", "1/0"],
      ["t", "2"],
      ["2", "1"],
      ["0", "1001"],
    ])
      assert.throws(() => parameterRange(a, b));
  });
  it("evaluates both coordinates and keeps t out of parameter controls", () => {
    const f = compileParametric(String.raw`a\cos(t)`, String.raw`b\sin(t)`);
    assert.deepEqual(f.params, ["a", "b"]);
    const p = f.parametric!(Math.PI / 2, { a: 3, b: 2, t: 99 });
    close(p[0], 0);
    close(p[1], 2);
    const lines = parametricSegments(
      (t) => f.parametric!(t, { a: 3, b: 2 }),
      parameterRange("0", "2π"),
      view,
      500,
      400,
    );
    assert.equal(lines.length, 1);
    for (const [px, py] of lines[0])
      close(((px - 250) / 150) ** 2 + ((200 - py) / 100) ** 2, 1);
  });
  it("preserves open endpoints and disconnects undefined points", () => {
    const arc = parametricSegments(
      (t) => [Math.cos(t), Math.sin(t)],
      parameterRange("0", "pi/2"),
      view,
      400,
      400,
    );
    close(arc[0][0][0], 250);
    close(arc[0].at(-1)![0], 200);
    close(arc[0].at(-1)![1], 150);
    const broken = parametricSegments(
      (t) => [t, 1 / t],
      parameterRange("-1", "1"),
      view,
      400,
      400,
    );
    assert.ok(broken.length >= 2);
    for (const line of broken)
      for (let i = 1; i < line.length; i++)
        assert.ok(!(line[i - 1][0] < 200 && line[i][0] > 200));
  });
});
