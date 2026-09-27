import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compileLatex } from "./latex.ts";
import {
  angleRange,
  parseAngleMultiple,
  convertAngleInput,
  formatAngleInput,
  polarPoint,
  polarSegments,
  POLAR_VIEW,
  drawPolarGrid,
} from "./polar.ts";
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
describe("polar coordinates", () => {
  it("draws only a solid positive initial line and a dashed negative extension without a grid", () => {
    const strokes: { points: number[][]; dash: number[] }[] = [];
    const labels: string[] = [];
    let points: number[][] = [],
      dash: number[] = [];
    const ctx = {
      save() {},
      restore() {},
      beginPath() {
        points = [];
      },
      setLineDash(value: number[]) {
        dash = [...value];
      },
      moveTo(x: number, y: number) {
        points.push([x, y]);
      },
      lineTo(x: number, y: number) {
        points.push([x, y]);
      },
      stroke() {
        strokes.push({ points: [...points], dash: [...dash] });
      },
      fillText(text: string) {
        labels.push(text);
      },
    } as unknown as CanvasRenderingContext2D;
    drawPolarGrid(ctx, { x: 0, y: 0, scale: 40 }, 800, 600, false);
    assert.deepEqual(strokes, [
      {
        points: [
          [0, 300],
          [400, 300],
        ],
        dash: [4, 5],
      },
      {
        points: [
          [400, 300],
          [800, 300],
        ],
        dash: [],
      },
    ]);
    assert.ok(labels.includes("θ = 0"));
    strokes.length = 0;
    labels.length = 0;
    drawPolarGrid(ctx, { x: 20, y: 0, scale: 40 }, 800, 600, false);
    assert.deepEqual(strokes, [
      {
        points: [
          [0, 300],
          [800, 300],
        ],
        dash: [],
      },
    ]);
    strokes.length = 0;
    labels.length = 0;
    drawPolarGrid(ctx, { x: -20, y: 0, scale: 40 }, 800, 600, false);
    assert.deepEqual(strokes, [
      {
        points: [
          [0, 300],
          [800, 300],
        ],
        dash: [4, 5],
      },
    ]);
    assert.ok(!labels.includes("θ = 0"));
  });
  it("keeps the same physical interval across π multiples, radians and degrees", () => {
    const pi = angleRange("-1/2", "1/4", "pi"),
      deg = angleRange("-90", "45", "deg");
    close(pi.start, deg.start);
    close(pi.end, deg.end);
    close(angleRange("0", "1", "rad").end, 1);
    close(angleRange("0", "1/4", "rad").end, 0.25);
    assert.equal(convertAngleInput("1/4", "pi", "deg"), "45");
    assert.equal(convertAngleInput("45", "deg", "pi"), "1/4");
    const raw = convertAngleInput("1/4", "pi", "rad");
    close(Number(raw), Math.PI / 4);
    assert.equal(convertAngleInput(raw, "rad", "pi"), "1/4");
    assert.equal(formatAngleInput(6 * Math.PI, "deg"), "1080");
    const numeric = convertAngleInput("1.5", "rad", "deg");
    close(angleRange("0", numeric, "deg").end, 1.5);
    assert.throws(() => angleRange("0", "7201", "deg"));
    assert.throws(() => angleRange("0", "126", "rad"));
  });
  it("accepts fractional π coefficients and rejects invalid fractions", () => {
    close(angleRange("-1/2", "3/4").start, -Math.PI / 2);
    close(angleRange("-1/2", "3/4").end, (3 * Math.PI) / 4);
    close(parseAngleMultiple(" 1 / 4 "), 0.25);
    close(parseAngleMultiple("−3⁄2"), -1.5);
    close(parseAngleMultiple("1.5/2"), 0.75);
    close(parseAngleMultiple("2e-1"), 0.2);
    for (const value of [
      "1/0",
      "0/0",
      "1/",
      "1/2/3",
      "1+1",
      "1/Infinity",
      "1e309",
    ])
      assert.throws(() => parseAngleMultiple(value));
    assert.throws(() => angleRange("3/4", "1/2"));
    assert.throws(() => angleRange("0", "81/2"));
  });
  it("isolates negative-radius segments for dashed rendering", () => {
    const range = angleRange("0", "2");
    assert.equal(
      polarSegments(() => 2, range, POLAR_VIEW, 600, 600, true, true).length,
      0,
    );
    assert.ok(
      polarSegments(() => -2, range, POLAR_VIEW, 600, 600, true, true).length >
        0,
    );
    const points = polarSegments(
      (t) => 3 * Math.cos(4 * t),
      range,
      POLAR_VIEW,
      800,
      800,
      true,
      true,
    ).flat();
    const tips = new Set<number>();
    for (const [px, py] of points) {
      const x = (px - 400) / POLAR_VIEW.scale,
        y = (400 - py) / POLAR_VIEW.scale;
      if (Math.hypot(x, y) > 2.99)
        tips.add((Math.round(Math.atan2(y, x) / (Math.PI / 4)) + 8) % 8);
    }
    assert.deepEqual([...tips].sort(), [1, 3, 5, 7]);
  });
  it("uses theta as the independent variable and preserves Cartesian theta parameters", () => {
    const polar = compileLatex(String.raw`r=a\cos(k\theta)`, "θ");
    assert.deepEqual(polar.params, ["a", "k"]);
    close(polar.evaluate(Math.PI / 4, { a: 3, k: 4, θ: 99 }), -3);
    assert.deepEqual(compileLatex(String.raw`\theta x`).params, ["θ"]);
    assert.deepEqual(
      compileLatex(
        String.raw`\frac{\mathrm{d}}{\mathrm{d}\theta}\sin(\theta)`,
        "θ",
      ).params,
      [],
    );
  });
  it("plots negative radii in the opposite direction", () => {
    const [x, y] = polarPoint(-2, Math.PI / 2);
    close(x, 0);
    close(y, -2);
  });
  it("omits negative radii without joining across the omitted interval", () => {
    const range = angleRange("0", "2");
    assert.equal(
      polarSegments(() => -2, range, POLAR_VIEW, 800, 800, false).length,
      0,
    );
    assert.ok(
      polarSegments(() => -2, range, POLAR_VIEW, 800, 800, true).length > 0,
    );
    const fn = (t: number) =>
      t > Math.PI / 2 && t < (3 * Math.PI) / 2 ? -2 : 2;
    const lines = polarSegments(fn, range, POLAR_VIEW, 800, 800, false);
    assert.equal(lines.length, 2);
    for (const [x] of lines.flat()) assert.ok(x >= 400 - 1e-8);
  });
  it("draws four rather than eight rose petals with negative radii hidden", () => {
    const points = polarSegments(
      (t) => 3 * Math.cos(4 * t),
      angleRange("0", "2"),
      POLAR_VIEW,
      800,
      800,
      false,
    ).flat();
    const tips = new Set<number>();
    for (const [px, py] of points) {
      const x = (px - 400) / POLAR_VIEW.scale,
        y = (400 - py) / POLAR_VIEW.scale;
      if (Math.hypot(x, y) > 2.99)
        tips.add((Math.round(Math.atan2(y, x) / (Math.PI / 4)) + 8) % 8);
    }
    assert.deepEqual([...tips].sort(), [0, 2, 4, 6]);
  });
  it("draws a complete circle and keeps partial arcs open", () => {
    const view = { x: 0, y: 0, scale: 50 };
    const lines = polarSegments(() => 2, angleRange("0", "2"), view, 600, 600);
    assert.equal(lines.length, 1);
    for (const [x, y] of lines[0]) close(Math.hypot(x - 300, y - 300), 100);
    close(lines[0][0][0], lines[0].at(-1)![0]);
    close(lines[0][0][1], lines[0].at(-1)![1]);
    const arc = polarSegments(
      () => 2,
      angleRange("0", "0.5"),
      view,
      600,
      600,
    )[0];
    close(arc[0][0], 400);
    close(arc.at(-1)![0], 300);
    close(arc.at(-1)![1], 200);
  });
  it("handles all eight petals when the rose radius changes sign", () => {
    const fn = compileLatex(String.raw`3\cos(4\theta)`, "θ");
    const points = polarSegments(
      (t) => fn.evaluate(t, {}),
      angleRange("0", "2"),
      POLAR_VIEW,
      800,
      800,
    ).flat();
    const tips = new Set<number>();
    for (const [px, py] of points) {
      const x = (px - 400) / POLAR_VIEW.scale,
        y = (400 - py) / POLAR_VIEW.scale;
      if (Math.hypot(x, y) > 2.99)
        tips.add((Math.round(Math.atan2(y, x) / (Math.PI / 4)) + 8) % 8);
    }
    assert.equal(tips.size, 8);
  });
  it("breaks curves at poles instead of drawing across the canvas", () => {
    const lines = polarSegments(
      (t) => 1 / Math.cos(t),
      angleRange("0", "2"),
      POLAR_VIEW,
      600,
      600,
    );
    assert.ok(lines.length > 1);
    for (const line of lines)
      for (let i = 1; i < line.length; i++) {
        close(line[i][0], 300 + POLAR_VIEW.scale);
        const a = line[i - 1][1],
          b = line[i][1];
        assert.ok(!((a < 0 && b > 600) || (b < 0 && a > 600)));
      }
  });
  it("validates ranges and supports multiple turns", () => {
    close(angleRange("-1", "6").end, 6 * Math.PI);
    for (const [a, b] of [
      ["", "2"],
      ["0", ""],
      ["2", "1"],
      ["0", "0"],
      ["0", "Infinity"],
      ["0", "41"],
    ])
      assert.throws(() => angleRange(a, b));
  });
});
