import { computeEngine, type Expr } from "./latex.ts";
import {
  parseInitial,
  solveFirstOrder,
  type OdeSolution,
  type Point,
} from "./ode.ts";
import {
  solveSecondOrder,
  type SecondOrderSolution,
  type SecondOrderInitialCurve,
} from "./odeSecondOrder.ts";
export type AnyOdeSolution = OdeSolution | SecondOrderSolution;

function readLatex(latex: string): Expr {
  if (!latex.trim()) throw new Error("请先填写公式。");
  if (latex.length > 1500) throw new Error("公式过长，请简化后重试。");
  if (/\\placeholder|\\prompt/.test(latex))
    throw new Error("请先填写公式中的空框。");
  return computeEngine.parse(latex, { form: "raw" }).json as Expr;
}

function differential(node: Expr): string | null {
  if (!Array.isArray(node)) return null;
  if (node[0] === "Delimiter") return differential(node[1]);
  if (
    ["InvisibleOperator", "Multiply"].includes(String(node[0])) &&
    node.length === 3 &&
    ["d", "d_upright"].includes(String(node[1])) &&
    ["x", "y"].includes(String(node[2]))
  )
    return String(node[2]);
  return null;
}

function secondDerivative(top: Expr, bottom: Expr): boolean {
  const factors = (node: Expr): Expr[] =>
    Array.isArray(node) && node[0] === "Delimiter"
      ? factors(node[1])
      : Array.isArray(node) &&
          ["InvisibleOperator", "Multiply"].includes(String(node[0]))
        ? node.slice(1)
        : [node];
  const a = factors(top),
    b = factors(bottom);
  const d = (node: Expr) => node === "d" || node === "d_upright";
  const square = (node: Expr, match: (arg: Expr) => boolean) =>
    Array.isArray(node) &&
    ((node[0] === "Power" && node[2] === 2) || node[0] === "Square") &&
    match(node[1]);
  return (
    a.length === 2 &&
    b.length === 2 &&
    square(a[0], d) &&
    a[1] === "y" &&
    d(b[0]) &&
    square(b[1], (arg) => arg === "x")
  );
}

// Convert the editor's expression tree, rather than flattening visual fractions
// or rewriting arbitrary LaTeX strings. Keep parentheses and derivative order.
function arithmetic(node: Expr, allowDerivative = false, depth = 0): string {
  if (depth > 40) throw new Error("公式嵌套过深，请简化。");
  if (typeof node === "number") return String(node);
  if (typeof node === "string") {
    if (["x", "y", "e"].includes(node)) return node;
    if (node === "Pi") return "pi";
    if (node === "ExponentialE") return "e";
    throw new Error("方程使用 x、y；其他系数请填写数值。");
  }
  if (!Array.isArray(node)) {
    if (node.num !== undefined && Number.isFinite(Number(node.num)))
      return String(Number(node.num));
    if (node.sym) return arithmetic(node.sym, allowDerivative, depth + 1);
    throw new Error("无法识别这个公式，请检查输入。");
  }
  const [operator, ...args] = node;
  if (operator === "Prime") {
    if (
      !allowDerivative ||
      !["x", "y"].includes(String(args[0])) ||
      (args.length > 1 && args[1] !== 1 && args[1] !== 2)
    )
      throw new Error("这里只支持一阶或二阶导数。");
    if (args[1] === 2) {
      if (args[0] !== "y")
        throw new Error("二阶方程请使用 x 为自变量、y 为因变量。");
      return "d^2y/dx^2";
    }
    return args[0] === "y" ? "dy/dx" : "dx/dy";
  }
  if (operator === "Divide") {
    if (allowDerivative && secondDerivative(args[0], args[1]))
      return "d^2y/dx^2";
    const top = differential(args[0]),
      bottom = differential(args[1]);
    if (top && bottom && top !== bottom && allowDerivative)
      return `d${top}/d${bottom}`;
  }
  const converted = args.map((arg) =>
    arithmetic(arg, allowDerivative, depth + 1),
  );
  const wrap = converted.map((arg) => `(${arg})`);
  switch (operator) {
    case "Equal":
      if (allowDerivative && args.length === 2) return converted.join("=");
      break;
    case "Add":
      return wrap.join("+");
    case "Subtract":
      return wrap.join("-");
    case "Negate":
      return `-${wrap[0]}`;
    case "Multiply":
    case "InvisibleOperator":
      return wrap.join("*");
    case "Divide":
    case "Rational":
      return `${wrap[0]}/${wrap[1]}`;
    case "Power":
      return `${wrap[0]}^${wrap[1]}`;
    case "Square":
      return `${wrap[0]}^2`;
    case "Root":
      return `${wrap[0]}^(1/${wrap[1]})`;
    case "Delimiter":
      if (args.length === 1) return wrap[0];
      break;
    case "Sqrt":
      return `sqrt(${converted[0]})`;
    case "Exp":
      return `exp(${converted[0]})`;
    case "Ln":
      return `log(${converted[0]})`;
    case "Abs":
      return `abs(${converted[0]})`;
    case "Sin":
      return `sin(${converted[0]})`;
    case "Cos":
      return `cos(${converted[0]})`;
    case "Tan":
      return `tan(${converted[0]})`;
  }
  throw new Error("公式尚不完整，或包含暂不支持的运算。");
}

