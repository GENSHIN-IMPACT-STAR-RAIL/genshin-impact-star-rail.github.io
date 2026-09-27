import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOdeField, ODE_DENSITIES } from "./odeField.ts";
import { EMPTY_ODE_STATE, solveOdeLatex } from "./odeLatex.ts";
import type { Point } from "./ode.ts";

const view = { x: 2, y: 1, scale: 100 },
  width = 1000,
  height = 600;
const example = () => ({
  ...EMPTY_ODE_STATE,
  solution: solveOdeLatex(String.raw`2y''+5y'+2y=e^{-2x}\sin x`, 2),
  initialX: "2",
  initialY: "1",
  initialSlope: "0.5",
});
const screen = (p: Point): Point => [
  (p[0] - view.x) * view.scale + width / 2,
  height / 2 - (p[1] - view.y) * view.scale,
];
const length = (lines: Point[][]) =>
  lines.reduce(
    (total, line) =>
      total +
      line
        .slice(1)
        .reduce(
          (sum, p, i) => sum + Math.hypot(p[0] - line[i][0], p[1] - line[i][1]),
          0,
        ),
    0,
  );

test("the user's decaying second-order example covers the whole viewport, including formerly empty tiles", () => {
  const plot = buildOdeField(example(), view, width, height);
  const points = [...plot.family, ...plot.nearby, ...plot.particular]
    .flat()
    .map(screen);
  let occupied = 0,
    total = 0,
    upperRight = 0,
    upperRightTotal = 0;
  for (let x = 25; x < width; x += 50)
    for (let y = 25; y < height; y += 50) {
      const found = points.some((p) => Math.hypot(p[0] - x, p[1] - y) < 75);
      total++;
      if (found) occupied++;
      if (x > width * 0.65 && y < height * 0.3) {
        upperRightTotal++;
        if (found) upperRight++;
      }
    }
  assert.ok(occupied / total > 0.94, `coverage ${occupied}/${total}`);
  assert.ok(
    upperRight / upperRightTotal > 0.94,
    `upper-right coverage ${upperRight}/${upperRightTotal}`,
  );
  assert.ok(
    plot.family.some(
      (line) => line.length > 1 && length([line]) * view.scale < width / 2,
    ),
    "partial visible curves are retained",
  );
  assert.ok(
    plot.asymptotes.some(
      (line) => line.axis === "y" && line.value === 0 && line.slope === 0,
    ),
  );
  assert.deepEqual(
    plot.singularities,
    [],
    "regular second-order crossings are not singularities",
  );
  for (const line of [...plot.family, ...plot.nearby, ...plot.particular]) {
    for (const endpoint of [line[0], line[line.length - 1]]) {
      const [x, y] = screen(endpoint);
      assert.ok(
        Math.min(
          Math.abs(x),
          Math.abs(x - width),
          Math.abs(y),
          Math.abs(y - height),
        ) < 1e-5,
        "continuous second-order trajectories may end only at the viewport boundary",
      );
    }
  }
});

test("five fixed densities increase visible coverage, and selected-only mode preserves the selected curve", () => {
  assert.deepEqual(
    ODE_DENSITIES.map((p) => p.level),
    [1, 2, 3, 4, 5],
  );
  const state = example();
  const sparse = buildOdeField({ ...state, density: 1 }, view, width, height);
  const dense = buildOdeField({ ...state, density: 5 }, view, width, height);
  assert.ok(
    length([...dense.family, ...dense.nearby]) >
      length([...sparse.family, ...sparse.nearby]) * 1.4,
  );
  const only = buildOdeField(
    { ...state, showFamily: false },
    view,
    width,
    height,
  );
  assert.equal(only.family.length, 0);
  assert.equal(only.nearby.length, 0);
  assert.deepEqual(only.particular, dense.particular);
  const { asymptotes: _oldMetadata, ...legacySolution } = state.solution;
  const restored = buildOdeField(
    { ...state, solution: legacySolution as typeof state.solution },
    view,
    width,
    height,
  );
  assert.deepEqual(
    restored.particular,
    dense.particular,
    "updating an already-open solved workspace retains its selected curve",
  );
  assert.ok(
    buildOdeField(
      { ...state, showFamily: false, initialSlope: "" },
      view,
      width,
      height,
    ).family.length > 0,
    "incomplete initial data still show the family",
  );
});

