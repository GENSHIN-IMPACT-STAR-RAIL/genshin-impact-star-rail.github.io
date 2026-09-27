import { derivative, parse, simplify, type MathNode } from "mathjs/number";
import { normalizeExpression } from "./math.ts";
import { computeEngine } from "./latex.ts";
import type { View } from "./plot.ts";
import type { Point } from "./ode.ts";
import type { OdeAsymptote } from "./odeGeometry.ts";

type Complex = { re: number; im: number };
type Term = { rate: Complex; poly: Complex[] };
const z = (re = 0, im = 0): Complex => ({ re, im });
const add = (a: Complex, b: Complex) => z(a.re + b.re, a.im + b.im);
const neg = (a: Complex) => z(-a.re, -a.im);
const mul = (a: Complex, b: Complex) =>
  z(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const scale = (a: Complex, b: number) => z(a.re * b, a.im * b);
const norm = (a: Complex) => Math.hypot(a.re, a.im);
const divide = (a: Complex, b: Complex) => {
  const denominator = b.re * b.re + b.im * b.im;
  return z(
    (a.re * b.re + a.im * b.im) / denominator,
    (a.im * b.re - a.re * b.im) / denominator,
  );
};
const has = (node: MathNode, names: string[]) => {
  let found = false;
  node.traverse((part) => {
    if (part.type === "SymbolNode" && names.includes((part as any).name))
      found = true;
  });
  return found;
};
const constant = (node: MathNode): number => {
  const result = node.compile().evaluate({});
  if (typeof result !== "number" || !Number.isFinite(result))
    throw new Error("系数须为有限实数。");
  return result;
};
const compact = (poly: Complex[]) => {
  const magnitude = Math.max(...poly.map(norm));
  const cleaned = poly.map((value) =>
    z(
      Math.abs(value.re) < 32 * Number.EPSILON * magnitude ? 0 : value.re,
      Math.abs(value.im) < 32 * Number.EPSILON * magnitude ? 0 : value.im,
    ),
  );
  while (cleaned.length > 1 && norm(cleaned[cleaned.length - 1]) === 0)
    cleaned.pop();
  return cleaned;
};
function merge(terms: Term[]): Term[] {
  const result: Term[] = [];
  for (const term of terms) {
    const same = result.find(
      (t) =>
        Math.abs(t.rate.re - term.rate.re) < 1e-13 &&
        Math.abs(t.rate.im - term.rate.im) < 1e-13,
    );
    if (same) {
      for (let i = 0; i < term.poly.length; i++)
        same.poly[i] = add(same.poly[i] ?? z(), term.poly[i]);
    } else result.push({ rate: term.rate, poly: [...term.poly] });
  }
  if (result.length > 24)
    throw new Error("右端项过于复杂，请减少相乘或相加的项数。");
  return result
    .map((term) => ({ ...term, poly: compact(term.poly) }))
    .filter((term) => term.poly.some((value) => norm(value) > 0));
}
function product(left: Term[], right: Term[]): Term[] {
  if (left.length * right.length > 100)
    throw new Error("右端项过于复杂，请先化简。");
  return merge(
    left.flatMap((a) =>
      right.map((b) => {
        const poly = Array.from(
          { length: a.poly.length + b.poly.length - 1 },
          () => z(),
        );
        if (poly.length > 9)
          throw new Error("右端多项式次数最多为 6，请简化后重试。");
        a.poly.forEach((value, i) =>
          b.poly.forEach((other, j) => {
            poly[i + j] = add(poly[i + j], mul(value, other));
          }),
        );
        return { rate: add(a.rate, b.rate), poly };
      }),
    ),
  );
}
const singleton = (value: number): Term[] => [{ rate: z(), poly: [z(value)] }];
function affine(node: MathNode): [number, number] {
  const d = simplify(derivative(node, "x"));
  if (has(d, ["x"])) throw new Error("指数和三角函数的自变量须为 x 的一次式。");
  const slope = constant(d),
    offset = constant(
      node.transform((part) =>
        part.type === "SymbolNode" && (part as any).name === "x"
          ? parse("0")
          : part,
      ),
    );
  return [slope, offset];
}
function expand(node: MathNode, depth = 0): Term[] {
  if (depth > 30) throw new Error("右端项嵌套过深。");
  if (!has(node, ["x"])) return singleton(constant(node));
  if (node.type === "ParenthesisNode")
    return expand((node as any).content, depth + 1);
  if (node.type === "SymbolNode" && (node as any).name === "x")
    return [{ rate: z(), poly: [z(), z(1)] }];
  if (node.type === "OperatorNode") {
    const { op, args } = node as any as { op: string; args: MathNode[] };
    if (op === "+" || op === "-")
      return merge(
        args.flatMap((arg, index) =>
          expand(arg, depth + 1).map((term) => ({
            rate: term.rate,
            poly: term.poly.map((value) =>
              op === "-" && (index > 0 || args.length === 1)
                ? neg(value)
                : value,
            ),
          })),
        ),
      );
    if (op === "*")
      return args.reduce(
        (a, b) => product(a, expand(b, depth + 1)),
        singleton(1),
      );
    if (op === "/" && !has(args[1], ["x"])) {
      const divisor = constant(args[1]);
      if (divisor === 0) throw new Error("方程包含除以零。");
      return expand(args[0], depth + 1).map((t) => ({
        ...t,
        poly: t.poly.map((v) => scale(v, 1 / divisor)),
      }));
    }
    if (op === "/") {
      // Algebraic simplification can turn exp(-x) into 1/exp(x).
      const denominator = expand(args[1], depth + 1);
      if (
        denominator.length === 1 &&
        denominator[0].poly.length === 1 &&
        norm(denominator[0].poly[0]) > 0
      )
        return product(expand(args[0], depth + 1), [
          {
            rate: neg(denominator[0].rate),
            poly: [divide(z(1), denominator[0].poly[0])],
          },
        ]);
    }
    if (op === "^") {
      if (!has(args[0], ["x"]) && has(args[1], ["x"])) {
        const base = constant(args[0]);
        if (base <= 0) throw new Error("指数函数的底数须为正数。");
        const [slope, offset] = affine(args[1]);
        return [{ rate: z(Math.log(base) * slope), poly: [z(base ** offset)] }];
      }
      if (!has(args[1], ["x"])) {
        const degree = constant(args[1]);
        if (Number.isInteger(degree) && degree >= 0 && degree <= 6) {
          let result = singleton(1);
          for (let i = 0; i < degree; i++)
            result = product(result, expand(args[0], depth + 1));
          return result;
        }
      }
    }
  }
  if (node.type === "FunctionNode") {
    const { fn, args } = node as any;
    if (["exp", "sin", "cos"].includes(fn.name)) {
      const [rate, phase] = affine(args[0]);
      if (fn.name === "exp")
        return [{ rate: z(rate), poly: [z(Math.exp(phase))] }];
      const cosine = Math.cos(phase),
        sine = Math.sin(phase);
      const amplitude =
        fn.name === "cos" ? z(cosine / 2, sine / 2) : z(sine / 2, -cosine / 2);
      return merge([
        { rate: z(0, rate), poly: [amplitude] },
        { rate: z(0, -rate), poly: [z(amplitude.re, -amplitude.im)] },
      ]);
    }
  }
  throw new Error("右端项目前支持多项式、指数、正弦、余弦及它们的和与积。");
}

function particularTerms(
  forcing: Term[],
  a: number,
  b: number,
  c: number,
): Term[] {
  return forcing.map((term) => {
    const lambda = term.rate;
    const A = add(add(scale(mul(lambda, lambda), a), scale(lambda, b)), z(c));
    const B = add(scale(lambda, 2 * a), z(b));
    const tolerance =
      64 *
      Number.EPSILON *
      Math.max(
        Math.abs(a) * norm(lambda) ** 2,
        Math.abs(b) * norm(lambda),
        Math.abs(c),
        Number.MIN_VALUE,
      );
    const resonance =
      norm(A) > tolerance
        ? 0
        : norm(B) >
            64 *
              Number.EPSILON *
              Math.max(
                Math.abs(a) * norm(lambda),
                Math.abs(b),
                Number.MIN_VALUE,
              )
          ? 1
          : 2;
    const poly = Array.from({ length: term.poly.length + resonance }, () =>
      z(),
    );
    for (let i = term.poly.length - 1; i >= 0; i--) {
      const p = term.poly[i],
        next = poly[i + 1] ?? z(),
        next2 = poly[i + 2] ?? z();
      if (resonance === 0)
        poly[i] = divide(
          add(
            add(p, neg(scale(mul(B, next), i + 1))),
            neg(scale(next2, a * (i + 2) * (i + 1))),
          ),
          A,
        );
      else if (resonance === 1)
        poly[i + 1] = divide(
          add(p, neg(scale(next2, a * (i + 2) * (i + 1)))),
          scale(B, i + 1),
        );
      else poly[i + 2] = scale(p, 1 / (a * (i + 2) * (i + 1)));
    }
    if (
      poly.some(
        (value) => !Number.isFinite(value.re) || !Number.isFinite(value.im),
      )
    )
      throw new Error("系数过大，无法稳定计算特解。");
    return { rate: lambda, poly: compact(poly) };
  });
}
function evaluateTerms(terms: Term[], x: number, differentiation = 0): number {
  let sum = 0;
  for (const term of terms) {
    let poly = term.poly;
    for (let k = 0; k < differentiation; k++)
      poly = poly.map((v, i) =>
        add(mul(term.rate, v), scale(poly[i + 1] ?? z(), i + 1)),
      );
    let value = z();
    for (let i = poly.length - 1; i >= 0; i--)
      value = add(scale(value, x), poly[i]);
    sum +=
      Math.exp(term.rate.re * x) *
      (Math.cos(term.rate.im * x) * value.re -
        Math.sin(term.rate.im * x) * value.im);
  }
  return sum;
}

function numberLatex(value: number): { text: string; approximate: boolean } {
  if (!Number.isFinite(value)) throw new Error("数值溢出，请减小系数或初值。");
  if (value === 0) return { text: "0", approximate: false };
  for (let d = 1; d <= 1000; d++) {
    const n = Math.round(value * d);
    if (
      Number.isSafeInteger(n) &&
      Math.abs(value - n / d) < 1e-12 * Math.abs(value)
    )
      return {
        text:
          d === 1
            ? String(n)
            : `${n < 0 ? "-" : ""}\\frac{${Math.abs(n)}}{${d}}`,
        approximate: false,
      };
  }
  const decimal = Number(value.toPrecision(9))
    .toString()
    .replace(/e([+-]?\d+)/, "\\times 10^{$1}");
  return { text: decimal, approximate: true };
}
const formulaSum = (pieces: string[]) =>
  pieces
    .filter(Boolean)
    .reduce(
      (a, b) => (a ? `${a}${b.startsWith("-") ? "" : "+"}${b}` : b),
      "",
    ) || "0";
function polynomialLatex(
  coefficients: number[],
  num: (n: number) => string,
): string {
  const pieces: string[] = [];
  for (let power = coefficients.length - 1; power >= 0; power--) {
    const coefficient = coefficients[power];
    if (coefficient === 0) continue;
    const monomial = power === 0 ? "" : power === 1 ? "x" : `x^{${power}}`;
    pieces.push(
      `${coefficient < 0 ? "-" : ""}${Math.abs(coefficient) === 1 && power > 0 ? "" : num(Math.abs(coefficient))}${monomial}`,
    );
  }
  return formulaSum(pieces);
}
function termsLatex(terms: Term[], num: (n: number) => string): string {
  const pieces: string[] = [];
  for (const term of terms) {
    if (term.rate.im < 0) continue;
    const scaleFactor = term.rate.im === 0 ? 1 : 2;
    const cosine = polynomialLatex(
      term.poly.map((v) => v.re * scaleFactor),
      num,
    );
    const sine = polynomialLatex(
      term.poly.map((v) => -v.im * scaleFactor),
      num,
    );
    let body = cosine;
    if (term.rate.im !== 0) {
      const angle = term.rate.im === 1 ? "x" : `${num(term.rate.im)}x`;
      const times = (p: string, f: string) =>
        p === "0"
          ? ""
          : p === "1"
            ? f
            : p === "-1"
              ? `-${f}`
              : `\\left(${p}\\right)${f}`;
      body = formulaSum([
        times(cosine, `\\cos\\left(${angle}\\right)`),
        times(sine, `\\sin\\left(${angle}\\right)`),
      ]);
    }
    if (body === "0") continue;
    const exp =
      term.rate.re === 0
        ? ""
        : `e^{${term.rate.re === 1 ? "" : term.rate.re === -1 ? "-" : num(term.rate.re)}x}`;
    pieces.push(exp ? `${exp}\\left(${body}\\right)` : body);
  }
  return formulaSum(pieces);
}

export type SecondOrderInitialCurve = {
  evaluate: (x: number) => number;
  derivative: (x: number) => number;
  formula: string;
  approximate: boolean;
  asymptotes: OdeAsymptote[];
};
export type SecondOrderSolution = {
  order: 2;
  input: string;
  coefficients: [number, number, number];
  rootKind: "distinct" | "repeated" | "complex";
  general: string;
  steps: string[];
  approximate: boolean;
  asymptotes: OdeAsymptote[];
  preferredRate: number;
  constantSolutions?: undefined;
  forcing: (x: number) => number;
  particularValue: (x: number) => number;
  particularDerivative: (x: number) => number;
  particularSecondDerivative: (x: number) => number;
  initialCurve: (
    x0: number,
    y0: number,
    slope0: number,
  ) => SecondOrderInitialCurve;
};

export function solveSecondOrder(input: string): SecondOrderSolution {
  if (input.length > 1500) throw new Error("方程过长，请简化后重试。");
  const sides = input.split("=");
  if (sides.length !== 2) throw new Error("请输入包含等号的二阶微分方程。");
  const nodes = sides.map((side) => {
    const source = side
      .replace(/d\s*\^?2\s*y\s*\/\s*d\s*x\s*\^?2|y\s*(?:''|″)/g, "Z")
      .replace(/d\s*y\s*\/\s*d\s*x|y\s*['′]/g, "D");
    const node = parse(normalizeExpression(source));
    let count = 0;
    node.traverse((part, path, parent) => {
      if (++count > 250) throw new Error("方程过于复杂，请简化。");
      if (
        ![
          "OperatorNode",
          "ConstantNode",
          "SymbolNode",
          "FunctionNode",
          "ParenthesisNode",
        ].includes(part.type)
      )
        throw new Error("不支持这个公式结构。");
      if (
        part.type === "SymbolNode" &&
        !(path === "fn" && parent?.type === "FunctionNode") &&
        !["x", "y", "D", "Z", "e", "pi"].includes((part as any).name)
      )
        throw new Error("请输入关于 x、y 的二阶方程，系数须为数值。");
      if (
        part.type === "FunctionNode" &&
        !["sin", "cos", "exp", "sqrt", "log", "abs"].includes(
          (part as any).fn.name,
        )
      )
        throw new Error("暂不支持这个函数。");
      if (part.type === "OperatorNode" && (part as any).op === "/") {
        const denominator = (part as any).args[1] as MathNode;
        if (has(denominator, ["y", "D", "Z"]))
          throw new Error("分母不能含 y 或导数。");
        if (has(denominator, ["x"])) {
          // Reciprocal exponentials have no real-domain holes. Retain the
          // original-domain rejection for polynomial/trigonometric divisors.
          const expanded = merge(expand(denominator));
          if (
            expanded.length !== 1 ||
            expanded[0].poly.length !== 1 ||
            expanded[0].rate.im !== 0 ||
            norm(expanded[0].poly[0]) === 0
          )
            throw new Error("分母含变量时只支持不会为零的指数项。");
        }
      }
    });
    return node;
  });
  const residual = parse(`(${nodes[0]})-(${nodes[1]})`);
  const coefficients = ["Z", "D", "y"].map((symbol) => {
    const coefficient = simplify(derivative(residual, symbol));
    if (has(coefficient, ["x", "y", "D", "Z"]))
      throw new Error("二阶方程的导数和 y 必须为一次项，且系数须为常数。");
    return constant(coefficient);
  }) as [number, number, number];
  const [a, b, c] = coefficients;
  if (a === 0) throw new Error("二阶导数的系数不能为零，请检查方程。");
  if (Math.max(Math.abs(b / a), Math.abs(c / a)) > 1e6)
    throw new Error("系数比例过大，请缩放变量后重试。");
  const rhs = simplify(
    parse(
      `-(${residual.transform((part) => (part.type === "SymbolNode" && ["y", "D", "Z"].includes((part as any).name) ? parse("0") : part))})`,
    ),
  );
  const forcing = merge(expand(rhs));
  if (
    forcing.some(
      (term) =>
        term.poly.length > 7 ||
        Math.abs(term.rate.re) > 200 ||
        Math.abs(term.rate.im) > 200,
    )
  )
    throw new Error("右端项次数或频率过大，请简化后重试。");
  const particular = particularTerms(forcing, a, b, c);
  let approximate = false;
  const num = (n: number) => {
    const result = numberLatex(n);
    approximate ||= result.approximate;
    return result.text;
  };
  const aText = num(a),
    bText = num(b),
    cText = num(c),
    aAbsText = num(Math.abs(a));
  const exact = (latex: string) => computeEngine.parse(latex).simplify().latex;
  const alpha = -b / (2 * a),
    delta = (b / a) ** 2 - (4 * c) / a;
  const tolerance =
    64 *
    Number.EPSILON *
    Math.max((b / a) ** 2, Math.abs((4 * c) / a), Number.MIN_VALUE);
  const rootKind =
    delta > tolerance
      ? "distinct"
      : delta < -tolerance
        ? "complex"
        : "repeated";
  const beta = Math.sqrt(Math.abs(delta)) / 2;
  const alphaText = exact(`-\\frac{${bText}}{2\\left(${aText}\\right)}`);
  const discriminantText = `\\left(${bText}\\right)^2-4\\left(${aText}\\right)\\left(${cText}\\right)`;
  const rootOffset = `\\frac{\\sqrt{${discriminantText}}}{2\\left(${aAbsText}\\right)}`;
  const r1Text =
    rootKind === "distinct"
      ? exact(`\\left(${alphaText}\\right)+${rootOffset}`)
      : "";
  const r2Text =
    rootKind === "distinct"
      ? exact(`\\left(${alphaText}\\right)-${rootOffset}`)
      : "";
  const omegaText =
    rootKind === "complex"
      ? exact(
          `\\frac{\\sqrt{-\\left(${discriminantText}\\right)}}{2\\left(${aAbsText}\\right)}`,
        )
      : "";
  const argument = (rate: number, text: string, variable: string) =>
    rate === 1
      ? variable
      : rate === -1
        ? `-${variable}`
        : Number.isInteger(rate)
          ? `${text}${variable}`
          : `\\left(${text}\\right)${variable}`;
  const exponential = (rate: number, text: string, variable: string) =>
    rate === 0 ? "1" : `e^{${argument(rate, text, variable)}}`;
  const times = (coefficient: string, basis: string) =>
    coefficient === "0"
      ? ""
      : basis === "1"
        ? coefficient
        : coefficient === "1"
          ? basis
          : coefficient === "-1"
            ? `-${basis}`
            : `${coefficient}${basis}`;
  const homogeneous = (k1: string, k2: string, variable = "x") => {
    const e = exponential(alpha, alphaText, variable);
    if (rootKind === "distinct")
      return formulaSum([
        times(k1, exponential(alpha + beta, r1Text, variable)),
        times(k2, exponential(alpha - beta, r2Text, variable)),
      ]);
    const inner =
      rootKind === "repeated"
        ? formulaSum([k1 === "0" ? "" : k1, times(k2, variable)])
        : formulaSum([
            times(
              k1,
              `\\cos\\left(${argument(beta, omegaText, variable)}\\right)`,
            ),
            times(
              k2,
              `\\sin\\left(${argument(beta, omegaText, variable)}\\right)`,
            ),
          ]);
    return inner === "0"
      ? "0"
      : e === "1"
        ? inner
        : `${e}\\left(${inner}\\right)`;
  };
  const yp = termsLatex(particular, num);
  const combine = (h: string) =>
    `y=${formulaSum([h === "0" ? "" : h, yp === "0" ? "" : yp])}`;
  const general = combine(homogeneous("C_1", "C_2"));
  const characteristic = `${polynomialLatex([c, b, a], num).replace(/x/g, "r")}=0`;
  const roots =
    rootKind === "distinct"
      ? `r_1=${r1Text},\\quad r_2=${r2Text}`
      : rootKind === "repeated"
        ? `r_1=r_2=${alphaText}`
        : `r=${alphaText}\\pm\\left(${omegaText}\\right)i`;
  const value = (x: number) => evaluateTerms(particular, x);
  const derivativeValue = (x: number) => evaluateTerms(particular, x, 1);
  const limitLine = (
    direction: number,
  ): { slope: number; value: number } | null => {
    let slope = 0,
      value = 0;
    for (const term of particular) {
      if (term.rate.re * direction < 0) continue;
      if (
        term.rate.re * direction > 0 ||
        term.rate.im !== 0 ||
        term.poly.length > 2
      )
        return null;
      value += term.poly[0]?.re ?? 0;
      slope += term.poly[1]?.re ?? 0;
    }
    return { slope, value };
  };
  const stableDirections = [1, -1].filter((direction) =>
    rootKind === "distinct"
      ? (alpha + beta) * direction < 0 && (alpha - beta) * direction < 0
      : alpha * direction < 0,
  );
  const asymptotes: OdeAsymptote[] = stableDirections.flatMap((direction) => {
    const line = limitLine(direction);
    return line ? [{ axis: "y" as const, ...line }] : [];
  });
  const initialCurve = (
    x0: number,
    y0: number,
    slope0: number,
  ): SecondOrderInitialCurve => {
    if (![x0, y0, slope0].every(Number.isFinite))
      throw new Error("初值须为有限实数。");
    const y = y0 - value(x0),
      slope = slope0 - derivativeValue(x0);
    if (![y, slope].every(Number.isFinite))
      throw new Error("该初值位置的数值过大，无法稳定计算。");
    let c1 = y,
      c2 = slope - alpha * y;
    if (rootKind === "distinct") {
      c1 = (slope - (alpha - beta) * y) / (2 * beta);
      c2 = y - c1;
    } else if (rootKind === "complex") c2 /= beta;
    const h = (t: number, differentiation: boolean) => {
      if (c1 === 0 && c2 === 0) return 0;
      if (rootKind === "distinct")
        return (
          (c1 === 0
            ? 0
            : c1 *
              Math.exp((alpha + beta) * t) *
              (differentiation ? alpha + beta : 1)) +
          (c2 === 0
            ? 0
            : c2 *
              Math.exp((alpha - beta) * t) *
              (differentiation ? alpha - beta : 1))
        );
      if (rootKind === "repeated")
        return (
          Math.exp(alpha * t) *
          (differentiation ? alpha * (c1 + c2 * t) + c2 : c1 + c2 * t)
        );
      return (
        Math.exp(alpha * t) *
        (differentiation
          ? (alpha * c1 + beta * c2) * Math.cos(beta * t) +
            (alpha * c2 - beta * c1) * Math.sin(beta * t)
          : c1 * Math.cos(beta * t) + c2 * Math.sin(beta * t))
      );
    };
    const k1 = numberLatex(c1),
      k2 = numberLatex(c2),
      origin = numberLatex(x0);
    const variable =
      x0 === 0 ? "x" : `\\left(x-\\left(${origin.text}\\right)\\right)`;
    const selectedAsymptotes: OdeAsymptote[] = [];
    for (const direction of [1, -1]) {
      const line = limitLine(direction);
      if (!line) continue;
      if (rootKind === "distinct") {
        let valid = true;
        for (const [coefficient, rate] of [
          [c1, alpha + beta],
          [c2, alpha - beta],
        ]) {
          if (coefficient === 0) continue;
          if (rate === 0) line.value += coefficient;
          else if (rate * direction > 0) valid = false;
        }
        if (!valid) continue;
      } else if (c1 !== 0 || c2 !== 0) {
        if (alpha * direction > 0 || (alpha === 0 && rootKind === "complex"))
          continue;
        if (alpha === 0 && rootKind === "repeated") {
          line.slope += c2;
          line.value += c1 - c2 * x0;
        }
      }
      selectedAsymptotes.push({ axis: "y", ...line });
    }
    return {
      evaluate: (x) => (x === x0 ? y0 : value(x) + h(x - x0, false)),
      derivative: (x) =>
        x === x0 ? slope0 : derivativeValue(x) + h(x - x0, true),
      formula: combine(homogeneous(k1.text, k2.text, variable)),
      approximate:
        approximate || k1.approximate || k2.approximate || origin.approximate,
      asymptotes: selectedAsymptotes,
    };
  };
  return {
    order: 2,
    input,
    coefficients,
    rootKind,
    general,
    approximate,
    asymptotes,
    preferredRate:
      rootKind === "distinct"
        ? Math.abs(alpha + beta) < Math.abs(alpha - beta)
          ? alpha + beta
          : alpha - beta
        : alpha,
    steps: [
      characteristic,
      roots,
      `y_{\\mathrm{h}}=${homogeneous("C_1", "C_2")}`,
      `y_{\\mathrm{p}}=${yp}`,
      general,
    ],
    forcing: (x) => evaluateTerms(forcing, x),
    particularValue: value,
    particularDerivative: derivativeValue,
    particularSecondDerivative: (x) => evaluateTerms(particular, x, 2),
    initialCurve,
  };
}

export function secondOrderSegments(
  curve: SecondOrderInitialCurve,
  view: View,
  width: number,
  height: number,
): Point[][] {
  // Constant-coefficient solutions are smooth at every finite x. Large slopes
  // are not poles: retain their connecting segments for viewport clipping.
  const lines: Point[][] = [];
  let line: Point[] = [];
  const count = Math.max(2, Math.ceil(width / 1.5));
  for (let i = 0; i <= count; i++) {
    const x = view.x + ((i / count - 0.5) * width) / view.scale,
      y = curve.evaluate(x);
    if (Number.isFinite(y)) line.push([x, y]);
    else {
      if (line.length > 1) lines.push(line);
      line = [];
    }
  }
  if (line.length > 1) lines.push(line);
  return lines;
}
export function secondOrderFamily(
  solution: SecondOrderSolution,
  view: View,
  width: number,
  height: number,
  spacing: number,
): Point[][] {
  const count = Math.min(13, Math.max(3, Math.floor(height / (spacing * 1.8))));
  const slopeScale = Math.max(0.6, (2 * height) / width);
  const lines: Point[][] = [];
  for (let i = 0; i < count; i++) {
    const y0 =
      view.y + ((i - (count - 1) / 2) * height) / (count + 1) / view.scale;
    for (const slope of [-slopeScale, 0, slopeScale]) {
      try {
        lines.push(
          ...secondOrderSegments(
            solution.initialCurve(view.x, y0, slope),
            view,
            width,
            height,
          ),
        );
      } catch {
        /* At extreme x the particular solution can overflow; omit these samples. */
      }
    }
  }
  return lines;
}