export function solveOdeLatex(latex: string, order?: 1): OdeSolution;
export function solveOdeLatex(latex: string, order: 2): SecondOrderSolution;
export function solveOdeLatex(latex: string, order: 1 | 2): AnyOdeSolution;
export function solveOdeLatex(latex: string, order: 1 | 2 = 1): AnyOdeSolution {
  const tree = readLatex(latex);
  if (!Array.isArray(tree) || tree[0] !== "Equal")
    throw new Error("请输入完整的微分方程，包含等号与导数。");
  const source = arithmetic(tree, true);
  if (order === 1 && source.includes("d^2y/dx^2"))
    throw new Error("请将表达式类型选为“二阶常系数微分方程”。");
  if (order === 2 && source.includes("dx/dy"))
    throw new Error("二阶方程请使用 x 为自变量、y 为因变量。");
  return order === 2 ? solveSecondOrder(source) : solveFirstOrder(source);
}

export function parseInitialLatex(latex: string): number {
  if (!latex.trim()) throw new Error("请填写初值的两个坐标。");
  return parseInitial(arithmetic(readLatex(latex)));
}

export type OdeEntryState = {
  solution: AnyOdeSolution | null;
  error: string;
  initialX: string;
  initialY: string;
  initialSlope: string;
  density: 1 | 2 | 3 | 4 | 5;
  showFamily: boolean;
};
export const DEFAULT_ODE_LATEX = "\\frac{\\mathrm{d}y}{\\mathrm{d}x}=xy";
export const DEFAULT_SECOND_ORDER_LATEX =
  "\\frac{\\mathrm{d}^2y}{\\mathrm{d}x^2}+y=0";
export const EMPTY_ODE_STATE: OdeEntryState = {
  solution: null,
  error: "",
  initialX: "",
  initialY: "",
  initialSlope: "",
  density: 3,
  showFamily: true,
};
export type OdeSelection = {
  point: Point | null;
  error: string;
  warning: string;
  particular: string;
  curve?: SecondOrderInitialCurve;
  approximate?: boolean;
};

export function odeSelection(state: OdeEntryState): OdeSelection {
  const empty = { point: null, error: "", warning: "", particular: "" };
  const { solution, initialX, initialY, initialSlope } = state;
  if (
    !solution ||
    (!initialX.trim() &&
      !initialY.trim() &&
      (solution.order === 1 || !initialSlope.trim()))
  )
    return empty;
  try {
    const x = parseInitialLatex(initialX),
      y = parseInitialLatex(initialY);
    if (solution.order === 2) {
      if (!initialSlope.trim())
        throw new Error("还需填写初始斜率，才能确定二阶方程的特解。");
      const slope = parseInitialLatex(initialSlope);
      const curve = solution.initialCurve(x, y, slope);
      return {
        point: [x, y],
        error: "",
        warning: "",
        particular: curve.formula,
        curve,
        approximate: curve.approximate,
      };
    }
    if (!Number.isFinite(solution.slope(x, y)))
      throw new Error("这个初值点不在方程的定义域内。");
    const warning = Number.isFinite(solution.slopeDerivative(x, y))
      ? ""
      : "该初值附近可能有多个解；粗线展示其中一条积分曲线。";
    // The quadrature may divide out a constant solution. Avoid substituting
    // that solution into a logarithm or a reciprocal in the general formula.
    const v = solution.dependent === "y" ? y : x;
    const u = solution.independent === "x" ? x : y;
    const stationary = [u - 0.71, u - 0.19, u, u + 0.37, u + 0.83].every(
      (t) => {
        const slope =
          solution.dependent === "y"
            ? solution.slope(t, v)
            : solution.slope(v, t);
        return Number.isFinite(slope) && Math.abs(slope) < 1e-10;
      },
    );
    const particular = stationary
      ? `${solution.dependent}=${solution.dependent === "y" ? initialY : initialX}`
      : solution.particular(x, y);
    return { point: [x, y], error: "", warning, particular };
  } catch (error) {
    return { ...empty, error: (error as Error).message };
  }
}
