import { derivative, parse, simplify, type MathNode } from "mathjs/number";
import { normalizeExpression } from "./math.ts";
import type { View } from "./plot.ts";
import { firstOrderGeometry, type FirstOrderGeometry } from "./odeGeometry.ts";

export type Point = [number, number];
export type OdeSolution = {
  order: 1;
  input: string;
  kind: "separable" | "linear" | "bernoulli";
  method: string;
  slope: (x: number, y: number) => number;
  slopeDerivative: (x: number, y: number) => number;
  guards: (x: number, y: number) => number[];
  general: string;
  constantSolutions?: string;
  steps: string[];
  particular: (x: number, y: number) => string;
  dependent: "x" | "y";
  independent: "x" | "y";
  geometry: FirstOrderGeometry;
};

const zero = parse("0"),
  one = parse("1");
const op = (name: string, ...nodes: MathNode[]) =>
  parse(
    name === "add"
      ? `(${nodes[0]})+(${nodes[1]})`
      : name === "sub"
        ? `(${nodes[0]})-(${nodes[1]})`
        : name === "mul"
          ? `(${nodes[0]})*(${nodes[1]})`
          : name === "div"
            ? `(${nodes[0]})/(${nodes[1]})`
            : name === "pow"
              ? `(${nodes[0]})^(${nodes[1]})`
              : name === "neg"
                ? `-(${nodes[0]})`
                : `exp(${nodes[0]})`,
  );
const clean = (node: MathNode) => simplify(node);
const has = (node: MathNode, variable: string): boolean => {
  let found = false;
  node.traverse((part) => {
    if (part.type === "SymbolNode" && (part as any).name === variable)
      found = true;
  });
  return found;
};
const at = (node: MathNode, values: Record<string, number>) => {
  try {
    const v = node.compile().evaluate(values);
    return typeof v === "number" && Number.isFinite(v) ? v : NaN;
  } catch {
    return NaN;
  }
};
const fraction = (value: number) => {
  if (!Number.isFinite(value)) return String(value);
  for (let denominator = 1; denominator <= 24; denominator++) {
    const numerator = Math.round(value * denominator);
    if (
      Math.abs(value - numerator / denominator) <
      1e-12 * Math.max(1, Math.abs(value))
    ) {
      if (denominator === 1) return String(numerator);
      return `\\frac{${numerator}}{${denominator}}`;
    }
  }
  return Number(value.toPrecision(8)).toString();
};
const tex = (node: MathNode) =>
  node
    .toTex()
    .replace(/(?<![\\\w])\d+\.\d+(?:e[+-]?\d+)?/g, (match) =>
      fraction(Number(match)),
    );
const display = fraction;
const withConstant = (formula: string, constant: number) =>
  formula.replace(
    "C",
    constant < 0 ? `\\left(${display(constant)}\\right)` : display(constant),
  );
const linearRhs = (
  coefficient: MathNode,
  forcing: MathNode,
  dependent: string,
) => {
  const a = clean(coefficient).toString(),
    b = clean(forcing).toString();
  const aTerm =
    a === "0"
      ? ""
      : a === "1"
        ? dependent
        : a === "-1"
          ? `-${dependent}`
          : `${tex(coefficient)}${dependent}`;
  if (b === "0") return aTerm || "0";
  const bTerm = tex(forcing);
  return aTerm
    ? bTerm.startsWith("-")
      ? `${aTerm}${bTerm}`
      : `${aTerm}+${bTerm}`
    : bTerm;
};

