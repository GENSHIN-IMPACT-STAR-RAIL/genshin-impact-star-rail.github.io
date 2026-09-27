import { parse, type MathNode } from "mathjs/number";
export type Parameters = Record<string, number>;
const functions = new Set([
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "sinh",
  "cosh",
  "tanh",
  "sqrt",
  "abs",
  "exp",
  "log",
  "log10",
  "floor",
  "ceil",
]);
const letter = /^[A-Za-zα-ωΑ-Ω]$/u;
const reserved = new Set(["x", "pi", "e"]);

// Tokenize mathematical handwriting before parsing. In particular, ab^2 is
// a*b^2 (not (a*b)^2), and asin(x) remains the inverse sine function.
export function normalizeExpression(raw: string) {
  const source = raw
    .trim()
    .replace(/^y\s*=\s*/i, "")
    .replace(/π/g, "pi")
    .replace(/−/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3");
  const tokens: { value: string; kind: string }[] = [];
  const names = [...functions, "ln"].sort((a, b) => b.length - a.length);
  for (let i = 0; i < source.length;) {
    if (/\s/.test(source[i])) {
      i++;
      continue;
    }
    const rest = source.slice(i);
    const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
    if (number) {
      tokens.push({ value: number[0], kind: "number" });
      i += number[0].length;
      continue;
    }
    const fn = names.find(
      (name) => rest.startsWith(name) && /^\s*\(/.test(rest.slice(name.length)),
    );
    if (fn) {
      tokens.push({ value: fn === "ln" ? "log" : fn, kind: "function" });
      i += fn.length;
      continue;
    }
    if (rest.startsWith("pi")) {
      tokens.push({ value: "pi", kind: "symbol" });
      i += 2;
      continue;
    }
    const ch = source[i++];
    if (letter.test(ch)) tokens.push({ value: ch, kind: "symbol" });
    else if ("+-*/^()".includes(ch))
      tokens.push({
        value: ch,
        kind: ch === "(" ? "open" : ch === ")" ? "close" : "operator",
      });
    else
      throw new Error(
        `暂不支持字符「${ch}」；参数请使用单个英文字母或希腊字母`,
      );
  }
  return tokens
    .map((token, i) => {
      const prev = tokens[i - 1];
      const multiply =
        prev &&
        ["number", "symbol", "close"].includes(prev.kind) &&
        ["number", "symbol", "function", "open"].includes(token.kind);
      return (multiply ? "*" : "") + token.value;
    })
    .join("");
}
export function compileExpression(raw: string) {
  if (raw.length > 240) throw new Error("表达式请控制在 240 字符以内");
  const text = normalizeExpression(raw);
  if (!text) throw new Error("输入一个关于 x 的表达式");
  if (text.length > 240) throw new Error("表达式请控制在 240 字符以内");
  let node: MathNode;
  try {
    node = parse(text);
  } catch {
    throw new Error("表达式尚不完整，请检查括号和运算符");
  }
  let count = 0;
  const params = new Set<string>();
  node.traverse((n: MathNode) => {
    if (++count > 100) throw new Error("表达式过于复杂，请简化");
    if (
      ![
        "OperatorNode",
        "ConstantNode",
        "SymbolNode",
        "FunctionNode",
        "ParenthesisNode",
      ].includes(n.type)
    )
      throw new Error("这里只支持实数函数表达式");
    if (
      n.type === "OperatorNode" &&
      !["+", "-", "*", "/", "^"].includes((n as any).op)
    )
      throw new Error("暂不支持这个运算符");
    if (n.type === "FunctionNode" && !functions.has((n as any).fn.name))
      throw new Error("暂不支持此函数");
    if (n.type === "SymbolNode") {
      const name = (n as any).name as string;
      if (!reserved.has(name) && !functions.has(name) && !letter.test(name))
        throw new Error(`无法识别 ${name}`);
      if (!reserved.has(name) && letter.test(name)) params.add(name);
    }
  });
  const compiled = node.compile();
  return {
    params: [...params],
    evaluate: (x: number, values: Parameters) => {
      try {
        const scope: Parameters = {};
        for (const name of params) scope[name] = values[name] ?? 1;
        const y = compiled.evaluate({ ...scope, x });
        return typeof y === "number" && Number.isFinite(y) ? y : NaN;
      } catch {
        return NaN;
      }
    },
  };
}
export { DEFAULT_VIEW, curveSegments, type View } from "./plot.ts";
