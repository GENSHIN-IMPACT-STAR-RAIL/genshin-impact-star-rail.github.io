import {
  ComputeEngine,
  type MathJsonExpression as J,
} from "@cortex-js/compute-engine";
import type { AnalysisCurve, Pick, Hit } from "./analysis";

// A separate engine keeps symbolic work out of MathLive's editing context.
const ce = new ComputeEngine();
ce.timeLimit = 150;
ce.iterationLimit = 120;
export type ExactValue = { latex: string; text: string; value: number };
export type ExactPoint = [ExactValue | null, ExactValue | null];
const box = (j: J) => ce.box(j);
const has = (j: J, name: string): boolean =>
  j === name ||
  (Array.isArray(j) && (j as J[]).slice(1).some((x) => has(x, name)));
const subst = (j: J, values: Record<string, J>): J =>
  typeof j === "string"
    ? (values[j] ?? j)
    : Array.isArray(j)
      ? [j[0], ...j.slice(1).map((x) => subst(x, values))]
      : j;
const exactAtoms = (j: J): boolean =>
  typeof j === "number"
    ? Number.isSafeInteger(j)
    : typeof j === "object" && j !== null && !Array.isArray(j)
      ? "num" in j && /^[+-]?\d+$/.test(String(j.num))
      : Array.isArray(j)
        ? j.slice(1).every(exactAtoms)
        : !["NaN", "ComplexInfinity", "Infinity", "Undefined"].includes(
            String(j),
          );
function decimal(text: string): J {
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match) throw new Error("请输入有限的数值");
  const [, sign, whole, frac = "", exponent = "0"] = match;
  const power = Number(exponent) - frac.length;
  if (Math.abs(power) > 60) throw new Error("数值过大或过小");
  let a = BigInt((whole || "0") + frac) * (sign === "-" ? -1n : 1n),
    b = 1n;
  if (power > 0) a *= 10n ** BigInt(power);
  else b = 10n ** BigInt(-power);
  const atom = (n: bigint): J =>
    n <= BigInt(Number.MAX_SAFE_INTEGER) && n >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(n)
      : { num: n.toString() };
  return ["Rational", atom(a), atom(b)];
}
function rationalize(j: J): J {
  if (typeof j === "number")
    return Number.isSafeInteger(j) ? j : decimal(String(j));
  if (Array.isArray(j)) return [j[0], ...(j as J[]).slice(1).map(rationalize)];
  if (typeof j === "object" && j !== null && "num" in j)
    return decimal(String(j.num));
  return j;
}
function parse(latex: string): J {
  if (latex.length > 1500) throw new Error("表达式过长");
  return box(rationalize(ce.parse(latex, { form: "raw" }).json)).json;
}

