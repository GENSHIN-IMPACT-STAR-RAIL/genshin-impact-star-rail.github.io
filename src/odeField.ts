import {
  traceIntegralCurve,
  solveFirstOrder,
  type Point,
  type OdeSolution,
} from "./ode.ts";
import { secondOrderSegments, solveSecondOrder } from "./odeSecondOrder.ts";
import { isolatedSingularities, type OdeAsymptote } from "./odeGeometry.ts";
import {
  odeSelection,
  type OdeEntryState,
  type OdeSelection,
} from "./odeLatex.ts";
import type { View } from "./plot.ts";

export const ODE_DENSITIES = [
  { level: 1, label: "很疏", spacing: 124 },
  { level: 2, label: "较疏", spacing: 96 },
  { level: 3, label: "适中", spacing: 72 },
  { level: 4, label: "较密", spacing: 52 },
  { level: 5, label: "很密", spacing: 36 },
] as const;
export type OdeFieldPlot = {
  family: Point[][];
  nearby: Point[][];
  particular: Point[][];
  singularities: Point[];
  asymptotes: OdeAsymptote[];
  selection: OdeSelection;
};
type ScreenPoint = { x: number; y: number; angle: number };

/** Clip and resample existing trajectories; never manufacture new trajectories
 * by interpolating between separate initial-value solutions. */
function clipped(
  lines: Point[][],
  view: View,
  width: number,
  height: number,
): Point[][] {
  const toScreen = ([x, y]: Point): Point => [
    (x - view.x) * view.scale + width / 2,
    height / 2 - (y - view.y) * view.scale,
  ];
  const result: Point[][] = [];
  for (const line of lines) {
    let piece: Point[] = [];
    const flush = () => {
      if (piece.length > 1) result.push(piece);
      piece = [];
    };
    for (let i = 1; i < line.length; i++) {
      const a = toScreen(line[i - 1]),
        b = toScreen(line[i]);
      if (![...a, ...b].every(Number.isFinite)) {
        flush();
        continue;
      }
      const dx = b[0] - a[0],
        dy = b[1] - a[1];
      let lo = 0,
        hi = 1,
        valid = true;
      for (const [p, q] of [
        [-dx, a[0]],
        [dx, width - a[0]],
        [-dy, a[1]],
        [dy, height - a[1]],
      ]) {
        if (p === 0) {
          if (q < 0) valid = false;
          continue;
        }
        const r = q / p;
        if (p < 0) lo = Math.max(lo, r);
        else hi = Math.min(hi, r);
      }
      if (!valid || lo > hi) {
        flush();
        continue;
      }
      const start: Point = [a[0] + lo * dx, a[1] + lo * dy],
        end: Point = [a[0] + hi * dx, a[1] + hi * dy];
      if (
        piece.length &&
        Math.hypot(
          piece[piece.length - 1][0] - start[0],
          piece[piece.length - 1][1] - start[1],
        ) > 5
      )
        flush();
      const count = Math.max(
        1,
        Math.ceil(Math.hypot(end[0] - start[0], end[1] - start[1]) / 4),
      );
      if (!piece.length) piece.push(start);
      for (let k = 1; k <= count; k++)
        piece.push([
          start[0] + ((end[0] - start[0]) * k) / count,
          start[1] + ((end[1] - start[1]) * k) / count,
        ]);
      if (hi < 1) flush();
    }
    flush();
  }
  return result;
}
class Coverage {
  private cells = new Map<string, ScreenPoint[]>();
  private cell: number;
  constructor(cell: number) {
    this.cell = cell;
  }
  near(x: number, y: number, radius: number, angle?: number): boolean {
    const cx = Math.floor(x / this.cell),
      cy = Math.floor(y / this.cell),
      reach = Math.ceil(radius / this.cell);
    for (let i = cx - reach; i <= cx + reach; i++)
      for (let j = cy - reach; j <= cy + reach; j++) {
        for (const p of this.cells.get(`${i},${j}`) ?? []) {
          if (
            (p.x - x) ** 2 + (p.y - y) ** 2 < radius ** 2 &&
            (angle === undefined || Math.abs(Math.sin(angle - p.angle)) < 0.42)
          )
            return true;
        }
      }
    return false;
  }
  add(lines: Point[][]) {
    for (const line of lines)
      for (let i = 0; i < line.length; i += 2) {
        const p = line[i],
          next = line[Math.min(line.length - 1, i + 1)],
          prev = line[Math.max(0, i - 1)];
        const angle = Math.atan2(next[1] - prev[1], next[0] - prev[0]),
          key = `${Math.floor(p[0] / this.cell)},${Math.floor(p[1] / this.cell)}`;
        const bucket = this.cells.get(key) ?? [];
        if (bucket.length < 48) {
          bucket.push({ x: p[0], y: p[1], angle });
          this.cells.set(key, bucket);
        }
      }
  }
}
function addsCoverage(
  lines: Point[][],
  coverage: Coverage,
  gap: number,
  minimum: number,
): boolean {
  let fresh = 0,
    total = 0;
  for (const line of lines)
    for (let i = 1; i < line.length; i++) {
      const p = line[i],
        prev = line[i - 1],
        distance = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      total += distance;
      if (
        !coverage.near(
          p[0],
          p[1],
          gap,
          Math.atan2(p[1] - prev[1], p[0] - prev[0]),
        )
      )
        fresh += distance;
    }
  return (
    fresh >= minimum &&
    (fresh / Math.max(total, 1) > 0.08 || fresh >= minimum * 2.5)
  );
}