function makeNode(raw: string): MathNode {
  const derivativeToken =
    /(?:d\s*y\s*\/\s*d\s*x|d\s*x\s*\/\s*d\s*y|y\s*['′]|x\s*['′])/gi;
  const withDerivative = raw.replace(derivativeToken, "D");
  let normalized: string;
  try {
    normalized = normalizeExpression(withDerivative);
  } catch {
    throw new Error(
      "请用 dy/dx、y'、dx/dy 或 x' 输入导数；其他部分使用普通算式。",
    );
  }
  if (!normalized) throw new Error("请输入完整的一阶微分方程。");
  let tree: MathNode;
  try {
    tree = parse(normalized);
  } catch {
    throw new Error("方程格式不完整，请检查括号和运算符。");
  }
  let count = 0;
  tree.traverse((part, path, parent) => {
    if (++count > 100) throw new Error("方程过于复杂，请简化后重试。");
    if (
      ![
        "OperatorNode",
        "ConstantNode",
        "SymbolNode",
        "FunctionNode",
        "ParenthesisNode",
      ].includes(part.type)
    )
      throw new Error("只支持普通实数函数和一阶导数。");
    if (
      part.type === "SymbolNode" &&
      !(path === "fn" && parent?.type === "FunctionNode") &&
      !["x", "y", "D", "e", "pi"].includes((part as any).name)
    )
      throw new Error("首版只支持 x、y 和常数 e、π；暂不支持其他参数。");
    if (
      part.type === "FunctionNode" &&
      !["sin", "cos", "tan", "exp", "log", "sqrt", "abs"].includes(
        (part as any).fn.name,
      )
    )
      throw new Error("方程中含有暂不支持的函数。");
  });
  return tree;
}

