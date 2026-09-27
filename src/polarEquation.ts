import {
  compileLatex,
  compileMathTree,
  computeEngine,
  type Expr,
} from "./latex.ts";
import type { Parameters } from "./math";
type Polynomial = Expr[];
const containsR = (node: Expr): boolean =>
  node === "r" ||
  (Array.isArray(node)
    ? node.slice(1).some(containsR)
    : typeof node === "object" && node !== null && node.sym === "r");
const add = (a: Expr, b: Expr): Expr =>
  a === 0
    ? b
    : b === 0
      ? a
      : typeof a === "number" && typeof b === "number"
        ? a + b
        : ["Add", a, b];
const mul = (a: Expr, b: Expr): Expr =>
  a === 0 || b === 0
    ? 0
    : a === 1
      ? b
      : b === 1
        ? a
        : typeof a === "number" && typeof b === "number"
          ? a * b
          : ["Multiply", a, b];
function sum(a: Polynomial, b: Polynomial): Polynomial {
  return Array.from({ length: Math.max(a.length, b.length) }, (_, i) =>
    add(a[i] ?? 0, b[i] ?? 0),
  );
}
function product(a: Polynomial, b: Polynomial): Polynomial {
  const out: Polynomial = Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++)
      out[i + j] = add(out[i + j], mul(a[i], b[j]));
  while (out.length > 1 && out.at(-1) === 0) out.pop();
  if (out.length > 3) throw new Error("目前支持关于 r 的一次、二次表达式");
  return out;
}
function polynomial(node: Expr, depth = 0): Polynomial {
  if (depth > 24) throw new Error("左侧公式过于复杂");
  if (
    node === "r" ||
    (typeof node === "object" && !Array.isArray(node) && node?.sym === "r")
  )
    return [0, 1];
  if (!containsR(node)) return [node];
  if (!Array.isArray(node)) throw new Error("请检查左侧 r 的表达式");
  const [op, ...args] = node;
  const walk = (n: Expr) => polynomial(n, depth + 1);
  switch (op) {
    case "Add":
      return args.map(walk).reduce(sum, [0]);
    case "Subtract":
      if (args.length === 2)
        return sum(
          walk(args[0]),
          walk(args[1]).map((n) => mul(-1, n)),
        );
      break;
    case "Negate":
      return walk(args[0]).map((n) => mul(-1, n));
    case "Multiply":
    case "InvisibleOperator":
      return args.map(walk).reduce(product, [1]);
    case "Delimiter":
      return walk(args[0]);
    case "Square": {
      const p = walk(args[0]);
      return product(p, p);
    }
    case "Power": {
      const n = args[1];
      if (n === 0) return [1];
      if (n === 1) return walk(args[0]);
      if (n === 2) {
        const p = walk(args[0]);
        return product(p, p);
      }
      break;
    }
    case "Divide":
      if (args.length === 2 && !containsR(args[1]))
        return walk(args[0]).map((n) => ["Divide", n, args[1]]);
      break;
  }
  throw new Error("目前支持关于 r 的一次、二次表达式，如 r²、2r+1 或 ar²+br+c");
}

/** Returns ordered real roots; absent branches are NaN, never complex or abs(). */
export function realQuadraticRoots(
  a: number,
  b: number,
  c: number,
): [number, number] {
  if (![a, b, c].every(Number.isFinite)) return [NaN, NaN];
  if (a === 0) return b === 0 ? [NaN, NaN] : [-c / b, NaN];
  const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c));
  a /= scale;
  b /= scale;
  c /= scale;
  let d = b * b - 4 * a * c;
  if (d < 0 && d >= -32 * Number.EPSILON * (b * b + 4 * Math.abs(a * c))) d = 0;
  if (d < 0) return [NaN, NaN];
  if (d === 0) return [-b / (2 * a), -b / (2 * a)];
  const q = -0.5 * (b + (b >= 0 ? 1 : -1) * Math.sqrt(d));
  const r1 = q / a,
    r2 = c / q;
  return [Math.max(r1, r2), Math.min(r1, r2)];
}

export function compilePolarEquation(left: string, right: string) {
  if (!left.trim()) throw new Error("请在左侧输入 r 的表达式");
  if (left.length > 400) throw new Error("左侧公式过长，请简化");
  if (/\\placeholder|\\prompt/.test(left))
    throw new Error("请先填写左侧公式中的空框");
  let tree: Expr;
  try {
    tree = computeEngine.parse(left, { form: "raw" }).json as Expr;
  } catch {
    throw new Error("左侧公式尚不完整");
  }
  if (!containsR(tree)) throw new Error("左侧需要包含半径 r");
  const coeff = polynomial(tree);
  const compiled = [0, 1, 2].map((i) => compileMathTree(coeff[i] ?? 0, "θ"));
  const rhs = compileLatex(right, "θ");
  if (rhs.params.includes("r")) throw new Error("请把含 r 的部分写在等号左侧");
  const params = [
    ...new Set([...compiled.flatMap((c) => c.params), ...rhs.params]),
  ];
  const roots = (theta: number, values: Parameters) =>
    realQuadraticRoots(
      compiled[2].evaluate(theta, values),
      compiled[1].evaluate(theta, values),
      compiled[0].evaluate(theta, values) - rhs.evaluate(theta, values),
    );
  const branches = [0, 1]
    .slice(0, coeff.length === 3 ? 2 : 1)
    .map((i) => (theta: number, values: Parameters) => roots(theta, values)[i]);
  return {
    params,
    numerical: compiled.some((c) => c.numerical) || rhs.numerical,
    domainGuards: [
      ...compiled.flatMap((c) => c.domainGuards),
      ...rhs.domainGuards,
    ],
    branches,
    evaluate: branches[0],
  };
}