test("nearby first-order curves come from small initial perturbations around the selected solution", () => {
  const plot = buildOdeField(
    {
      ...EMPTY_ODE_STATE,
      solution: solveOdeLatex(String.raw`y'=-y`),
      initialX: "0",
      initialY: "1",
    },
    { x: 0, y: 0, scale: 80 },
    800,
    600,
  );
  assert.ok(plot.nearby.length >= 4);
  const constants = plot.nearby.map((line) =>
    line.map(([x, y]) => y * Math.exp(x)),
  );
  for (const values of constants) {
    assert.ok(Math.min(...values) > 0.3 && Math.max(...values) < 1.7);
    assert.ok(Math.max(...values) - Math.min(...values) < 0.015);
  }
  assert.ok(
    constants.some((values) => values[0] < 1) &&
      constants.some((values) => values[0] > 1),
  );
});

test("features distinguish singular points, excluded lines, equilibria and genuine asymptotes", () => {
  const v = { x: 0, y: 0, scale: 80 };
  const field = (latex: string, initialX = "", initialY = "") =>
    buildOdeField(
      {
        ...EMPTY_ODE_STATE,
        solution: solveOdeLatex(latex),
        initialX,
        initialY,
      },
      v,
      640,
      480,
    );
  const ratio = field(String.raw`y'=\frac{y}{x}`);
  assert.equal(ratio.singularities.length, 1);
  assert.ok(Math.hypot(...ratio.singularities[0]) < 1e-6);
  assert.equal(ratio.asymptotes.length, 0);
  const scaled = field(String.raw`y'=\frac{10^{-12}y}{x}`);
  assert.equal(
    scaled.singularities.length,
    1,
    "tiny coefficients must not turn an excluded line into a row of singular points",
  );
  const logarithm = field(String.raw`y'=\frac1x`);
  assert.equal(logarithm.singularities.length, 0);
  assert.ok(
    logarithm.asymptotes.some((line) => line.axis === "x" && line.value === 0),
  );
  const circle = field(String.raw`y'=-\frac{x}{y}`);
  assert.equal(circle.singularities.length, 1);
  assert.equal(circle.asymptotes.length, 0);
  assert.equal(
    field(String.raw`y'=xy`).asymptotes.length,
    0,
    "an equilibrium need not be an asymptote",
  );
  assert.ok(
    field(String.raw`y'=-xy`).asymptotes.some(
      (line) => line.axis === "y" && Math.abs(line.value) < 1e-6,
    ),
  );
  const blowup = field(String.raw`y'=y^2`, "0", "1");
  assert.ok(
    blowup.asymptotes.some(
      (line) => line.axis === "x" && Math.abs(line.value - 1) < 1e-8,
    ),
  );
});

test("second-order limits are based on characteristic modes, not apparent visual crossings", () => {
  const v = { x: 0, y: 0, scale: 80 };
  const oscillator = buildOdeField(
    { ...EMPTY_ODE_STATE, solution: solveOdeLatex(String.raw`y''+y=0`, 2) },
    v,
    640,
    480,
  );
  assert.deepEqual(oscillator.asymptotes, []);
  assert.deepEqual(oscillator.singularities, []);
  const forced = buildOdeField(
    { ...EMPTY_ODE_STATE, solution: solveOdeLatex(String.raw`y''+2y'+y=x`, 2) },
    v,
    640,
    480,
  );
  assert.ok(
    forced.asymptotes.some((line) => line.slope === 1 && line.value === -2),
  );
  const selected = buildOdeField(
    {
      ...EMPTY_ODE_STATE,
      solution: solveOdeLatex(String.raw`y''-y=0`, 2),
      initialX: "0",
      initialY: "1",
      initialSlope: "-1",
      showFamily: false,
    },
    v,
    640,
    480,
  );
  assert.ok(
    selected.asymptotes.some((line) => line.axis === "y" && line.value === 0),
  );
});