function primitive(
  node: MathNode,
  variable: string,
  depth = 0,
): MathNode | null {
  if (depth > 12) return null;
  if (!has(node, variable)) return clean(op("mul", node, parse(variable)));
  if (node.type === "ParenthesisNode")
    return primitive((node as any).content, variable, depth + 1);
  if (node.type === "OperatorNode") {
    const n = node as any;
    const args = n.args as MathNode[];
    if (n.op === "+" || n.op === "-") {
      if (args.length === 1) {
        const inside = primitive(args[0], variable, depth + 1);
        return inside ? clean(op("neg", inside)) : null;
      }
      const parts = args.map((p) => primitive(p, variable, depth + 1));
      if (parts.some((p) => !p)) return null;
      return clean(op(n.op === "+" ? "add" : "sub", parts[0]!, parts[1]!));
    }
    if (n.op === "*") {
      const fixed = args.filter((p) => !has(p, variable));
      const variableParts = args.filter((p) => has(p, variable));
      if (fixed.length && variableParts.length) {
        const inside = primitive(
          variableParts.reduce((a, b) => op("mul", a, b)),
          variable,
          depth + 1,
        );
        return inside
          ? clean(
              op(
                "mul",
                fixed.reduce((a, b) => op("mul", a, b)),
                inside,
              ),
            )
          : null;
      }
      if (variableParts.length === 2) {
        // Integration by parts for the A-Level polynomial-times-exp/trig cases.
        const degree = (p: MathNode): number => {
          if (!has(p, variable)) return 0;
          if (p.type === "ParenthesisNode") return degree((p as any).content);
          if (p.type === "SymbolNode")
            return (p as any).name === variable ? 1 : Infinity;
          if (p.type !== "OperatorNode") return Infinity;
          const q = p as any,
            children = q.args as MathNode[];
          if (["+", "-"].includes(q.op))
            return Math.max(...children.map(degree));
          if (q.op === "*")
            return children.reduce((sum, child) => sum + degree(child), 0);
          if (q.op === "^")
            return children[0].toString() === variable &&
              Number.isInteger(at(children[1], {})) &&
              at(children[1], {}) >= 0
              ? at(children[1], {})
              : Infinity;
          return Infinity;
        };
        const candidate = variableParts.find(
          (p) =>
            p.type === "FunctionNode" &&
            ["exp", "sin", "cos"].includes((p as any).fn.name),
        );
        const polynomial = variableParts.find((p) => p !== candidate);
        if (candidate && polynomial && degree(polynomial) <= 5) {
          const antiderivative = primitive(candidate, variable, depth + 1);
          const lower = clean(derivative(polynomial, variable));
          const rest =
            antiderivative &&
            primitive(
              clean(op("mul", lower, antiderivative)),
              variable,
              depth + 1,
            );
          if (antiderivative && rest)
            return clean(
              op("sub", op("mul", polynomial, antiderivative), rest),
            );
        }
      }
    }
    if (n.op === "/" && !has(args[0], variable)) {
      const denominator = args[1];
      // Reciprocal quadratics cover logistic and 1-y^2 type separable models.
      const firstDerivative = clean(derivative(denominator, variable));
      const secondDerivative = clean(derivative(firstDerivative, variable));
      const thirdDerivative = clean(derivative(secondDerivative, variable));
      if (
        !has(thirdDerivative, variable) &&
        Math.abs(at(thirdDerivative, { [variable]: 0 })) < 1e-10
      ) {
        const a = at(secondDerivative, { [variable]: 0 }) / 2,
          b = at(firstDerivative, { [variable]: 0 }),
          c = at(denominator, { [variable]: 0 });
        if ([a, b, c].every(Number.isFinite) && Math.abs(a) > 1e-10) {
          const delta = b * b - 4 * a * c;
          let result: MathNode;
          if (delta > 1e-10) {
            const r1 = (-b + Math.sqrt(delta)) / (2 * a),
              r2 = (-b - Math.sqrt(delta)) / (2 * a);
            result = parse(
              `log(abs((${variable}-${r1})/(${variable}-${r2})))/${Math.sqrt(delta)}`,
            );
          } else if (delta < -1e-10) {
            const scale = Math.sqrt(-delta);
            result = parse(
              `${2 / scale}*atan((2*(${a})*${variable}+(${b}))/(${scale}))`,
            );
          } else {
            const root = -b / (2 * a);
            result = parse(`-1/((${a})*(${variable}-${root}))`);
          }
          return clean(op("mul", args[0], result));
        }
      }
      const inverse =
        denominator.type === "OperatorNode" &&
        (denominator as any).op === "^" &&
        !has((denominator as any).args[1], variable)
          ? op(
              "pow",
              (denominator as any).args[0],
              clean(op("neg", (denominator as any).args[1])),
            )
          : op("pow", denominator, parse("-1"));
      const inside = primitive(clean(inverse), variable, depth + 1);
      return inside ? clean(op("mul", args[0], inside)) : null;
    }
    if (n.op === "^" && !has(args[1], variable)) {
      const degree = at(args[1], {});
      const slope = clean(derivative(args[0], variable));
      if (
        Number.isFinite(degree) &&
        !has(slope, variable) &&
        at(slope, {}) !== 0
      ) {
        if (degree === -1)
          return clean(op("div", parse(`log(abs(${args[0]}))`), slope));
        return clean(
          op(
            "div",
            op("pow", args[0], parse(String(degree + 1))),
            op("mul", parse(String(degree + 1)), slope),
          ),
        );
      }
    }
  }
  if (node.type === "SymbolNode" && (node as any).name === variable)
    return clean(parse(`${variable}^2/2`));
  if (node.type === "FunctionNode") {
    const n = node as any;
    const arg = n.args[0] as MathNode;
    const slope = clean(derivative(arg, variable));
    if (!has(slope, variable) && at(slope, {}) !== 0) {
      const body =
        n.fn.name === "exp"
          ? node
          : n.fn.name === "sin"
            ? op("neg", parse(`cos(${arg})`))
            : n.fn.name === "cos"
              ? parse(`sin(${arg})`)
              : null;
      if (body) return clean(op("div", body, slope));
    }
  }
  return null;
}

function separate(
  node: MathNode,
  independent: string,
  dependent: string,
): [MathNode, MathNode] | null {
  if (!has(node, dependent)) return [node, one];
  if (!has(node, independent)) return [one, node];
  if (node.type === "ParenthesisNode")
    return separate((node as any).content, independent, dependent);
  if (node.type !== "OperatorNode") return null;
  const n = node as any,
    args = n.args as MathNode[];
  if ((n.op === "-" || n.op === "+") && args.length === 1) {
    const pair = separate(args[0], independent, dependent);
    return pair && n.op === "-" ? [clean(op("neg", pair[0])), pair[1]] : pair;
  }
  if (n.op === "*") {
    let left = one,
      right = one;
    for (const arg of args) {
      const part = separate(arg, independent, dependent);
      if (!part) return null;
      left = clean(op("mul", left, part[0]));
      right = clean(op("mul", right, part[1]));
    }
    return [left, right];
  }
  if (n.op === "/") {
    const a = separate(args[0], independent, dependent),
      b = separate(args[1], independent, dependent);
    return a && b
      ? [clean(op("div", a[0], b[0])), clean(op("div", a[1], b[1]))]
      : null;
  }
  if (n.op === "^" && !has(args[1], independent) && !has(args[1], dependent)) {
    const base = separate(args[0], independent, dependent);
    return base
      ? [clean(op("pow", base[0], args[1])), clean(op("pow", base[1], args[1]))]
      : null;
  }
  return null;
}

