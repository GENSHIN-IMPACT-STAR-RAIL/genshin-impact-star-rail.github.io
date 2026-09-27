import {
  compileLatex,
  compileMathTree,
  computeEngine,
  type Expr,
} from "./latex.ts";
import type { Parameters } from "./math";
import type { View } from "./plot";
type Fn = (t: number, params: Parameters) => number;
export type CompiledPlot = {
  params: string[];
  numerical: boolean;
  evaluate: Fn;
  branches: Fn[];
  domainGuards: Fn[];
  implicit?: (x: number, y: number, params: Parameters) => number;
  parametric?: (t: number, params: Parameters) => [number, number];
};
export type ParameterRange = { start: number; end: number };
export type CartesianKind = "explicit" | "implicit" | "parametric";
export function compileCartesianEntry(entry: {
  kind?: CartesianKind;
  value: string;
  left?: string;
  tStart?: string;
  tEnd?: string;
}): { fn: CompiledPlot; parameterInterval: ParameterRange | null } {
  if (entry.kind === "implicit")
    return { fn: compileImplicit(entry.value), parameterInterval: null };
  if (entry.kind === "parametric")
    return {
      fn: compileParametric(entry.left ?? "", entry.value),
      parameterInterval: parameterRange(
        entry.tStart ?? "0",
        entry.tEnd ?? "2π",
      ),
    };
  const compiled = compileLatex(entry.value);
  if (compiled.params.includes("y"))
    throw new Error("表达式含 y，请选择“隐函数”类型添加");
  return {
    fn: { ...compiled, branches: [compiled.evaluate] },
    parameterInterval: null,
  };
}
export function parameterRange(start: string, end: string): ParameterRange {
  const bound = (text: string) => {
    if (!text.trim()) throw new Error("请填写 t 的起点和终点");
    if (text.length > 80 || !/^[\d\s+\-−*/().^πepi]+$/i.test(text))
      throw new Error("t 范围可输入数值、分数或 π，如 2π、pi/2");
    const fn = compileLatex(
      text
        .replace(/−/g, "-")
        .replace(
          /(\d+(?:\.\d*)?|\.\d+)[eE]([+-]?\d+)/g,
          (_, mantissa, exponent) => `(${mantissa}\\cdot 10^{${exponent}})`,
        )
        .replace(/pi|π/gi, "\\pi ")
        .replace(/\*/g, "\\cdot "),
    );
    if (fn.params.length) throw new Error("t 范围须为常数");
    const value = fn.evaluate(0, {});
    if (!Number.isFinite(value)) throw new Error("t 范围须为有限数值");
    return value;
  };
  const a = bound(start),
    b = bound(end);
  if (a >= b) throw new Error("t 的终点须大于起点");
  if (b - a > 1000 || Math.max(Math.abs(a), Math.abs(b)) > 10000)
    throw new Error("t 的跨度最多 1000，端点限于 ±10000");
  return { start: a, end: b };
}
export function compileParametric(
  xLatex: string,
  yLatex: string,
): CompiledPlot {
  const x = compileLatex(xLatex, "t"),
    y = compileLatex(yLatex, "t");
  return {
    params: [...new Set([...x.params, ...y.params])],
    numerical: x.numerical || y.numerical,
    evaluate: y.evaluate,
    branches: [y.evaluate],
    domainGuards: [...x.domainGuards, ...y.domainGuards],
    parametric: (t, p) => [x.evaluate(t, p), y.evaluate(t, p)],
  };
}
export function compileImplicit(latex: string): CompiledPlot {
  if (!latex.trim()) throw new Error("输入含 x、y 的等式，如 x²+y²=4");
  if (latex.length > 1500) throw new Error("等式过长，请简化");
  if (/\\placeholder|\\prompt/.test(latex))
    throw new Error("请填写公式中的空框");
  let tree: Expr;
  try {
    tree = computeEngine.parse(latex, { form: "raw" }).json as Expr;
  } catch {
    throw new Error("等式尚不完整");
  }
  if (Array.isArray(tree) && tree[0] === "Equal" && tree.length === 3)
    tree = tree[2] === 0 ? tree[1] : ["Subtract", tree[1], tree[2]];
  // Squaring or taking abs preserves a zero set but removes sign changes.
  while (
    Array.isArray(tree) &&
    ((tree[0] === "Power" && typeof tree[2] === "number" && tree[2] > 0) ||
      ["Square", "Abs", "Delimiter"].includes(tree[0] as string))
  )
    tree = tree[1];
  const containsXY = (n: Expr): boolean =>
    n === "x" || n === "y" || (Array.isArray(n) && n.slice(1).some(containsXY));
  if (!containsXY(tree)) throw new Error("隐函数等式需要包含 x 或 y");
  const fn = compileMathTree(tree, "x", ["y"]);
  if (fn.numerical)
    throw new Error("隐函数暂不支持嵌套数值积分或导数，请先化简等式");
  return {
    ...fn,
    branches: [fn.evaluate],
    implicit: (x, y, params) => fn.evaluate(x, { ...params, y }),
  };
}