function equilibria(
  solution: OdeSolution,
  view: View,
  width: number,
  height: number,
): number[] {
  const vertical = solution.dependent === "y",
    center = vertical ? view.y : view.x,
    span = (vertical ? height : width) / view.scale;
  const uCenter = vertical ? view.x : view.y;
  const f = solution.geometry.factor,
    roots: number[] = [];
  for (let i = 0; i <= 64; i++) {
    let v = center - span / 2 + (span * i) / 64;
    for (let step = 0; step < 15; step++) {
      const value = f(v),
        h = Math.max(1e-6, span * 1e-5);
      if (!Number.isFinite(value)) break;
      const d = (f(v + h) - f(v - h)) / (2 * h);
      if (
        value === 0 ||
        (Number.isFinite(d) && d !== 0 && Math.abs(value / d) < span * 1e-9)
      ) {
        if (
          v >= center - span / 2 &&
          v <= center + span / 2 &&
          roots.every((root) => Math.abs(root - v) * view.scale > 3) &&
          [uCenter - 0.37, uCenter + 0.59].every((u) => {
            const slope = vertical
              ? solution.slope(u, v)
              : solution.slope(v, u);
            return Number.isFinite(slope) && Math.abs(slope) < 1e-7;
          })
        )
          roots.push(v);
        break;
      }
      if (!Number.isFinite(d) || d === 0) break;
      const shift = value / d;
      if (Math.abs(shift) > span) break;
      v -= shift;
    }
  }
  return roots;
}
function deduplicate(lines: OdeAsymptote[]): OdeAsymptote[] {
  const result: OdeAsymptote[] = [];
  for (const line of lines)
    if (
      [line.value, line.slope ?? 0].every(Number.isFinite) &&
      !result.some(
        (other) =>
          other.axis === line.axis &&
          Math.abs(other.value - line.value) < 1e-7 &&
          Math.abs((other.slope ?? 0) - (line.slope ?? 0)) < 1e-7,
      )
    )
      result.push(line);
  return result;
}

