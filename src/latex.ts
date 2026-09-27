import { ComputeEngine } from "@cortex-js/compute-engine";
import type { Parameters } from "./math";

export const computeEngine = new ComputeEngine();
export type Expr = string | number | { num?: string; sym?: string } | Expr[];
type Scope = Record<string, number>;
type Evaluate = (scope: Scope, budget: { remaining: number }) => number;
const greek: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  theta: "θ",
  vartheta: "ϑ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  rho: "ρ",
  sigma: "σ",
  tau: "τ",
  phi: "φ",
  varphi: "φ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
};
const symbolName = (s: string) => greek[s] ?? s;
const constant: Record<string, number> = {
  Pi: Math.PI,
  ExponentialE: Math.E,
  e: Math.E,
};
const unary: Record<string, (n: number) => number> = {
  Sin: Math.sin,
  Cos: Math.cos,
  Tan: Math.tan,
  Arcsin: Math.asin,
  Arccos: Math.acos,
  Arctan: Math.atan,
  Sinh: Math.sinh,
  Cosh: Math.cosh,
  Tanh: Math.tanh,
  Sqrt: Math.sqrt,
  Abs: Math.abs,
  Exp: Math.exp,
  Ln: Math.log,
  Lg: Math.log10,
  Lb: Math.log2,
  Floor: Math.floor,
  Ceil: Math.ceil,
};

export function compileLatex(
  latex: string,
  independent: "x" | "θ" | "t" = "x",
) {
  if (!latex.trim()) throw new Error(`输入一个关于 ${independent} 的表达式`);
  if (latex.length > 1500) throw new Error("公式过长，请拆分表达式");
  if (/\\placeholder|\\prompt/.test(latex))
    throw new Error("请先填写公式中的空框");
  let tree: Expr;
  try {
    tree = computeEngine.parse(latex, { form: "raw" }).json as Expr;
  } catch {
    throw new Error("公式尚不完整，请检查括号与上下限");
  }
  // y= is accepted as a convenience; other relations remain explicit unsupported input.
  if (
    Array.isArray(tree) &&
    tree[0] === "Equal" &&
    tree[1] === (independent === "θ" ? "r" : "y")
  )
    tree = tree[2];
  return compileMathTree(tree, independent);
}