type Point = [number, number];
export function implicitSegments(
  fn: (x: number, y: number) => number,
  view: View,
  w: number,
  h: number,
): Point[][] {
  const nx = Math.min(220, Math.max(12, Math.ceil(w / 6))),
    ny = Math.min(180, Math.max(12, Math.ceil(h / 6)));
  const dx = w / nx,
    dy = h / ny,
    values = new Float64Array((nx + 1) * (ny + 1)),
    lines: Point[][] = [];
  const at = (p: Point) =>
    fn(
      view.x + (p[0] - w / 2) / view.scale,
      view.y - (p[1] - h / 2) / view.scale,
    );
  const point = (id: number): Point => [
    (id % (nx + 1)) * dx,
    Math.floor(id / (nx + 1)) * dy,
  ];
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++)
      values[j * (nx + 1) + i] = at([i * dx, j * dy]);
  const cache = new Map<string, Point | null>();
  const edge = (ia: number, ib: number): Point | null => {
    const key = ia < ib ? `${ia}:${ib}` : `${ib}:${ia}`;
    if (cache.has(key)) return cache.get(key)!;
    const a = point(ia),
      b = point(ib),
      fa = values[ia],
      fb = values[ib];
    let root: Point | null = null;
    if (Number.isFinite(fa) && Number.isFinite(fb)) {
      if (fa === 0 && fb === 0) {
        if (at([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]) === 0)
          lines.push([a, b]);
      } else if (fa === 0) root = a;
      else if (fb === 0) root = b;
      else if (Math.sign(fa) !== Math.sign(fb)) {
        let lo = a,
          hi = b,
          fl = fa;
        for (let n = 0; n < 38; n++) {
          const mid: Point = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2],
            fm = at(mid);
          if (!Number.isFinite(fm)) {
            root = null;
            break;
          }
          root = mid;
          if (fm === 0) break;
          if (Math.sign(fm) === Math.sign(fl)) {
            lo = mid;
            fl = fm;
          } else hi = mid;
        }
        // A sign change across a pole is not a root. Reject nonconvergent edges.
        if (
          root &&
          Math.abs(at(root)) >
            Math.max(1e-10, Math.min(Math.abs(fa), Math.abs(fb)) * 1e-4)
        )
          root = null;
      }
    }
    cache.set(key, root);
    return root;
  };
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i,
        b = a + 1,
        d = a + nx + 1,
        c = d + 1;
      const hits = [edge(a, b), edge(b, c), edge(c, d), edge(d, a)];
      const unique = hits.filter(
        (p, k): p is Point =>
          !!p &&
          !hits
            .slice(0, k)
            .some((q) => q && Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-7),
      );
      if (unique.length === 2) lines.push(unique);
      else if (unique.length === 4) {
        const center = at([(i + 0.5) * dx, (j + 0.5) * dy]);
        if (center === 0) {
          const middle: Point = [(i + 0.5) * dx, (j + 0.5) * dy];
          for (const hit of unique) lines.push([hit, middle]);
        } else if (
          Number.isFinite(center) &&
          Math.sign(center) === Math.sign(values[a])
        )
          lines.push([hits[0]!, hits[1]!], [hits[2]!, hits[3]!]);
        else if (Number.isFinite(center))
          lines.push([hits[0]!, hits[3]!], [hits[1]!, hits[2]!]);
      }
    }
  return lines;
}

export function parametricSegments(
  fn: (t: number) => Point,
  range: ParameterRange,
  view: View,
  w: number,
  h: number,
): Point[][] {
  const lines: Point[][] = [];
  let line: Point[] = [];
  let budget = 18000;
  const flush = () => {
    if (line.length > 1) lines.push(line);
    line = [];
  };
  const project = (t: number): Point => {
    const [x, y] = fn(t);
    return [
      w / 2 + (x - view.x) * view.scale,
      h / 2 - (y - view.y) * view.scale,
    ];
  };
  const valid = (p: Point) =>
    p.every(Number.isFinite) &&
    Math.abs(p[0] - w / 2) < w * 4 &&
    Math.abs(p[1] - h / 2) < h * 4;
  const count = Math.min(
    6000,
    Math.max(600, Math.ceil((range.end - range.start) * 100)),
  );
  const refine = (
    ta: number,
    a: Point,
    tb: number,
    b: Point,
    depth: number,
  ) => {
    const tm = (ta + tb) / 2,
      m = project(tm);
    const error = Math.hypot(
      m[0] - (a[0] + b[0]) / 2,
      m[1] - (a[1] + b[1]) / 2,
    );
    if (
      depth > 0 &&
      budget-- > 0 &&
      (valid(a) || valid(b) || valid(m)) &&
      (!valid(a) || !valid(b) || !valid(m) || error > 0.7)
    ) {
      refine(ta, a, tm, m, depth - 1);
      refine(tm, m, tb, b, depth - 1);
      return;
    }
    if (!valid(a) || !valid(b) || !valid(m) || error > 8) {
      flush();
      if (valid(b)) line.push(b);
      return;
    }
    if (!line.length) line.push(a);
    line.push(b);
  };
  let t = range.start,
    p = project(t);
  for (let i = 1; i <= count; i++) {
    const next = range.start + ((range.end - range.start) * i) / count,
      q = project(next);
    refine(t, p, next, q, 12);
    t = next;
    p = q;
  }
  flush();
  return lines;
}