function powers(
  node: MathNode,
  dependent: string,
  independent: string,
): Map<number, MathNode> | null {
  const terms = new Map<number, MathNode>();
  const addTerm = (n: MathNode, sign = 1): boolean => {
    if (n.type === "ParenthesisNode") return addTerm((n as any).content, sign);
    if (n.type === "OperatorNode" && ["+", "-"].includes((n as any).op)) {
      const args = (n as any).args as MathNode[];
      return args.every((a, i) =>
        addTerm(
          a,
          sign *
            ((n as any).op === "-" && (args.length === 1 || i > 0) ? -1 : 1),
        ),
      );
    }
    const pair = separate(n, independent, dependent);
    if (!pair) return false;
    const ypart = pair[1];
    let degree = 0;
    if (has(ypart, dependent)) {
      if (ypart.type === "SymbolNode" && (ypart as any).name === dependent)
        degree = 1;
      else if (
        ypart.type === "OperatorNode" &&
        (ypart as any).op === "^" &&
        (ypart as any).args[0].toString() === dependent
      )
        degree = at((ypart as any).args[1], {});
      else return false;
    }
    if (!Number.isFinite(degree) || Math.abs(degree) > 12) return false;
    const term = sign === 1 ? pair[0] : op("neg", pair[0]);
    terms.set(
      degree,
      clean(terms.has(degree) ? op("add", terms.get(degree)!, term) : term),
    );
    return true;
  };
  return addTerm(node) ? terms : null;
}

function integralLatex(
  integrand: MathNode,
  variable: string,
  found: MathNode | null,
) {
  return found
    ? tex(found)
    : `\\int ${tex(integrand)}\\,\\mathrm{d}${variable}`;
}