// CE can approximate even with numericApproximation:false (e.g. ln(2)).
// Protect unevaluated functions before doing exact algebraic simplification.
function simplify(j: J): J {
  const protectedValues: Record<string, J> = {},
    names = new Map<string, string>();
  const protect = (v: J): J => {
    const key = JSON.stringify(v);
    let name = names.get(key);
    if (!name) {
      name = `exactConstant${names.size}`;
      names.set(key, name);
      protectedValues[name] = v;
    }
    return name;
  };
  const mask = (v: J): J => {
    if (!Array.isArray(v)) return v;
    const op = String(v[0]),
      args = (v as J[]).slice(1).map(mask),
      node: J = [op, ...args];
    if (op === "Abs") {
      const evaluated = box(node).evaluate().json;
      return exactAtoms(evaluated) ? evaluated : node;
    }
    if (["Sin", "Cos", "Tan"].includes(op)) {
      const arg = simplify(subst(args[0], protectedValues));
      if (arg === 0 || has(arg, "Pi")) {
        const coeff = box(["Divide", arg, "Pi"]).simplify().json;
        if (
          arg === 0 ||
          (typeof coeff === "number" && Number.isInteger(coeff)) ||
          (Array.isArray(coeff) && coeff[0] === "Rational")
        ) {
          const evaluated = box([op, arg]).evaluate().json;
          if (
            exactAtoms(evaluated) &&
            JSON.stringify(evaluated) !== JSON.stringify([op, arg])
          )
            return mask(evaluated);
        }
      }
      return protect([op, arg]);
    }
    if (
      [
        "Ln",
        "Log",
        "Exp",
        "Arcsin",
        "Arccos",
        "Arctan",
        "Sinh",
        "Cosh",
        "Tanh",
      ].includes(op)
    ) {
      const arg = subst(args[0], protectedValues);
      if (op === "Ln" && arg === 1) return 0;
      if (op === "Ln" && arg === "ExponentialE") return 1;
      if (op === "Exp" && arg === 0) return 1;
      return protect([op, ...args.map((a) => subst(a, protectedValues))]);
    }
    return node;
  };
  const masked = mask(j);
  let result = box(masked).evaluate().simplify().json;
  if (!exactAtoms(result)) result = box(masked).json;
  return subst(result, protectedValues);
}
const zero = (j: J) => {
  try {
    return simplify(j) === 0;
  } catch {
    return false;
  }
};
const numeric = (j: J) => box(j).N().re;
function value(j: J): ExactValue | null {
  try {
    const s = simplify(j),
      e = box(s),
      n = numeric(s);
    if (
      !exactAtoms(s) ||
      !Number.isFinite(n) ||
      e.N().im !== 0 ||
      e.unknowns.length ||
      /Integrate|Derivative|Error|EvaluateAt/.test(JSON.stringify(s))
    )
      return null;
    const latex = e.latex;
    if (latex.length > 250) return null;
    return {
      latex,
      text: e
        .toString()
        .replace(/sqrt\(([^()]*)\)/g, "√($1)")
        .replace(/\bpi\b|\bPi\b/g, "π")
        .replace(/\*/g, "·"),
      value: n,
    };
  } catch {
    return null;
  }
}
const from = (v: ExactValue): J => parse(v.latex);
export function exactInput(text: string): ExactValue {
  if (
    !text.trim() ||
    text.length > 100 ||
    !/^[\d\s+\-−*/().^πepirsqt]+$/i.test(text)
  )
    throw new Error("坐标可输入分数、sqrt(2) 或 pi/4");
  const brackets: boolean[] = [];
  let rooted = "";
  for (let i = 0; i < text.length; i++) {
    const root = /^sqrt\s*\(/i.exec(text.slice(i));
    if (root) {
      rooted += "\\sqrt{";
      brackets.push(true);
      i += root[0].length - 1;
    } else if (text[i] === "(") {
      brackets.push(false);
      rooted += "(";
    } else if (text[i] === ")") rooted += brackets.pop() ? "}" : ")";
    else rooted += text[i];
  }
  const latex = rooted
    .replace(/−/g, "-")
    .replace(/(\d+(?:\.\d*)?|\.\d+)[eE]([+-]?\d+)/g, "($1\\cdot 10^{$2})")
    .replace(/pi|π/gi, "\\pi ")
    .replace(/\*/g, "\\cdot ");
  const v = value(parse(latex));
  if (!v) throw new Error("请输入有限的常数坐标");
  return v;
}
function diff(j: J, v: string): J {
  if (!has(j, v)) return 0;
  if (j === v) return 1;
  if (!Array.isArray(j)) throw new Error("不支持的导数");
  const [op, ...a] = j;
  switch (op) {
    case "Add":
      return ["Add", ...a.map((x) => diff(x, v))];
    case "Subtract":
      return ["Subtract", diff(a[0], v), diff(a[1], v)];
    case "Negate":
      return ["Negate", diff(a[0], v)];
    case "Multiply":
      return [
        "Add",
        ...a.map(
          (_, i) =>
            ["Multiply", ...a.map((x, k) => (k === i ? diff(x, v) : x))] as J,
        ),
      ];
    case "Divide":
      return [
        "Divide",
        [
          "Subtract",
          ["Multiply", diff(a[0], v), a[1]],
          ["Multiply", a[0], diff(a[1], v)],
        ],
        ["Power", a[1], 2],
      ];
    case "Power":
      if (!has(a[1], v))
        return [
          "Multiply",
          a[1],
          ["Power", a[0], ["Subtract", a[1], 1]],
          diff(a[0], v),
        ];
      if (!has(a[0], v))
        return [
          "Multiply",
          j,
          a[0] === "ExponentialE" ? 1 : ["Ln", a[0]],
          diff(a[1], v),
        ];
      break;
    case "Sqrt":
      return ["Divide", diff(a[0], v), ["Multiply", 2, ["Sqrt", a[0]]]];
    case "Sin":
      return ["Multiply", ["Cos", a[0]], diff(a[0], v)];
    case "Cos":
      return ["Negate", ["Multiply", ["Sin", a[0]], diff(a[0], v)]];
    case "Tan":
      return ["Divide", diff(a[0], v), ["Power", ["Cos", a[0]], 2]];
    case "Exp":
      return ["Multiply", ["Exp", a[0]], diff(a[0], v)];
    case "Ln":
      return ["Divide", diff(a[0], v), a[0]];
  }
  throw new Error("暂不能符号求导");
}
type Model = { variable: string; x?: J; y?: J; radius?: J; field?: J };
const models = new WeakMap<AnalysisCurve, Model | null>();
function model(c: AnalysisCurve): Model | null {
  if (models.has(c)) return models.get(c)!;
  try {
    const substitutions: Record<string, J> = {};
    for (const [key, n] of Object.entries(c.parameters ?? {})) {
      const symbol = ce.parse(key).json;
      if (typeof symbol === "string")
        substitutions[symbol] = decimal(String(n));
    }
    const read = (s: string) => simplify(subst(parse(s), substitutions));
    let m: Model;
    if (c.kind === "implicit") {
      const e = subst(parse(c.value), substitutions);
      m = {
        variable: "x",
        field:
          Array.isArray(e) && e[0] === "Equal" ? ["Subtract", e[1], e[2]] : e,
      };
    } else if (c.kind === "explicit")
      m = { variable: "x", x: "x", y: read(c.value) };
    else if (c.kind === "parametric")
      m = { variable: "t", x: read(c.left!), y: read(c.value) };
    else {
      const left = read(c.left ?? "r"),
        rhs = read(c.value);
      // Differentiate a degree <= 2 polynomial to obtain its exact coefficients.
      const a = simplify(["Divide", diff(diff(left, "r"), "r"), 2]);
      const b = simplify(subst(diff(left, "r"), { r: 0 }));
      const constant = simplify(["Subtract", subst(left, { r: 0 }), rhs]);
      let r: J;
      if (zero(a)) r = simplify(["Divide", ["Negate", constant], b]);
      else {
        if (!Number.isFinite(numeric(a)))
          throw new Error("二次系数随角度变化，暂不进行分支精确化");
        const disc: J = [
          "Subtract",
          ["Power", b, 2],
          ["Multiply", 4, a, constant],
        ];
        // Match the numerical engine's descending root order, including a < 0.
        const sign = numeric(a) < 0 ? -1 : 1,
          branch = c.key.endsWith(":1") ? -1 : 1;
        r = simplify([
          "Divide",
          ["Add", ["Negate", b], ["Multiply", sign * branch, ["Sqrt", disc]]],
          ["Multiply", 2, a],
        ]);
      }
      m = {
        variable: "theta",
        radius: r,
        x: ["Multiply", r, ["Cos", "theta"]],
        y: ["Multiply", r, ["Sin", "theta"]],
      };
    }
    models.set(c, m);
    return m;
  } catch {
    models.set(c, null);
    return null;
  }
}
const near = (a: number, b: number, tol = 3e-8) =>
  Math.abs(a - b) < tol * Math.max(1, Math.abs(b));
function candidates(n: number): ExactValue[] {
  const out: ExactValue[] = [];
  const add = (j: J) => {
    const e = value(j);
    if (e && near(e.value, n, 3e-8) && !out.some((v) => v.latex === e.latex))
      out.push(e);
  };
  for (let q = 1; q <= 48; q++) {
    const p = Math.round(n * q);
    if (Math.abs(p) < 10000 && near(p / q, n)) {
      add(["Rational", p, q]);
      break;
    }
  }
  for (let q = 1; q <= 48; q++) {
    const p = Math.round((n / Math.PI) * q);
    if (p && Math.abs(p) <= 200 && near((p * Math.PI) / q, n)) {
      add(["Multiply", ["Rational", p, q], "Pi"]);
      break;
    }
  }
  for (let d = 2; d <= 48; d++) {
    if (Number.isInteger(Math.sqrt(d))) continue;
    for (let q = 1; q <= 16; q++) {
      const p = Math.round((n / Math.sqrt(d)) * q);
      if (p && Math.abs(p) <= 48 && near((p * Math.sqrt(d)) / q, n)) {
        add(["Multiply", ["Rational", p, q], ["Sqrt", d]]);
        break;
      }
    }
  }
  if (!out.length)
    for (let q = 1; q <= 12; q++)
      for (let d = 2; d <= 48; d++)
        for (const s of [-1, 1]) {
          if (Number.isInteger(Math.sqrt(d))) continue;
          const a = Math.round(n * q - s * Math.sqrt(d));
          if (a && Math.abs(a) <= 24 && near((a + s * Math.sqrt(d)) / q, n)) {
            add(["Divide", ["Add", a, ["Multiply", s, ["Sqrt", d]]], q]);
            if (out.length) return out;
          }
        }
  return out;
}
export function exactAt(c: AnalysisCurve, u: ExactValue): ExactPoint | null {
  const m = model(c);
  if (!m?.x || !m.y) return null;
  const sub = { [m.variable]: from(u) };
  const x = value(subst(m.x, sub)),
    y = value(subst(m.y, sub)),
    actual = c.at(u.value);
  return x && y && near(x.value, actual[0]) && near(y.value, actual[1])
    ? [x, y]
    : null;
}
export function exactRadius(
  c: AnalysisCurve,
  u?: ExactValue,
): ExactValue | null {
  const m = model(c);
  return m?.radius && u
    ? value(subst(m.radius, { [m.variable]: from(u) }))
    : null;
}
function onCurve(c: AnalysisCurve, xy: ExactPoint, u?: ExactValue): boolean {
  const m = model(c);
  if (!m || !xy[0] || !xy[1]) return false;
  if (m.field) return zero(subst(m.field, { x: from(xy[0]), y: from(xy[1]) }));
  const parameter = c.kind === "explicit" ? xy[0] : u;
  if (!parameter || !m.x || !m.y) return false;
  const sub = { [m.variable]: from(parameter) };
  return (
    zero(["Subtract", subst(m.x, sub), from(xy[0])]) &&
    zero(["Subtract", subst(m.y, sub), from(xy[1])])
  );
}
export function enrichExact(p: Pick, curves: AnalysisCurve[]): Pick {
  if (p.exactXY?.every(Boolean)) return p;
  const cs = p.hits
    .map((h) => curves.find((c) => c.key === h.key))
    .filter((c): c is AnalysisCurve => !!c);
  for (const c of cs) {
    const h = p.hits.find((h) => h.key === c.key)!,
      m = model(c);
    if (!m) continue;
    const us = h.exactU ? [h.exactU] : h.u !== undefined ? candidates(h.u) : [];
    const proposals: { xy: ExactPoint; u?: ExactValue }[] = [];
    if (c.kind !== "implicit")
      for (const u of us) {
        const xy = exactAt(c, u);
        if (xy) proposals.push({ xy, u });
      }
    else
      for (const x of candidates(p.xy[0]))
        for (const y of candidates(p.xy[1])) proposals.push({ xy: [x, y] });
    for (const proposal of proposals) {
      const { xy, u } = proposal;
      if (
        !xy[0] ||
        !xy[1] ||
        !near(xy[0].value, p.xy[0]) ||
        !near(xy[1].value, p.xy[1])
      )
        continue;
      const substitutions = {
        x: from(xy[0]),
        y: from(xy[1]),
        ...(u ? { [m.variable]: from(u) } : {}),
      };
      let confirmed = !!h.exactU;
      if (p.kind === "驻点" || p.kind === "垂直切点") {
        try {
          confirmed = zero(
            subst(
              diff(
                m.field ?? (p.kind === "驻点" ? m.y! : m.x!),
                m.field ? (p.kind === "驻点" ? "x" : "y") : m.variable,
              ),
              substitutions,
            ),
          );
        } catch {
          confirmed = false;
        }
      }
      if (p.kind === "x 轴交点") confirmed = zero(from(xy[1]));
      if (p.kind === "y 轴交点") confirmed = zero(from(xy[0]));
      const updated = p.hits.map((hit) => {
        const other = curves.find((c) => c.key === hit.key)!;
        const exactU =
          other.kind === "explicit"
            ? xy[0]!
            : hit.key === c.key
              ? u
              : (hit.exactU ??
                (hit.u !== undefined
                  ? candidates(hit.u).find((v) => onCurve(other, xy, v))
                  : undefined));
        return { ...hit, exactU };
      });
      if (p.kind === "交点")
        confirmed =
          cs.length >= 2 &&
          updated.every((hit) =>
            onCurve(
              curves.find((c) => c.key === hit.key)!,
              xy,
              hit.exactU,
            ),
          );
      if (confirmed && onCurve(c, xy, u))
        return { ...p, exactXY: xy, hits: updated };
    }
  }
  return p;
}
export function exactTangent(
  c: AnalysisCurve,
  h: Hit,
  xy?: ExactPoint,
): string | null {
  try {
    const m = model(c);
    if (!m || !xy?.[0] || !xy[1] || !onCurve(c, xy, h.exactU)) return null;
    const sub = {
      x: from(xy[0]),
      y: from(xy[1]),
      ...(h.exactU ? { [m.variable]: from(h.exactU) } : {}),
    };
    const dx = simplify(
      subst(m.field ? diff(m.field, "y") : diff(m.x!, m.variable), sub),
    );
    const dy = simplify(
      subst(
        m.field ? ["Negate", diff(m.field, "x")] : diff(m.y!, m.variable),
        sub,
      ),
    );
    if (zero(dx)) return zero(dy) ? null : `x=${xy[0].latex}`;
    const slope = simplify(["Divide", dy, dx]);
    const rhs = value([
      "Subtract",
      from(xy[1]),
      ["Multiply", slope, from(xy[0])],
    ]);
    const s = value(slope);
    if (!s || !rhs) return null;
    return `y=${box(simplify(["Add", ["Multiply", slope, "x"], from(rhs)])).latex}`;
  } catch {
    return null;
  }
}

// Bounded, explicit antiderivative rules. Never infer an exact integral from its decimal value.
function primitive(j: J, v: string, depth = 0): J {
  if (depth > 16) throw new Error("积分过于复杂");
  const e = simplify(j);
  if (!has(e, v)) return ["Multiply", e, v];
  if (e === v) return ["Divide", ["Power", v, 2], 2];
  if (!Array.isArray(e)) throw new Error("没有可用的原函数");
  const [op, ...a] = e,
    recur = (n: J) => primitive(n, v, depth + 1);
  if (op === "Add") return ["Add", ...a.map(recur)];
  if (op === "Negate") return ["Negate", recur(a[0])];
  if (op === "Subtract") return ["Subtract", recur(a[0]), recur(a[1])];
  if (op === "Multiply") {
    const dependent = a.filter((n) => has(n, v)),
      constant = a.filter((n) => !has(n, v));
    if (dependent.length === 1)
      return ["Multiply", ...constant, recur(dependent[0])];
  }
  if (op === "Divide" && !has(a[1], v)) return ["Divide", recur(a[0]), a[1]];
  if (op === "Sqrt") {
    const slope = simplify(diff(a[0], v));
    if (!has(slope, v) && !zero(slope))
      return [
        "Divide",
        ["Multiply", 2, ["Power", a[0], ["Rational", 3, 2]]],
        ["Multiply", 3, slope],
      ];
  }
  if (op === "Divide" && !has(a[0], v)) {
    const slope = simplify(diff(a[1], v));
    if (!has(slope, v) && !zero(slope))
      return ["Divide", ["Multiply", a[0], ["Ln", ["Abs", a[1]]]], slope];
    if (Array.isArray(a[1]) && a[1][0] === "Power" && !has(a[1][2], v)) {
      const base = a[1][1],
        slope = simplify(diff(base, v)),
        power = simplify(["Subtract", 1, a[1][2]]);
      if (!has(slope, v) && !zero(slope) && !zero(power))
        return [
          "Divide",
          ["Multiply", a[0], ["Power", base, power]],
          ["Multiply", slope, power],
        ];
    }
  }
  if (
    op === "Power" &&
    a[1] === 2 &&
    Array.isArray(a[0]) &&
    ["Sin", "Cos"].includes(String(a[0][0]))
  ) {
    const inner = a[0][1],
      s = a[0][0] === "Sin" ? -1 : 1;
    return recur([
      "Add",
      ["Rational", 1, 2],
      ["Multiply", ["Rational", s, 2], ["Cos", ["Multiply", 2, inner]]],
    ]);
  }
  if (op === "Power" && !has(a[0], v)) {
    const slope = simplify(diff(a[1], v));
    if (!has(slope, v) && !zero(slope))
      return [
        "Divide",
        e,
        ["Multiply", slope, a[0] === "ExponentialE" ? 1 : ["Ln", a[0]]],
      ];
  }
  const slope = simplify(diff(a[0], v));
  if (!has(slope, v) && !zero(slope)) {
    if (op === "Power" && !has(a[1], v)) {
      const power = simplify(["Add", a[1], 1]);
      if (zero(power)) return ["Divide", ["Ln", ["Abs", a[0]]], slope];
      return ["Divide", ["Power", a[0], power], ["Multiply", slope, power]];
    }
    if (op === "Sin") return ["Divide", ["Negate", ["Cos", a[0]]], slope];
    if (op === "Cos") return ["Divide", ["Sin", a[0]], slope];
    if (op === "Exp") return ["Divide", e, slope];
  }
  throw new Error("没有可用的原函数");
}
export function exactIntegral(
  c: AnalysisCurve,
  a?: ExactValue,
  b?: ExactValue,
  numerical?: number,
): ExactValue | null {
  try {
    const m = model(c);
    if (!m || m.field || !a || !b) return null;
    const integrand: J =
      c.kind === "polar"
        ? ["Multiply", ["Rational", 1, 2], ["Power", m.radius!, 2]]
        : c.kind === "parametric"
          ? ["Multiply", m.y!, diff(m.x!, m.variable)]
          : m.y!;
    const antiderivative = primitive(integrand, m.variable);
    const result = value([
      "Subtract",
      subst(antiderivative, { [m.variable]: from(b) }),
      subst(antiderivative, { [m.variable]: from(a) }),
    ]);
    return result &&
      (numerical === undefined || near(result.value, numerical, 1e-7))
      ? result
      : null;
  } catch {
    return null;
  }
}
