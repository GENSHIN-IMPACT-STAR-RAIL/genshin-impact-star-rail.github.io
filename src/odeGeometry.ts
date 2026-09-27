import { parse, simplify, derivative, type MathNode } from "mathjs/number";
import type { Point } from "./ode.ts";
import type { View } from "./plot.ts";

export type OdeAsymptote = { axis: "x" | "y"; slope?: number; value: number };
export type FirstOrderGeometry = {
  vector: (x: number, y: number) => Point;
  factor: (v: number) => number;
  asymptoticRoot: (v: number) => boolean;
  commonAsymptotes: OdeAsymptote[];
  selectedAsymptotes: (point: Point) => OdeAsymptote[];
};
const has = (node: MathNode, name: string) => {
  let result = false;
  node.traverse((n) => {
    if (n.type === "SymbolNode" && (n as any).name === name) result = true;
  });
  return result;
};
const simple = (s: string) => simplify(parse(s));
const number = (node: MathNode, scope: Record<string, number> = {}) => {
  try {
    const n = node.compile().evaluate(scope);
    return typeof n === "number" && Number.isFinite(n) ? n : NaN;
  } catch {
    return NaN;
  }
};
const evaluator = (node: MathNode) => {
  const compiled = node.compile();
  return (x: number, y: number) => {
    try {
      const n = compiled.evaluate({ x, y });
      return typeof n === "number" && Number.isFinite(n) ? n : NaN;
    } catch {
      return NaN;
    }
  };
};

function fraction(node: MathNode, depth = 0): [MathNode, MathNode] {
  if (depth > 20) return [node, parse("1")];
  if (node.type === "ParenthesisNode")
    return fraction((node as any).content, depth + 1);
  if (node.type !== "OperatorNode") return [node, parse("1")];
  const { op, args } = node as any as { op: string; args: MathNode[] };
  if ((op === "-" || op === "+") && args.length === 1) {
    const [n, d] = fraction(args[0], depth + 1);
    return [simple(`${op}(${n})`), d];
  }
  if (["+", "-", "*", "/"].includes(op) && args.length === 2) {
    const [a, b] = fraction(args[0], depth + 1),
      [c, d] = fraction(args[1], depth + 1);
    if (op === "*") return [simple(`(${a})*(${c})`), simple(`(${b})*(${d})`)];
    if (op === "/") return [simple(`(${a})*(${d})`), simple(`(${b})*(${c})`)];
    return [simple(`(${a})*(${d})${op}(${c})*(${b})`), simple(`(${b})*(${d})`)];
  }
  if (op === "^" && !has(args[1], "x") && !has(args[1], "y")) {
    const n = number(args[1]);
    if (Number.isInteger(n) && Math.abs(n) <= 8) {
      const [a, b] = fraction(args[0], depth + 1);
      return n < 0
        ? [simple(`(${b})^${-n}`), simple(`(${a})^${-n}`)]
        : [simple(`(${a})^${n}`), simple(`(${b})^${n}`)];
    }
  }
  return [node, parse("1")];
}
function polynomialLeading(
  node: MathNode,
  variable: string,
): { degree: number; coefficient: number } | null {
  const degreeOf = (n: MathNode): number => {
    if (!has(n, variable)) return 0;
    if (n.type === "ParenthesisNode") return degreeOf((n as any).content);
    if (n.type === "SymbolNode") return 1;
    if (n.type !== "OperatorNode") return Infinity;
    const { op, args } = n as any as { op: string; args: MathNode[] };
    if (op === "+" || op === "-") return Math.max(...args.map(degreeOf));
    if (op === "*") return args.reduce((sum, arg) => sum + degreeOf(arg), 0);
    if (op === "/" && !has(args[1], variable)) return degreeOf(args[0]);
    if (op === "^" && !has(args[1], variable)) {
      const exponent = number(args[1]);
      if (Number.isInteger(exponent) && exponent >= 0)
        return degreeOf(args[0]) * exponent;
    }
    return Infinity;
  };
  const degree = degreeOf(node);
  if (!Number.isFinite(degree) || degree > 8) return null;
  let d = node,
    factorial = 1;
  for (let i = 1; i <= degree; i++) {
    d = derivative(d, variable);
    factorial *= i;
  }
  const coefficient = number(d) / factorial;
  return Number.isFinite(coefficient) ? { degree, coefficient } : null;
}
function reciprocal(
  node: MathNode,
  variable: string,
): { root: number; residue: number } | null {
  const [n, d] = fraction(node),
    slope = simplify(derivative(d, variable));
  if (has(n, variable) || has(slope, variable)) return null;
  const a = number(slope),
    b = number(d, { [variable]: 0 }),
    c = number(n);
  return [a, b, c].every(Number.isFinite) && a !== 0 && c !== 0
    ? { root: -b / a, residue: c / a }
    : null;
}