export function buildOdeField(
  state: OdeEntryState,
  view: View,
  width: number,
  height: number,
): OdeFieldPlot {
  // A running workspace can retain a solved expression through hot updates.
  // Rehydrate solver metadata without losing the equation or its initial data.
  if (
    state.solution &&
    ((state.solution.order === 1 && !state.solution.geometry) ||
      (state.solution.order === 2 && !state.solution.asymptotes))
  ) {
    state = {
      ...state,
      solution:
        state.solution.order === 1
          ? solveFirstOrder(state.solution.input)
          : solveSecondOrder(state.solution.input),
    };
  }
  const selection = odeSelection(state),
    solution = state.solution;
  const empty: OdeFieldPlot = {
    family: [],
    nearby: [],
    particular: [],
    singularities: [],
    asymptotes: [],
    selection,
  };
  if (!solution || width <= 0 || height <= 0) return empty;
  const spacing = ODE_DENSITIES[(state.density ?? 3) - 1]?.spacing ?? 72;
  const showFamily = !selection.point || state.showFamily !== false;
  const world = ([x, y]: Point): Point => [
    view.x + (x - width / 2) / view.scale,
    view.y - (y - height / 2) / view.scale,
  ];
  const toWorld = (lines: Point[][]) => lines.map((line) => line.map(world));
  const selectedLines =
    solution.order === 2
      ? selection.curve
        ? secondOrderSegments(selection.curve, view, width, height)
        : []
      : selection.point
        ? [traceIntegralCurve(solution, selection.point, view, width, height)]
        : [];
  const particular = clipped(selectedLines, view, width, height);
  const roots =
    solution.order === 1 ? equilibria(solution, view, width, height) : [];
  const asymptotes =
    solution.order === 2
      ? selection.curve && !showFamily
        ? selection.curve.asymptotes
        : [...solution.asymptotes, ...(selection.curve?.asymptotes ?? [])]
      : [
          ...solution.geometry.commonAsymptotes,
          ...(selection.point
            ? solution.geometry.selectedAsymptotes(selection.point)
            : []),
          ...(showFamily
            ? roots
                .filter(solution.geometry.asymptoticRoot)
                .map((value) => ({ axis: solution.dependent, value }))
            : []),
        ];
  const result: OdeFieldPlot = {
    ...empty,
    particular: toWorld(particular),
    singularities:
      solution.order === 1
        ? isolatedSingularities(solution.geometry, view, width, height)
        : [],
    asymptotes: deduplicate(asymptotes),
  };
  if (!showFamily) return result;
  const coverage = new Coverage(Math.max(12, spacing * 0.4));
  coverage.add(particular);
  const nearbyScreen: Point[][] = [],
    familyScreen: Point[][] = [];
  const accept = (lines: Point[][], nearby = false, untrimmed = false) => {
    const screen = clipped(lines, view, width, height);
    // Density chooses whole trajectories. Overlaps must never punch holes in
    // the middle of a solution; only viewport clipping splits visible pieces.
    if (
      screen.length &&
      (untrimmed ||
        addsCoverage(
          screen,
          coverage,
          spacing * (nearby ? 0.05 : 0.4),
          spacing * (nearby ? 0.2 : 0.65),
        ))
    ) {
      (nearby ? nearbyScreen : familyScreen).push(...screen);
      coverage.add(screen);
    }
  };
  // Neighbours share the selected initial abscissa. Perturb both initial data
  // separately for second-order equations before filling the rest of the view.
  if (selection.point) {
    const [x0, y0] = selection.point,
      delta = (spacing / view.scale) * 0.34;
    for (const magnitude of [0.25, 0.5, 1, 2])
      for (const sign of [-1, 1]) {
        const change = sign * magnitude * delta;
        if (solution.order === 1) {
          const point: Point =
            solution.dependent === "y" ? [x0, y0 + change] : [x0 + change, y0];
          if (Number.isFinite(solution.slope(...point)))
            accept(
              [traceIntegralCurve(solution, point, view, width, height)],
              true,
            );
        } else if (selection.curve) {
          const slope0 = selection.curve.derivative(x0);
          for (const [dy, dv] of [
            [change, 0],
            [0, change * 0.6],
          ]) {
            try {
              accept(
                secondOrderSegments(
                  solution.initialCurve(x0, y0 + dy, slope0 + dv),
                  view,
                  width,
                  height,
                ),
                true,
              );
            } catch {
              /* Omit overflowed perturbations. */
            }
          }
        }
      }
  }
  if (solution.order === 1)
    for (const root of roots) {
      if (
        result.asymptotes.some(
          (line) =>
            line.axis === solution.dependent &&
            Math.abs(line.value - root) < 1e-7,
        )
      )
        continue;
      const line: Point[] =
        solution.dependent === "y"
          ? [
              [view.x - width / (2 * view.scale), root],
              [view.x + width / (2 * view.scale), root],
            ]
          : [
              [root, view.y - height / (2 * view.scale)],
              [root, view.y + height / (2 * view.scale)],
            ];
      accept([line], false, true);
    }
  const seeds: { p: Point; rank: number; variant: number }[] = [];
  const columns = Math.max(1, Math.ceil(width / spacing)),
    rows = Math.max(1, Math.ceil(height / spacing));
  for (let pass = 0; pass < 2; pass++)
    for (let ix = 0; ix < columns; ix++)
      for (let iy = 0; iy < rows; iy++) {
        seeds.push({
          p: [
            ((ix + (pass ? 0.23 : 0.5)) * width) / columns,
            ((iy + (pass ? 0.73 : 0.5)) * height) / rows,
          ],
          rank:
            pass * 1e9 +
            ((((ix * 73856093) ^ (iy * 19349663)) >>> 0) % 1000000),
          variant: ((ix + 2 * iy + pass) % 3) - 1,
        });
      }
  seeds.sort((a, b) => a.rank - b.rank);
  let attempts = 0;
  for (const seed of seeds) {
    if (coverage.near(seed.p[0], seed.p[1], spacing * 0.62)) continue;
    if (++attempts > 1000) break;
    const p = world(seed.p);
    if (solution.order === 1) {
      if (Number.isFinite(solution.slope(...p)))
        accept([traceIntegralCurve(solution, p, view, width, height)]);
    } else {
      const baseline = solution.particularValue(p[0]),
        rate = solution.preferredRate;
      let slope =
        solution.particularDerivative(p[0]) + rate * (p[1] - baseline);
      if (selection.curve) {
        const reference = selection.curve.evaluate(p[0]),
          candidate =
            selection.curve.derivative(p[0]) + rate * (p[1] - reference);
        if (
          Number.isFinite(candidate) &&
          Math.abs(candidate) < Math.max(10, Math.abs(slope) * 4)
        )
          slope = candidate;
      }
      slope += seed.variant * 0.45;
      try {
        accept(
          secondOrderSegments(
            solution.initialCurve(p[0], p[1], slope),
            view,
            width,
            height,
          ),
        );
      } catch {
        /* Unrepresentable extreme seeds leave genuine domain gaps. */
      }
    }
  }
  result.family = toWorld(familyScreen);
  result.nearby = toWorld(nearbyScreen);
  return result;
}