export function solveFirstOrder(input: string): OdeSolution {
  if (input.length > 320) throw new Error("方程请控制在 320 字符以内。");
  const sides = input.split("=");
  if (sides.length !== 2)
    throw new Error("请输入含等号的一阶方程，如 dy/dx = x*y。");
  const derivativeForms =
    input.match(
      /(?:d\s*y\s*\/\s*d\s*x|d\s*x\s*\/\s*d\s*y|y\s*['′]|x\s*['′])/gi,
    ) ?? [];
  if (derivativeForms.length !== 1)
    throw new Error("请只输入一个一阶导数 dy/dx、y'、dx/dy 或 x'。");
  const reverse = /(?:d\s*x\s*\/\s*d\s*y|x\s*['′])/i.test(derivativeForms[0]);
  const independent = reverse ? "y" : "x",
    dependent = reverse ? "x" : "y";
  const lhs = makeNode(sides[0]),
    rhs = makeNode(sides[1]);
  const denominators: MathNode[] = [];
  for (const side of [lhs, rhs])
    side.traverse((part) => {
      if (part.type === "OperatorNode") {
        const item = part as any;
        if (item.op === "/") denominators.push(item.args[1]);
        if (
          item.op === "^" &&
          !has(item.args[1], "x") &&
          !has(item.args[1], "y") &&
          at(item.args[1], {}) < 0
        )
          denominators.push(item.args[0]);
      }
    });
  const compiledGuards = denominators.map((node) => node.compile());
  const guards = (x: number, y: number) =>
    compiledGuards.map((compiled) => {
      try {
        const result = compiled.evaluate({ x, y });
        return typeof result === "number" ? result : NaN;
      } catch {
        return NaN;
      }
    });
  const residual = op("sub", lhs, rhs);
  const first = clean(derivative(residual, "D"));
  if (has(first, "D") || clean(derivative(first, "D")).toString() !== "0")
    throw new Error("目前只支持可整理成一阶导数一次式的方程。");
  if (first.toString() === "0") throw new Error("没有找到有效的一阶导数系数。");
  const remainder = clean(
    residual.transform((part) =>
      part.type === "SymbolNode" && (part as any).name === "D" ? zero : part,
    ),
  );
  const field = clean(op("div", op("neg", remainder), first));
  const a = first.compile(),
    b = remainder.compile(),
    originalLeft = lhs.compile(),
    originalRight = rhs.compile();
  const slope = (x: number, y: number) => {
    try {
      const av = a.evaluate({ x, y }),
        bv = b.evaluate({ x, y });
      if (
        typeof av !== "number" ||
        typeof bv !== "number" ||
        !Number.isFinite(av) ||
        !Number.isFinite(bv) ||
        Math.abs(av) < 1e-10
      )
        return NaN;
      const v = -bv / av;
      if (!Number.isFinite(v)) return NaN;
      const sourceLeft = originalLeft.evaluate({ x, y, D: v }),
        sourceRight = originalRight.evaluate({ x, y, D: v });
      return typeof sourceLeft === "number" &&
        typeof sourceRight === "number" &&
        Number.isFinite(sourceLeft) &&
        Number.isFinite(sourceRight)
        ? v
        : NaN;
    } catch {
      return NaN;
    }
  };
  const derivativeY = clean(derivative(field, dependent));
  const slopeDerivative = (x: number, y: number) => at(derivativeY, { x, y });
  const linear = !has(derivativeY, dependent);
  const separated = separate(field, independent, dependent);
  const base = {
    order: 1 as const,
    input,
    slope,
    slopeDerivative,
    guards,
    geometry: firstOrderGeometry(field, independent, dependent, separated),
    independent: independent as "x" | "y",
    dependent: dependent as "x" | "y",
  };
  const u = independent,
    v = dependent;
  const initial = (x: number, y: number) => ({
    u0: u === "x" ? x : y,
    v0: v === "y" ? y : x,
  });
  if (linear) {
    const coefficient = derivativeY;
    const forcing = clean(
      field.transform((part) =>
        part.type === "SymbolNode" && (part as any).name === dependent
          ? zero
          : part,
      ),
    );
    const A = primitive(clean(op("neg", coefficient)), u);
    const factor = A ? clean(op("exp", A)) : null;
    const integrand = factor ? clean(op("mul", factor, forcing)) : null;
    const B = integrand ? primitive(integrand, u) : null;
    const homogeneous = forcing.toString() === "0";
    const aText = integralLatex(clean(op("neg", coefficient)), u, A);
    const mu = A
      ? `e^{${aText}}`
      : `\\exp\\left(\\int -\\left(${tex(coefficient)}\\right)\\,\\mathrm{d}${u}\\right)`;
    const bText = integrand
      ? integralLatex(integrand, u, B)
      : `\\int \\mu(${u})\\left(${tex(forcing)}\\right)\\,\\mathrm{d}${u}`;
    const homogeneousExponent = A
      ? tex(clean(op("neg", A)))
      : `\\int ${tex(coefficient)}\\,\\mathrm{d}${u}`;
    const general = homogeneous
      ? `${v}=C e^{${homogeneousExponent}}`
      : `${v}=\\frac{C+${bText}}{${mu}}`;
    return {
      ...base,
      kind: "linear",
      method: "一阶线性 · 积分因子",
      general,
      steps: [
        `${v}'=${linearRhs(coefficient, forcing, v)}`,
        `\\mu(${u})=${mu}`,
        general,
      ],
      particular: (x, y) => {
        const { u0, v0 } = initial(x, y);
        if (!A || !B) {
          if (homogeneous)
            return `\\mu(${u})${v}=${display(v0)}\\mu(${display(u0)})`;
          const inT = forcing.transform((part) =>
            part.type === "SymbolNode" && (part as any).name === u
              ? parse("t")
              : part,
          );
          return `\\mu(${u})${v}=${display(v0)}\\mu(${display(u0)})+\\int_{${display(u0)}}^{${u}}\\mu(t)\\left(${tex(inT)}\\right)\\,\\mathrm{d}t`;
        }
        const c = v0 * Math.exp(at(A, { [u]: u0 })) - at(B, { [u]: u0 });
        return Number.isFinite(c)
          ? withConstant(general, c)
          : `${v}(${display(u0)})=${display(v0)}`;
      },
    };
  }
  if (separated) {
    const xPart = separated[0],
      yPart = separated[1];
    const inverse = clean(op("div", one, yPart));
    const Y = primitive(inverse, v),
      X = primitive(xPart, u);
    const general = `${integralLatex(inverse, v, Y)}=${integralLatex(xPart, u, X)}+C`;
    return {
      ...base,
      kind: "separable",
      method: "可分离变量",
      general,
      constantSolutions: `${tex(yPart)}=0`,
      steps: [
        `${v}'=\\left(${tex(xPart)}\\right)\\left(${tex(yPart)}\\right)`,
        `\\frac{\\mathrm{d}${v}}{${tex(yPart)}}=${tex(xPart)}\\,\\mathrm{d}${u}`,
        general,
      ],
      particular: (x, y) => {
        const { u0, v0 } = initial(x, y);
        if (Y && X) {
          const c = at(Y, { [v]: v0 }) - at(X, { [u]: u0 });
          if (Number.isFinite(c)) return withConstant(general, c);
        }
        return `\\int_{${display(v0)}}^{${v}}${tex(inverse)}\\,\\mathrm{d}${v}=\\int_{${display(u0)}}^{${u}}${tex(xPart)}\\,\\mathrm{d}${u}`;
      },
    };
  }
  const terms = powers(field, v, u);
  if (terms?.has(1) && terms.size === 2) {
    const n = [...terms.keys()].find((power) => power !== 1)!;
    if (n !== 0 && n !== 1) {
      const degree = 1 - n,
        aTerm = clean(op("mul", parse(String(degree)), terms.get(1)!));
      const bTerm = clean(op("mul", parse(String(degree)), terms.get(n)!));
      const A = primitive(clean(op("neg", aTerm)), u),
        mu = A ? clean(op("exp", A)) : null;
      const B = mu ? primitive(clean(op("mul", mu, bTerm)), u) : null;
      const muText = A
        ? `e^{${tex(A)}}`
        : `\\exp\\left(\\int -\\left(${tex(aTerm)}\\right)\\,\\mathrm{d}${u}\\right)`;
      const general = `${v}^{${display(degree)}}=\\frac{C+${B ? tex(B) : `\\int \\mu(${u})\\left(${tex(bTerm)}\\right)\\,\\mathrm{d}${u}`}}{${muText}}`;
      return {
        ...base,
        kind: "bernoulli",
        method: "可化为一阶线性 · Bernoulli 代换",
        general,
        constantSolutions: n > 0 ? `${v}=0` : undefined,
        steps: [
          `z=${v}^{${display(degree)}}`,
          `z'=${linearRhs(aTerm, bTerm, "z")}`,
          `\\mu(${u})=${muText}`,
          general,
        ],
        particular: (x, y) => {
          const { u0, v0 } = initial(x, y);
          const c =
            A && B
              ? Math.pow(v0, degree) * Math.exp(at(A, { [u]: u0 })) -
                at(B, { [u]: u0 })
              : NaN;
          return Number.isFinite(c)
            ? withConstant(general, c)
            : `${v}(${display(u0)})=${display(v0)}`;
        },
      };
    }
  }
  throw new Error("暂无法求解这个方程，请检查公式，或先做代换、化简。");
}

export function parseInitial(raw: string): number {
  if (!raw.trim()) throw new Error("请填写初值的两个坐标。");
  const node = makeNode(raw);
  if (has(node, "x") || has(node, "y") || has(node, "D"))
    throw new Error("初值坐标必须是常数。");
  const value = at(node, {});
  if (!Number.isFinite(value) || Math.abs(value) > 1e5)
    throw new Error("初值必须是有限数值，且绝对值不超过 100000。");
  return value;
}

function step(solution: OdeSolution, u: number, v: number, h: number): number {
  const f = (uu: number, vv: number) =>
    solution.dependent === "y"
      ? solution.slope(uu, vv)
      : solution.slope(vv, uu);
  const a = f(u, v),
    b = f(u + h / 2, v + (h * a) / 2),
    c = f(u + h / 2, v + (h * b) / 2),
    d = f(u + h, v + h * c);
  return [a, b, c, d].every(Number.isFinite)
    ? v + (h * (a + 2 * b + 2 * c + d)) / 6
    : NaN;
}

export function traceIntegralCurve(
  solution: OdeSolution,
  point: Point,
  view: View,
  width: number,
  height: number,
): Point[] {
  const horizontal = solution.independent === "x";
  const u0 = horizontal ? point[0] : point[1],
    v0 = horizontal ? point[1] : point[0];
  const uMin = horizontal
    ? view.x - width / (2 * view.scale)
    : view.y - height / (2 * view.scale);
  const uMax = horizontal
    ? view.x + width / (2 * view.scale)
    : view.y + height / (2 * view.scale);
  const vMin = horizontal
    ? view.y - height / (2 * view.scale)
    : view.x - width / (2 * view.scale);
  const vMax = horizontal
    ? view.y + height / (2 * view.scale)
    : view.x + width / (2 * view.scale);
  const toPoint = (u: number, v: number): Point =>
    horizontal ? [u, v] : [v, u];
  const branch = (direction: number): Point[] => {
    const out: Point[] = [];
    let u = u0,
      v = v0,
      h = (direction * 4) / view.scale;
    for (
      let i = 0;
      i < Math.min(3600, Math.ceil((uMax - uMin) * view.scale));
      i++
    ) {
      const remaining = direction > 0 ? uMax - u : u - uMin;
      if (
        remaining <= 1e-10 ||
        v < vMin - (vMax - vMin) * 0.2 ||
        v > vMax + (vMax - vMin) * 0.2
      )
        break;
      h = direction * Math.min(Math.abs(h), 8 / view.scale, remaining);
      if (Math.abs(h) < 1e-8) break;
      const full = step(solution, u, v, h),
        half = step(solution, u, v, h / 2);
      const next = Number.isFinite(half)
        ? step(solution, u + h / 2, half, h / 2)
        : NaN;
      if (!Number.isFinite(full) || !Number.isFinite(next)) {
        h /= 2;
        if (Math.abs(h) < 0.15 / view.scale) break;
        continue;
      }
      const error = Math.abs(next - full) * view.scale;
      const before = solution.guards(...toPoint(u, v)),
        after = solution.guards(...toPoint(u + h, next));
      if (
        before.some(
          (value, j) =>
            !Number.isFinite(value) ||
            !Number.isFinite(after[j]) ||
            value === 0 ||
            after[j] === 0 ||
            Math.sign(value) !== Math.sign(after[j]),
        )
      ) {
        h /= 2;
        if (Math.abs(h) < 0.15 / view.scale) break;
        continue;
      }
      if (error > 0.7 && Math.abs(h) > 0.2 / view.scale) {
        h /= 2;
        continue;
      }
      if (
        Math.abs(next - v) * view.scale > 24 &&
        Math.abs(h) > 0.2 / view.scale
      ) {
        h /= 2;
        continue;
      }
      u += h;
      v = next;
      out.push(toPoint(u, v));
      if (error < 0.08) h *= 1.5;
    }
    return out;
  };
  return [...branch(-1).reverse(), point, ...branch(1)];
}

export function integralCurveFamily(
  solution: OdeSolution,
  view: View,
  width: number,
  height: number,
  spacing: number,
  selected?: Point,
): Point[][] {
  const horizontal = solution.independent === "x",
    uLength = horizontal ? width : height,
    vLength = horizontal ? height : width;
  const grid = new Set<string>(),
    lines: Point[][] = [];
  const cell = Math.max(12, spacing * 0.52);
  const key = (p: Point) =>
    `${Math.round(((p[0] - view.x) * view.scale) / cell)},${Math.round(((p[1] - view.y) * view.scale) / cell)}`;
  if (selected) {
    for (const p of traceIntegralCurve(solution, selected, view, width, height))
      grid.add(key(p));
  }
  const uCenter = horizontal ? view.x : view.y,
    vCenter = horizontal ? view.y : view.x;
  const uMin = uCenter - uLength / (2 * view.scale),
    uMax = uCenter + uLength / (2 * view.scale);
  const vMin = vCenter - vLength / (2 * view.scale),
    vMax = vCenter + vLength / (2 * view.scale);
  const toPoint = (u: number, v: number): Point =>
    horizontal ? [u, v] : [v, u];
  const atV = (u: number, v: number) => solution.slope(...toPoint(u, v));
  const uSamples = [
    uMin + 0.2 * (uMax - uMin),
    uCenter + 0.17 * (uMax - uMin),
    uMax - 0.2 * (uMax - uMin),
  ];
  const stationary = (v: number) =>
    uSamples.every((u) => {
      const value = atV(u, v);
      return Number.isFinite(value) && Math.abs(value) < 1e-7;
    });
  const candidates = new Set<number>([0]);
  for (let v = Math.ceil(vMin); v <= vMax && v < Math.ceil(vMin) + 100; v++)
    candidates.add(v);
  const samples = Math.min(120, Math.max(30, Math.ceil(vLength / 7)));
  let previous = vMin,
    previousValue = atV(uSamples[1], previous);
  for (let i = 1; i <= samples; i++) {
    const current = vMin + ((vMax - vMin) * i) / samples,
      currentValue = atV(uSamples[1], current);
    if (
      Number.isFinite(previousValue) &&
      Number.isFinite(currentValue) &&
      previousValue * currentValue < 0
    ) {
      let left = previous,
        right = current,
        leftValue = previousValue;
      for (let j = 0; j < 30; j++) {
        const mid = (left + right) / 2,
          value = atV(uSamples[1], mid);
        if (!Number.isFinite(value)) break;
        if (leftValue * value <= 0) right = mid;
        else {
          left = mid;
          leftValue = value;
        }
      }
      candidates.add((left + right) / 2);
    }
    previous = current;
    previousValue = currentValue;
  }
  for (const v of candidates) {
    if (v < vMin - 0.01 || v > vMax + 0.01 || !stationary(v)) continue;
    if (
      lines.some(
        (line) => Math.abs((line[0][horizontal ? 1 : 0] - v) * view.scale) < 2,
      )
    )
      continue;
    lines.push([toPoint(uMin, v), toPoint(uMax, v)]);
  }
  const uOffsets = [
    0,
    -uLength * 0.34,
    uLength * 0.34,
    -uLength * 0.47,
    uLength * 0.47,
  ];
  const vCount = Math.ceil(vLength / spacing);
  for (const uOffset of uOffsets) {
    for (let i = 0; i <= vCount && lines.length < 75; i++) {
      const vOffset =
        (i - vCount / 2) * spacing + (uOffset === 0 ? 0 : spacing * 0.5);
      if (Math.abs(vOffset) > vLength / 2 + spacing / 2) continue;
      const u = (horizontal ? view.x : view.y) + uOffset / view.scale;
      const v = (horizontal ? view.y : view.x) + vOffset / view.scale;
      const p: Point = horizontal ? [u, v] : [v, u];
      if (!Number.isFinite(solution.slope(...p)) || grid.has(key(p))) continue;
      const line = traceIntegralCurve(solution, p, view, width, height);
      const visible = line.filter(
        (q) =>
          Math.abs((q[0] - view.x) * view.scale) < width / 2 + 12 &&
          Math.abs((q[1] - view.y) * view.scale) < height / 2 + 12,
      );
      if (visible.length < 8) continue;
      const stride = Math.max(1, Math.floor(visible.length / 160));
      let newCount = 0,
        total = 0;
      for (let j = 0; j < visible.length; j += stride) {
        total++;
        if (!grid.has(key(visible[j]))) newCount++;
      }
      if (newCount / total < 0.23) continue;
      lines.push(line);
      for (let j = 0; j < visible.length; j += 2) grid.add(key(visible[j]));
    }
  }
  return lines;
}