export function compileMathTree(
  tree: Expr,
  independent: "x" | "θ" | "t" = "x",
  additionalVariables: string[] = [],
) {
  const params = new Set<string>();
  const guards: Evaluate[] = [];
  let count = 0;
  let numerical = false;
  function build(node: Expr, bound: Set<string>, depth = 0): Evaluate {
    if (++count > 150 || depth > 24) throw new Error("公式过于复杂，请简化");
    if (typeof node === "number") return () => node;
    if (typeof node === "string") {
      if (Object.hasOwn(constant, node)) return () => constant[node];
      const name = symbolName(node);
      if (!/^[A-Za-zα-ωΑ-Ωϑ](?:_[A-Za-z0-9]+)?$/u.test(name))
        throw new Error("暂不支持这个符号或无限范围");
      if (
        name !== independent &&
        !additionalVariables.includes(name) &&
        !bound.has(name)
      )
        params.add(name);
      return (s) => s[name] ?? 1;
    }
    if (!Array.isArray(node)) {
      if (node?.num !== undefined) {
        const n = Number(node.num);
        if (Number.isFinite(n)) return () => n;
      }
      if (node?.sym) return build(node.sym, bound, depth + 1);
      throw new Error("暂不支持这个公式结构");
    }
    const [op, ...args] = node;
    if (op === "Error" || op === "Nothing" || op === "Sequence")
      throw new Error("公式尚不完整，请填写空框并检查括号");
    if (op === "Sum" || op === "Product" || op === "Integrate" || op === "D") {
      if (args.length !== 2) throw new Error("请填写表达式、变量和上下限");
      const range = args[1];
      if (op === "Integrate" && !Array.isArray(range))
        throw new Error("不定积分已录入；当前请补上有限上下限进行数值积分");
      const variable =
        op === "D"
          ? range
          : Array.isArray(range) && range[0] === "Tuple"
            ? range[1]
            : null;
      if (
        typeof variable !== "string" ||
        !/^[A-Za-zα-ωΑ-Ω]$/u.test(symbolName(variable))
      )
        throw new Error("请用单个字母指定运算变量");
      const v = symbolName(variable);
      const inside = new Set(bound);
      inside.add(v);
      const fn = build(args[0], inside, depth + 1);
      if (op === "D") {
        numerical = true;
        if (
          v !== independent &&
          !additionalVariables.includes(v) &&
          !bound.has(v)
        )
          params.add(v);
        return (s, b) => {
          const x = s[v] ?? 1,
            h = 1e-4 * Math.max(1, Math.abs(x));
          const sample = (t: number) => fn({ ...s, [v]: t }, b);
          const f = sample(x),
            l = sample(x - h),
            r = sample(x + h);
          const left = (f - l) / h,
            right = (r - f) / h;
          if (
            ![f, l, r].every(Number.isFinite) ||
            Math.abs(left - right) >
              1e-2 * Math.max(1, Math.abs(left), Math.abs(right))
          )
            return NaN;
          return (
            (sample(x - 2 * h) - 8 * l + 8 * r - sample(x + 2 * h)) / (12 * h)
          );
        };
      }
      if (!Array.isArray(range) || range.length !== 4)
        throw new Error("请填写有限的下限与上限");
      const lo = build(range[2], bound, depth + 1),
        hi = build(range[3], bound, depth + 1);
      if (op === "Sum" || op === "Product")
        return (s, b) => {
          const a = lo(s, b),
            z = hi(s, b);
          if (
            !Number.isSafeInteger(a) ||
            !Number.isSafeInteger(z) ||
            z - a > 99
          )
            return NaN;
          let result = op === "Sum" ? 0 : 1;
          for (let i = a; i <= z; i++) {
            if (--b.remaining < 0) return NaN;
            const y = fn({ ...s, [v]: i }, b);
            result = op === "Sum" ? result + y : result * y;
          }
          return result;
        };
      numerical = true;
      return (s, b) => {
        const a = lo(s, b),
          z = hi(s, b);
        if (!Number.isFinite(a) || !Number.isFinite(z)) return NaN;
        if (a === z) return 0;
        const sample = (t: number) => {
          if (--b.remaining < 0) return NaN;
          return fn({ ...s, [v]: t }, b);
        };
        const fa = sample(a),
          fz = sample(z),
          m = (a + z) / 2,
          fm = sample(m);
        const total = ((z - a) * (fa + 4 * fm + fz)) / 6;
        function refine(
          l: number,
          r: number,
          fl: number,
          fc: number,
          fr: number,
          whole: number,
          tol: number,
          level: number,
        ): number {
          const mid = (l + r) / 2,
            flm = sample((l + mid) / 2),
            frm = sample((mid + r) / 2);
          const left = ((mid - l) * (fl + 4 * flm + fc)) / 6,
            right = ((r - mid) * (fc + 4 * frm + fr)) / 6;
          if (!Number.isFinite(left + right)) return NaN;
          const delta = left + right - whole;
          if (Math.abs(delta) <= 15 * tol) return left + right + delta / 15;
          if (level === 0) return NaN;
          return (
            refine(l, mid, fl, flm, fc, left, tol / 2, level - 1) +
            refine(mid, r, fc, frm, fr, right, tol / 2, level - 1)
          );
        }
        return refine(a, z, fa, fm, fz, total, 1e-6, 8);
      };
    }
    const supported = [
      "InvisibleOperator",
      "Multiply",
      "Add",
      "Subtract",
      "Negate",
      "Divide",
      "Power",
      "Root",
      "Square",
      "Delimiter",
      "Log",
      ...Object.keys(unary),
    ];
    if (!supported.includes(op as string))
      throw new Error("此结构已录入，当前绘图暂不支持该运算或关系");
    const fs = args.map((a) => build(a, bound, depth + 1));
    if (bound.size === 0) {
      if (op === "Divide" && fs[1]) {
        // Preserve zeros of repeated factors: searching (x-c)^2 by sign alone
        // would miss an isolated exclusion that does not cross zero.
        const factorZeros = (node: Expr, fn: Evaluate) => {
          if (
            Array.isArray(node) &&
            node[0] === "Power" &&
            typeof node[2] === "number" &&
            node[2] > 0
          ) {
            factorZeros(node[1], build(node[1], bound, depth + 1));
          } else if (
            Array.isArray(node) &&
            ["Square", "Sqrt", "Root", "Delimiter", "Negate"].includes(
              node[0] as string,
            )
          ) {
            factorZeros(node[1], build(node[1], bound, depth + 1));
          } else if (
            Array.isArray(node) &&
            ["Multiply", "InvisibleOperator"].includes(node[0] as string)
          ) {
            for (const factor of node.slice(1))
              factorZeros(factor, build(factor, bound, depth + 1));
          } else guards.push(fn);
        };
        factorZeros(args[1], fs[1]);
      }
      if (op === "Tan" && fs[0]) guards.push((s, b) => Math.cos(fs[0](s, b)));
      if (["Ln", "Lg", "Lb", "Log"].includes(op as string) && fs[0])
        guards.push(fs[0]);
      if (op === "Log" && fs[1]) {
        guards.push(fs[1]);
        guards.push((s, b) => fs[1](s, b) - 1);
      }
      if (op === "Power" && fs[1])
        guards.push((s, b) => (fs[1](s, b) < 0 ? fs[0](s, b) : 1));
    }
    if (
      (["Divide", "Power", "Root", "Subtract"].includes(op as string) &&
        fs.length !== 2) ||
      (["Negate", "Square", "Delimiter", ...Object.keys(unary)].includes(
        op as string,
      ) &&
        fs.length !== 1)
    )
      throw new Error("请补全运算对象");
    return (s, b) => {
      if (--b.remaining < 0) return NaN;
      const values = fs.map((f) => f(s, b));
      const [a, z] = values;
      // Math.tan(π/2) returns a huge finite approximation, although tan is
      // undefined there. Do not turn that into a false defined point downstream.
      if (op === "Tan" && Math.abs(Math.cos(a)) < 8 * Number.EPSILON)
        return NaN;
      if (unary[op as string]) return unary[op as string](a);
      switch (op) {
        case "InvisibleOperator":
        case "Multiply":
          return values.reduce((a, z) => a * z, 1);
        case "Add":
          return values.reduce((a, z) => a + z, 0);
        case "Subtract":
          return a - z;
        case "Negate":
          return -a;
        case "Divide":
          return a / z;
        case "Power":
          return a ** z;
        case "Square":
          return a * a;
        case "Root":
          return a < 0 && Number.isInteger(z) && Math.abs(z % 2) === 1
            ? -((-a) ** (1 / z))
            : a ** (1 / z);
        case "Delimiter":
          return a;
        case "Log":
          return fs.length === 1 ? Math.log10(a) : Math.log(a) / Math.log(z);
        default:
          return NaN;
      }
    };
  }
  const evaluate = build(tree, new Set());
  return {
    params: [...params],
    numerical,
    domainGuards: guards.map((guard) => (x: number, values: Parameters) => {
      try {
        return guard({ ...values, [independent]: x }, { remaining: 4000 });
      } catch {
        return NaN;
      }
    }),
    evaluate: (x: number, values: Parameters) => {
      try {
        const y = evaluate(
          { ...values, [independent]: x },
          { remaining: 4000 },
        );
        return Number.isFinite(y) ? y : NaN;
      } catch {
        return NaN;
      }
    },
  };
}