export function firstOrderGeometry(
  field: MathNode,
  u: "x" | "y",
  v: "x" | "y",
  separated: [MathNode, MathNode] | null,
): FirstOrderGeometry {
  const [n, d] = fraction(field),
    num = evaluator(n),
    den = evaluator(d);
  const vector = (x: number, y: number): Point =>
    u === "x" ? [den(x, y), num(x, y)] : [num(x, y), den(x, y)];
  const factorNode = separated?.[1] ?? parse("1"),
    factorCompiled = factorNode.compile();
  const factor = (value: number) => {
    try {
      return Number(factorCompiled.evaluate({ [v]: value }));
    } catch {
      return NaN;
    }
  };
  const growth: number[] = [];
  if (separated && has(factorNode, v)) {
    const lead = polynomialLeading(separated[0], u);
    if (lead && lead.coefficient !== 0)
      growth.push(
        Math.sign(lead.coefficient),
        Math.sign(lead.coefficient) * (-1) ** (lead.degree + 1),
      );
    else {
      const rec = reciprocal(separated[0], u);
      if (rec) growth.push(Math.sign(rec.residue));
      else {
        const logDerivative = simple(
          `(${derivative(separated[0], u)})/(${separated[0]})`,
        );
        if (!has(logDerivative, u)) {
          const rate = number(logDerivative),
            amplitude = number(separated[0], { [u]: 0 });
          if (rate && Number.isFinite(amplitude))
            growth.push(Math.sign(amplitude / rate));
        }
      }
    }
  }
  const derivatives: MathNode[] = [];
  const asymptoticRoot = (root: number) => {
    if (!growth.length || Math.abs(factor(root)) > 1e-8) return false;
    for (let i = 0; i < 6; i++) {
      if (!derivatives[i])
        derivatives[i] = simplify(
          derivative(i === 0 ? factorNode : derivatives[i - 1], v),
        );
      const a = number(derivatives[i], { [v]: root });
      if (!Number.isFinite(a)) return false;
      if (Math.abs(a) > 1e-9)
        return (i + 1) % 2 === 0 || growth.some((sign) => sign * a < 0);
    }
    return false;
  };
  const commonAsymptotes: OdeAsymptote[] = [];
  if (!has(field, v)) {
    const pole = reciprocal(field, u);
    if (pole) commonAsymptotes.push({ axis: u, value: pole.root });
  }
  const coefficient = simplify(derivative(field, v));
  const forcing = simplify(
    field.transform((node) =>
      node.type === "SymbolNode" && (node as any).name === v
        ? parse("0")
        : node,
    ),
  );
  const homogeneousPole =
    !has(coefficient, v) && number(forcing) === 0
      ? reciprocal(coefficient, u)
      : null;
  const quadratic = simple(`(${field})/(${v}^2)`);
  const k = !has(quadratic, u) && !has(quadratic, v) ? number(quadratic) : NaN;
  const selectedAsymptotes = (point: Point) => {
    const independent = point[u === "x" ? 0 : 1],
      dependent = point[v === "y" ? 1 : 0];
    const lines: OdeAsymptote[] = [];
    if (dependent !== 0 && homogeneousPole && homogeneousPole.residue < 0)
      lines.push({ axis: u, value: homogeneousPole.root });
    if (dependent !== 0 && Number.isFinite(k) && k !== 0)
      lines.push({ axis: u, value: independent + 1 / (k * dependent) });
    return lines;
  };
  return {
    vector,
    factor,
    asymptoticRoot,
    commonAsymptotes,
    selectedAsymptotes,
  };
}

/** Locate isolated simultaneous zeros of the desingularized planar field.
 * Neither ordinary crossings nor a whole excluded line qualify as black dots. */
export function isolatedSingularities(
  geometry: FirstOrderGeometry,
  view: View,
  width: number,
  height: number,
): Point[] {
  const xMin = view.x - width / (2 * view.scale),
    yMin = view.y - height / (2 * view.scale);
  const dx = width / view.scale / 16,
    dy = height / view.scale / 16,
    epsilon = Math.max(1e-7, Math.min(dx, dy) * 1e-4);
  const roots: Point[] = [];
  for (let ix = 0; ix <= 16; ix++)
    for (let iy = 0; iy <= 16; iy++) {
      let x = xMin + ix * dx,
        y = yMin + iy * dy;
      for (let n = 0; n < 24; n++) {
        const [a, b] = geometry.vector(x, y);
        if (!Number.isFinite(a + b)) break;
        const xp = geometry.vector(x + epsilon, y),
          xm = geometry.vector(x - epsilon, y),
          yp = geometry.vector(x, y + epsilon),
          ym = geometry.vector(x, y - epsilon);
        const ax = (xp[0] - xm[0]) / (2 * epsilon),
          bx = (xp[1] - xm[1]) / (2 * epsilon),
          ay = (yp[0] - ym[0]) / (2 * epsilon),
          by = (yp[1] - ym[1]) / (2 * epsilon),
          det = ax * by - ay * bx;
        const normA = Math.hypot(ax, ay),
          normB = Math.hypot(bx, by);
        if (
          (a === 0 || (normA > 0 && Math.abs(a) / normA < epsilon * 0.001)) &&
          (b === 0 || (normB > 0 && Math.abs(b) / normB < epsilon * 0.001))
        ) {
          const values = Array.from({ length: 8 }, (_, i) => {
            const t = (i * Math.PI) / 4;
            return geometry.vector(
              x + epsilon * Math.cos(t),
              y + epsilon * Math.sin(t),
            );
          });
          const scaleA = Math.max(...values.map((v) => Math.abs(v[0]))),
            scaleB = Math.max(...values.map((v) => Math.abs(v[1])));
          const ring = values.every(
            (v) =>
              Math.hypot(v[0] / (scaleA || 1), v[1] / (scaleB || 1)) > 1e-4,
          );
          if (
            ring &&
            Math.abs(x - view.x) <= width / (2 * view.scale) &&
            Math.abs(y - view.y) <= height / (2 * view.scale) &&
            roots.every((p) => Math.hypot(p[0] - x, p[1] - y) * view.scale > 5)
          )
            roots.push([x, y]);
          break;
        }
        if (
          !Number.isFinite(det) ||
          Math.abs(det) < 1e-12 * normA * normB ||
          det === 0
        )
          break;
        const sx = (a * by - b * ay) / det,
          sy = (ax * b - bx * a) / det;
        if (Math.abs(sx) > 4 * dx || Math.abs(sy) > 4 * dy) break;
        x -= sx;
        y -= sy;
      }
    }
  return roots.slice(0, 60);
}
