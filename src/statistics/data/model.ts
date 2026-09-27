import type { CountingState, DataState, ProbabilityState } from "./state.ts";

export type Moments = {
  n: number;
  sum: number;
  sumSquares: number;
  mean: number;
  variance: number;
  unbiased: number | null;
  sd: number;
  minimum?: number;
  maximum?: number;
};
export type FrequencyRow = { x: number; f: number };
export type GroupRow = { low: number; high: number; f: number };
const boundedNumber = (s: string, limit = 1e12) => {
  const n = Number(s);
  if (!s.trim() || !Number.isFinite(n) || Math.abs(n) > limit)
    throw new Error("数据必须是有限数字，绝对值不超过 " + limit + "。");
  return n;
};
export function numericList(text: string, max = 2000): number[] {
  if (!text.trim()) throw new Error("请输入数据；空白不作为零。");
  const tokens = text.trim().split(/[\s,，;；]+/);
  if (tokens.length > max) throw new Error(`最多支持 ${max} 项。`);
  return tokens.map((x) => boundedNumber(x));
}
function rows(text: string, columns: number): number[][] {
  const lines = text
    .trim()
    .split(/[\r\n;；]+/)
    .filter((x) => x.trim());
  if (!lines.length || lines.length > 500)
    throw new Error("请提供 1–500 行数据。");
  return lines.map((line, i) => {
    const t = line.trim().split(/[\s,，]+/);
    if (t.length !== columns)
      throw new Error(`第 ${i + 1} 行需要 ${columns} 列，不能缺省。`);
    return t.map((x) => boundedNumber(x));
  });
}
function frequency(n: number) {
  if (!Number.isInteger(n) || n < 0 || n > 1e8)
    throw new Error("频数须为 0–100000000 的整数。");
  return n;
}
export function parseFrequency(text: string): FrequencyRow[] {
  const merged = new Map<number, number>();
  for (const [x, f] of rows(text, 2))
    merged.set(x, (merged.get(x) ?? 0) + frequency(f));
  const out = [...merged].map(([x, f]) => ({ x, f })).sort((a, b) => a.x - b.x);
  checkTotal(out);
  return out;
}
export function parseGroups(text: string): GroupRow[] {
  const out = rows(text, 3)
    .map(([low, high, f]) => {
      if (!(high > low)) throw new Error("每组上界必须大于下界。");
      return { low, high, f: frequency(f) };
    })
    .sort((a, b) => a.low - b.low);
  if (out.some((v, i) => i > 0 && v.low < out[i - 1].high))
    throw new Error("组区间不能重叠；输入连续组界，不自动修正测量边界。");
  checkTotal(out);
  return out;
}
function checkTotal(rows: { f: number }[]) {
  const n = rows.reduce((s, x) => s + x.f, 0);
  if (n <= 0 || n > 1e8) throw new Error("总频数必须在 1–100000000 之间。");
}
export function rawFrequency(values: number[]): FrequencyRow[] {
  const m = new Map<number, number>();
  for (const x of values) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m].map(([x, f]) => ({ x, f })).sort((a, b) => a.x - b.x);
}
export function equalWidthGroups(
  table: FrequencyRow[],
  bins: number,
): GroupRow[] {
  checkTotal(table);
  if (!Number.isInteger(bins) || bins < 1 || bins > 30)
    throw new Error("自动分组数须为 1–30 的整数。");
  const used = table.filter((r) => r.f > 0),
    min = Math.min(...used.map((r) => r.x)),
    max = Math.max(...used.map((r) => r.x));
  if (min === max) {
    const halfWidth = Math.max(1, Math.abs(min) * 1e-6) / 2;
    return [
      {
        low: min - halfWidth,
        high: max + halfWidth,
        f: used.reduce((a, b) => a + b.f, 0),
      },
    ];
  }
  const actualBins = Math.min(
    bins,
    Math.max(
      1,
      Math.floor(
        (max - min) /
          (Math.max(1, Math.abs(min), Math.abs(max)) * Number.EPSILON * 2),
      ),
    ),
  );
  const width = (max - min) / actualBins,
    groups = Array.from({ length: actualBins }, (_, i) => ({
      low: min + i * width,
      high: i === actualBins - 1 ? max : min + (i + 1) * width,
      f: 0,
    }));
  for (const row of used) {
    const index = Math.min(actualBins - 1, Math.floor((row.x - min) / width));
    groups[index].f += row.f;
  }
  return groups;
}
export function weightedMoments(table: FrequencyRow[]): Moments {
  checkTotal(table);
  let n = 0,
    mean = 0,
    m2 = 0,
    sum = 0,
    sumSquares = 0;
  for (const { x, f } of table) {
    if (!Number.isFinite(x) || f < 0) throw new Error("数据无效。");
    if (!f) continue;
    const next = n + f,
      delta = x - mean;
    m2 += (delta * delta * n * f) / next;
    mean += (delta * f) / next;
    n = next;
    sum += x * f;
    sumSquares += x * x * f;
  }
  const used = table.filter((x) => x.f > 0);
  return {
    n,
    mean,
    sum,
    sumSquares,
    variance: m2 / n,
    unbiased: n > 1 ? m2 / (n - 1) : null,
    sd: Math.sqrt(m2 / n),
    minimum: Math.min(...used.map((x) => x.x)),
    maximum: Math.max(...used.map((x) => x.x)),
  };
}
export function summaryMoments(
  n: number,
  sum: number,
  sumSquares: number,
): Moments {
  if (
    !Number.isInteger(n) ||
    n < 1 ||
    !Number.isFinite(sum) ||
    !Number.isFinite(sumSquares) ||
    sumSquares < 0
  )
    throw new Error("汇总量要求 n 为正整数，Σx 与 Σx² 有限且 Σx² ≥ 0。");
  const m2 = sumSquares - (sum * sum) / n,
    tol = 1e-12 * Math.max(1, sumSquares, (sum * sum) / n);
  if (m2 < -tol) throw new Error("汇总量不一致：Σx² 必须至少为 (Σx)²/n。");
  return {
    n,
    sum,
    sumSquares,
    mean: sum / n,
    variance: Math.max(0, m2) / n,
    unbiased: n > 1 ? Math.max(0, m2) / (n - 1) : null,
    sd: Math.sqrt(Math.max(0, m2) / n),
  };
}
export function decodeMoments(m: Moments, a: number, b: number): Moments {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0)
    throw new Error("编码 x = a + by 要求 a、b 有限且 b ≠ 0。");
  const ends =
    m.minimum === undefined || m.maximum === undefined
      ? {}
      : {
          minimum: Math.min(a + b * m.minimum, a + b * m.maximum),
          maximum: Math.max(a + b * m.minimum, a + b * m.maximum),
        };
  return {
    n: m.n,
    sum: m.n * a + b * m.sum,
    sumSquares: m.n * a * a + 2 * a * b * m.sum + b * b * m.sumSquares,
    mean: a + b * m.mean,
    variance: b * b * m.variance,
    unbiased: m.unbiased === null ? null : b * b * m.unbiased,
    sd: Math.abs(b) * m.sd,
    ...ends,
  };
}
export function mergeMoments(a: Moments, b: Moments): Moments {
  const n = a.n + b.n,
    mean = (a.n * a.mean + b.n * b.mean) / n,
    m2 =
      a.n * a.variance +
      b.n * b.variance +
      ((a.mean - b.mean) ** 2 * a.n * b.n) / n;
  return {
    n,
    mean,
    sum: a.sum + b.sum,
    sumSquares: a.sumSquares + b.sumSquares,
    variance: m2 / n,
    sd: Math.sqrt(m2 / n),
    unbiased: m2 / (n - 1),
  };
}
function orderValue(table: FrequencyRow[], rank: number): number {
  let c = 0;
  for (const row of table) {
    c += row.f;
    if (rank <= c) return row.x;
  }
  return table[table.length - 1].x;
}
function rangeMedian(table: FrequencyRow[], start: number, length: number) {
  if (length <= 0) return orderValue(table, 1);
  return (
    (orderValue(table, start + Math.floor((length - 1) / 2)) +
      orderValue(table, start + Math.floor(length / 2))) /
    2
  );
}
export function weightedQuantile(
  table: FrequencyRow[],
  p: number,
  convention: DataState["quartiles"] = "position",
): number {
  checkTotal(table);
  if (p < 0 || p > 1) throw new Error("分位概率须在 [0,1]。");
  const t = table.filter((x) => x.f > 0).sort((a, b) => a.x - b.x),
    n = t.reduce((s, x) => s + x.f, 0);
  if (convention === "halves" && [0.25, 0.5, 0.75].includes(p)) {
    if (p === 0.5) return rangeMedian(t, 1, n);
    const length = Math.floor(n / 2);
    return rangeMedian(t, p === 0.25 ? 1 : Math.ceil(n / 2) + 1, length);
  }
  const rank = Math.max(1, Math.min(n, (n + 1) * p)),
    lo = Math.floor(rank),
    hi = Math.ceil(rank);
  return (
    orderValue(t, lo) + (rank - lo) * (orderValue(t, hi) - orderValue(t, lo))
  );
}
export function groupedQuantile(groups: GroupRow[], p: number): number {
  const n = groups.reduce((s, x) => s + x.f, 0),
    target = p * n;
  const nonempty = groups.filter((g) => g.f);
  if (!nonempty.length || p < 0 || p > 1)
    throw new Error("无有效组或分位概率无效。");
  if (p === 0) return nonempty[0].low;
  let c = 0;
  for (const g of groups) {
    if (g.f && target <= c + g.f)
      return g.low + ((target - c) / g.f) * (g.high - g.low);
    c += g.f;
  }
  return nonempty[nonempty.length - 1].high;
}
export function dataModel(state: DataState) {
  const raw = state.mode === "raw" ? numericList(state.raw) : null,
    groups = state.mode === "grouped" ? parseGroups(state.grouped) : null;
  const table = raw
    ? rawFrequency(raw)
    : state.mode === "frequency"
      ? parseFrequency(state.frequency)
      : groups
        ? groups.map((g) => ({ x: (g.low + g.high) / 2, f: g.f }))
        : null;
  const original = table
      ? weightedMoments(table)
      : summaryMoments(state.n, state.sum, state.sumSquares),
    moments = state.coded
      ? decodeMoments(original, state.codeA, state.codeB)
      : original;
  const transform = (x: number) =>
    state.coded ? state.codeA + state.codeB * x : x;
  const transformedTable =
    table &&
    table.map((v) => ({ x: transform(v.x), f: v.f })).sort((a, b) => a.x - b.x);
  const transformedGroups =
    groups &&
    groups
      .map((g) => ({
        low: Math.min(transform(g.low), transform(g.high)),
        high: Math.max(transform(g.low), transform(g.high)),
        f: g.f,
      }))
      .sort((a, b) => a.low - b.low);
  if (transformedGroups?.some((g) => g.high <= g.low))
    throw new Error(
      "编码后的组界无法在当前浮点精度下区分，请调整编码比例或平移量。",
    );
  const quantile = (p: number) =>
    transformedGroups
      ? groupedQuantile(transformedGroups, p)
      : transformedTable
        ? weightedQuantile(transformedTable, p, state.quartiles)
        : null;
  return {
    moments,
    original,
    raw,
    groups: transformedGroups,
    table: transformedTable,
    values: raw?.map(transform) ?? null,
    quantile,
  };
}

export function factorial(n: number): bigint {
  if (!Number.isInteger(n) || n < 0 || n > 100)
    throw new Error("阶乘参数须为 0–100 的整数。");
  let result = 1n;
  for (let k = 2; k <= n; k++) result *= BigInt(k);
  return result;
}
export function choose(n: number, r: number): bigint {
  if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || n > 100)
    throw new Error("组合参数无效。");
  if (r < 0 || r > n) return 0n;
  let value = 1n;
  for (let k = 1; k <= Math.min(r, n - r); k++)
    value = (value * BigInt(n - k + 1)) / BigInt(k);
  return value;
}
export function integerList(text: string) {
  const list = numericList(text, 30);
  if (
    list.some((x) => !Number.isInteger(x) || x <= 0) ||
    list.reduce((s, x) => s + x, 0) > 100
  )
    throw new Error("类别/组大小须为正整数，总对象数最多 100。");
  return list;
}
export function multisetSelections(capacities: number[], r: number): bigint {
  if (
    !Number.isInteger(r) ||
    r < 0 ||
    r > 100 ||
    capacities.length > 30 ||
    capacities.some((c) => !Number.isInteger(c) || c < 0 || c > 100) ||
    capacities.reduce((a, b) => a + b, 0) > 100
  )
    throw new Error("多重集选择要求类别容量非负，总容量和 r 均不超过 100。");
  let coefficients = Array<bigint>(r + 1).fill(0n);
  coefficients[0] = 1n;
  for (const capacity of capacities) {
    const next = Array<bigint>(r + 1).fill(0n);
    for (let selected = 0; selected <= r; selected++)
      for (let take = 0; take <= Math.min(capacity, r - selected); take++)
        next[selected + take] += coefficients[selected];
    coefficients = next;
  }
  return coefficients[r];
}
export function memberIds(text: string, n: number): number[] {
  if (!text.trim()) return [];
  const out = text
    .trim()
    .toUpperCase()
    .split(/[\s,，;；]+/)
    .map((label) => {
      const i = /^[A-Z]$/.test(label)
        ? label.charCodeAt(0) - 65
        : /^X\d+$/.test(label)
          ? Number(label.slice(1)) - 1
          : NaN;
      if (!Number.isInteger(i) || i < 0 || i >= n)
        throw new Error(
          `成员 ${label} 不在当前对象集合中；用 A–Z 或 X27、X28 等标签。`,
        );
      return i;
    });
  if (new Set(out).size !== out.length)
    throw new Error("同一个成员不能重复列出。");
  return out;
}
export type CountingResult = {
  count: bigint;
  steps: string[];
  preview: string[];
  previewTotal: number | null;
  population: number;
  formula: string;
};
const token = (i: number) =>
  i < 26 ? String.fromCharCode(65 + i) : `X${i + 1}`;
export function permutationAllowed(
  items: number[],
  state: CountingState,
): boolean {
  const positions = items
    .map((x, i) => (x < state.k ? i : -1))
    .filter((x) => x >= 0);
  if (state.template === "adjacent")
    return Math.max(...positions) - Math.min(...positions) + 1 === state.k;
  if (state.template === "nonadjacent")
    return positions.every((v, i) => i === 0 || v - positions[i - 1] > 1);
  if (state.template === "notall")
    return Math.max(...positions) - Math.min(...positions) + 1 !== state.k;
  if (state.template === "endpoint")
    return items[0] === 0 || items[items.length - 1] === 0;
  if (state.template === "distance")
    return Math.abs(items.indexOf(0) - items.indexOf(1)) === state.distance;
  return true;
}
function smallPermutations(
  n: number,
  r: number,
  accept: (a: number[]) => boolean,
): { values: string[]; total: number } {
  let total = 0;
  const values: string[] = [];
  const walk = (a: number[], remaining: number[]) => {
    if (a.length === r) {
      if (accept(a)) {
        total++;
        if (values.length < 60) values.push(a.map(token).join(" "));
      }
      return;
    }
    for (const x of remaining)
      walk(
        [...a, x],
        remaining.filter((v) => v !== x),
      );
  };
  walk(
    [],
    Array.from({ length: n }, (_, i) => i),
  );
  return { values, total };
}
function combinations<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  const walk = (start: number, a: T[]) => {
    if (a.length === size) {
      out.push(a);
      return;
    }
    for (let i = start; i <= items.length - (size - a.length); i++)
      walk(i + 1, [...a, items[i]]);
  };
  walk(0, []);
  return out;
}
export function countModel(s: CountingState): CountingResult {
  const { n, r, k } = s;
  let count = 0n,
    steps: string[] = [],
    formula = "",
    population = n,
    preview: string[] = [],
    previewTotal: number | null = null;
  if (
    ["adjacent", "nonadjacent", "notall"].includes(s.template) &&
    (k < 1 || k > n)
  )
    throw new Error("指定对象数 k 须在 1 到 n 之间。");
  if (s.template === "permutation") {
    if (r > n) throw new Error("有序选取数 r 不能超过 n。");
    count = factorial(n) / factorial(n - r);
    formula = `P(${n},${r}) = ${n}! / (${n}-${r})!`;
    steps = [
      `第 1 个位置有 ${n} 种，第 2 个有 ${n - 1} 种；依次放置 ${r} 个对象。`,
      "对象均可区分；未选中的对象没有排列。",
    ];
  }
  if (s.template === "repeated") {
    const sizes = integerList(s.repeated);
    population = sizes.reduce((a, b) => a + b, 0);
    const divisor = sizes.reduce((a, b) => a * factorial(b), 1n);
    count = factorial(population) / (s.distinguish ? 1n : divisor);
    formula = `${population}!${s.distinguish ? "" : ` / (${sizes.map((x) => `${x}!`).join(" × ")})`}`;
    steps = [
      `先将 ${population} 个实体全部标号，共 ${factorial(population)} 种排列。`,
      s.distinguish
        ? "同字母也保留实体标签，每种标号排列是不同结果。"
        : `交换同类别的内部标签不会产生新结果；每类结果被重复计算 ${divisor} 次，因此除重。`,
    ];
    if (population <= 8) {
      const tokens = sizes.flatMap((c, i) =>
        Array.from({ length: c }, (_, j) =>
          s.distinguish ? `${token(i)}${j + 1}` : token(i),
        ),
      );
      const freq = new Map<string, number>();
      tokens.forEach((t) => freq.set(t, (freq.get(t) ?? 0) + 1));
      let total = 0;
      const walk = (a: string[]) => {
        if (a.length === population) {
          total++;
          if (preview.length < 60) preview.push(a.join(" "));
          return;
        }
        for (const [t, f] of freq) {
          if (!f) continue;
          freq.set(t, f - 1);
          walk([...a, t]);
          freq.set(t, f);
        }
      };
      walk([]);
      previewTotal = total;
    }
  }
  if (s.template === "multiset") {
    const sizes = integerList(s.repeated);
    population = sizes.reduce((a, b) => a + b, 0);
    count = s.distinguish
      ? choose(population, r)
      : multisetSelections(sizes, r);
    formula = s.distinguish
      ? `C(${population},${r})`
      : `[x^${r}] ${sizes.map((c) => `(1+x+…+x^${c})`).join(" ")}`;
    steps = s.distinguish
      ? [
          `将每个实体标号，从 ${population} 个不同实体中无序选 ${r} 个。`,
          "忽略抽取先后顺序，同字母实体仍可区分。",
        ]
      : [
          `令各类选取数为 u₁、u₂、…，要求 0≤uᵢ≤各类容量且 Σuᵢ=${r}。`,
          "每个可行的数量向量只计一次；某类选取 2 个相同物品不会产生 C(容量,2) 个不同选择。",
          "逐类累积系数：新的总数 = 对该类所有允许选取数求和，使用整数动态规划精确计算。",
        ];
    if (s.distinguish && population <= 12) {
      const entities = sizes.flatMap((c, i) =>
        Array.from({ length: c }, (_, j) => `${token(i)}${j + 1}`),
      );
      const all = combinations(entities, r);
      previewTotal = all.length;
      preview = all.slice(0, 60).map((a) => a.join(" "));
    }
    if (!s.distinguish && population <= 20 && sizes.length <= 10) {
      let total = 0;
      const walk = (i: number, left: number, picked: number[]) => {
        if (i === sizes.length) {
          if (left === 0) {
            total++;
            if (preview.length < 60)
              preview.push(picked.map((x, j) => `${token(j)}×${x}`).join("，"));
          }
          return;
        }
        for (let take = 0; take <= Math.min(sizes[i], left); take++)
          walk(i + 1, left - take, [...picked, take]);
      };
      walk(0, r, []);
      previewTotal = total;
    }
  }
  if (s.template === "adjacent" || s.template === "notall") {
    const together = factorial(n - k + 1) * factorial(k);
    count = s.template === "adjacent" ? together : factorial(n) - together;
    formula =
      s.template === "adjacent"
        ? `(${n}-${k}+1)! × ${k}!`
        : `${n}! − (${n}-${k}+1)! × ${k}!`;
    steps = [
      `将指定的前 ${k} 个对象捆绑成一块，与其余对象组成 ${n - k + 1} 个可区分单元。`,
      `块内可以重新排列 ${k}! 种，故全相邻有 ${together} 种。`,
      s.template === "notall"
        ? "不全相邻 = 全部排列 − 全相邻；它允许其中某些对象相邻。"
        : "块内、块外的每次选择唯一确定一个合法排列。",
    ];
  }
  if (s.template === "nonadjacent") {
    count = factorial(n - k) * choose(n - k + 1, k) * factorial(k);
    formula = `(${n}-${k})! × C(${n - k + 1},${k}) × ${k}!`;
    steps = [
      `先排列另外 ${n - k} 个对象，形成 ${n - k + 1} 个空隙（含两端）。`,
      `为指定的 ${k} 个对象选 ${k} 个不同空隙，再排列这些对象。`,
      k > n - k + 1
        ? "空隙不足，因此不存在合法排列。"
        : "每个空隙至多放一个指定对象，保证逐对不相邻。",
    ];
  }
  if (s.template === "endpoint") {
    if (n < 1) throw new Error("端点模板至少需要 1 个对象。");
    count = n === 1 ? 1n : 2n * factorial(n - 1);
    formula = n === 1 ? "1" : `2 × (${n}-1)!`;
    steps = [
      "指定对象 A 必须位于左端或右端。",
      n === 1
        ? "只有一个位置，左右端是同一位置，不能乘 2。"
        : "选择端点后，剩余对象自由排列。",
    ];
  }
  if (s.template === "distance") {
    if (n < 2) throw new Error("距离模板至少需要 2 个对象。");
    count =
      s.distance < n ? BigInt(2 * (n - s.distance)) * factorial(n - 2) : 0n;
    formula = `2 × max(${n}-${s.distance},0) × (${n}-2)!`;
    steps = [
      `对象 A、B 的位置编号之差恰好为 ${s.distance}（中间有 ${s.distance - 1} 个位置）。`,
      "先选左侧位置，再选 A、B 的左右顺序，剩余对象任意排列。",
    ];
  }
  if (s.template === "selection") {
    const objects = Array.from({ length: n }, (_, i) => i);
    const mandatory = s.requiredMembers.trim()
      ? memberIds(s.requiredMembers, n)
      : objects.slice(0, s.required);
    const forbidden = s.excludedMembers.trim()
      ? memberIds(s.excludedMembers, n)
      : objects.filter((i) => !mandatory.includes(i)).slice(0, s.excluded);
    const candidates = objects.filter(
      (i) => !mandatory.includes(i) && !forbidden.includes(i),
    );
    const category = s.quotaMembers.trim()
      ? memberIds(s.quotaMembers, n)
      : candidates.slice(0, s.quotaSize);
    const available = candidates.length,
      need = r - mandatory.length,
      quotaSize = category.length;
    if (
      (!s.requiredMembers.trim() && s.required > n) ||
      (!s.excludedMembers.trim() && s.excluded > n - mandatory.length) ||
      mandatory.some((i) => forbidden.includes(i)) ||
      category.some((i) => !candidates.includes(i)) ||
      r > n ||
      (!s.quotaMembers.trim() && s.quotaSize > available) ||
      s.quotaMin > s.quotaMax
    )
      throw new Error("必选、排除、类别大小或配额范围不相容。");
    steps = [
      `必选：${mandatory.map(token).join("、") || "无"}；排除：${forbidden.map(token).join("、") || "无"}。从其余 ${available} 个中选 ${need} 个。`,
      `配额类别为 ${category.map(token).join("、") || "空集"}，在剩余候选中有 ${quotaSize} 个；须从这类选 ${s.quotaMin}–${s.quotaMax} 个。`,
    ];
    for (let j = s.quotaMin; j <= Math.min(s.quotaMax, quotaSize); j++) {
      const term =
        choose(quotaSize, j) * choose(available - quotaSize, need - j);
      count += term;
      if (term)
        steps.push(
          `选该类 ${j} 个：C(${quotaSize},${j}) × C(${available - quotaSize},${need - j}) = ${term}`,
        );
    }
    formula = "Σ C(配额类人数,j) C(其他候选人数,还需人数−j)";
    if (n <= 12) {
      const all =
        need >= 0 && need <= available
          ? combinations(candidates, need).filter((a) => {
              const q = a.filter((x) => category.includes(x)).length;
              return q >= s.quotaMin && q <= s.quotaMax;
            })
          : [];
      previewTotal = all.length;
      preview = all.slice(0, 60).map((a) =>
        [...mandatory, ...a]
          .sort((a, b) => a - b)
          .map(token)
          .join(" "),
      );
    }
  }
  if (s.template === "groups") {
    const sizes = integerList(s.groups);
    population = sizes.reduce((a, b) => a + b, 0);
    const base =
        factorial(population) / sizes.reduce((a, b) => a * factorial(b), 1n),
      freq = new Map<number, number>();
    sizes.forEach((z) => freq.set(z, (freq.get(z) ?? 0) + 1));
    const divisor = [...freq.values()].reduce((a, b) => a * factorial(b), 1n);
    count = base / (s.named ? 1n : divisor);
    formula = `${population}! / (${sizes.map((x) => `${x}!`).join(" × ")}${
      s.named
        ? ""
        : ` × ${
            [...freq.values()]
              .filter((x) => x > 1)
              .map((x) => `${x}!`)
              .join(" × ") || "1"
          }`
    })`;
    steps = [
      `各组内部无顺序，先把 ${population}! 除以各组内部排列数，得到 ${base} 个具名分配。`,
      s.named
        ? "组 1、组 2 等具名，交换组名得到不同分配。"
        : `无名分组只对大小相同的组互换除重：除数 ${divisor}。不同大小的组可按人数区分，不再除。`,
    ];
    if (population <= 8) {
      const seen = new Set<string>();
      const walk = (left: number[], groups: number[][]) => {
        if (groups.length === sizes.length) {
          const named = groups.map((g) => g.map(token).join(" ")),
            key = s.named ? named.join(" | ") : [...named].sort().join(" | ");
          if (!seen.has(key)) {
            seen.add(key);
            if (preview.length < 60)
              preview.push(
                s.named
                  ? named.map((g, i) => `组${i + 1}: ${g}`).join(" | ")
                  : key,
              );
          }
          return;
        }
        for (const part of combinations(left, sizes[groups.length]))
          walk(
            left.filter((x) => !part.includes(x)),
            [...groups, part],
          );
      };
      walk(
        Array.from({ length: population }, (_, i) => i),
        [],
      );
      previewTotal = seen.size;
    }
  }
  if (
    !["repeated", "multiset", "selection", "groups"].includes(s.template) &&
    n <= 8
  ) {
    const out = smallPermutations(
      n,
      s.template === "permutation" ? r : n,
      (a) => permutationAllowed(a, s),
    );
    preview = out.values;
    previewTotal = out.total;
  }
  return { count, steps, formula, population, preview, previewTotal };
}

export type Outcome = {
  label: string;
  p: number;
  A: boolean;
  B: boolean;
  path?: { label: string; p: number }[];
};
export type EventSummary = {
  a: number;
  b: number;
  intersection: number;
  union: number;
  conditional: number | null;
  denominator: number;
  cells: number[];
  independent: boolean;
  exclusive: boolean;
};
export function eventSummary(
  outcomes: Outcome[],
  direction: ProbabilityState["direction"],
): EventSummary {
  const sum = outcomes.reduce((s, x) => s + x.p, 0);
  if (
    !outcomes.length ||
    Math.abs(sum - 1) > 1e-8 ||
    outcomes.some((x) => !Number.isFinite(x.p) || x.p < 0 || x.p > 1)
  )
    throw new Error("结果概率必须非负且总和为 1；不自动把类别当等可能。");
  let a = 0,
    b = 0,
    intersection = 0;
  const cells = [0, 0, 0, 0];
  for (const o of outcomes) {
    if (o.A) a += o.p;
    if (o.B) b += o.p;
    if (o.A && o.B) intersection += o.p;
    cells[(o.A ? 0 : 2) + (o.B ? 0 : 1)] += o.p;
  }
  a = Math.min(1, a);
  b = Math.min(1, b);
  intersection = Math.min(intersection, a, b);
  const denominator = direction === "A|B" ? b : a;
  return {
    a,
    b,
    intersection,
    union: Math.min(1, a + b - intersection),
    conditional: denominator === 0 ? null : intersection / denominator,
    denominator,
    cells,
    independent:
      Math.abs(intersection - a * b) <=
      2e-12 * Math.max(intersection, a * b, Number.MIN_VALUE),
    exclusive: intersection === 0,
  };
}
export function parseOutcomes(text: string): Outcome[] {
  const lines = text
    .trim()
    .split(/[\r\n]+/)
    .filter((x) => x.trim());
  if (!lines.length || lines.length > 500)
    throw new Error("事件表支持 1–500 行。");
  return lines.map((line, i) => {
    const parts = line.trim().split(/[\s,，]+/);
    if (parts.length !== 4)
      throw new Error(`第 ${i + 1} 行须为：名称 概率 属于A(0/1) 属于B(0/1)。`);
    const p = boundedNumber(parts[1]);
    if (
      p < 0 ||
      p > 1 ||
      !["0", "1"].includes(parts[2]) ||
      !["0", "1"].includes(parts[3])
    )
      throw new Error(`第 ${i + 1} 行概率或事件标记无效。`);
    return { label: parts[0], p, A: parts[2] === "1", B: parts[3] === "1" };
  });
}
export function bagOutcomes(
  red: number,
  blue: number,
  draws: number,
  replacement: ProbabilityState["replacement"],
  stop: ProbabilityState["stop"],
): Outcome[] {
  if (
    !Number.isInteger(red) ||
    !Number.isInteger(blue) ||
    red < 0 ||
    blue < 0 ||
    red + blue === 0 ||
    red + blue > 60 ||
    !Number.isInteger(draws) ||
    draws < 1 ||
    draws > 10
  )
    throw new Error("球数非负、总数 1–60；最多抽 10 次。");
  const out: Outcome[] = [];
  const walk = (
    r: number,
    b: number,
    path: { label: string; p: number }[],
    p: number,
    success: number,
  ) => {
    const reached =
      stop === "first-red"
        ? success >= 1
        : stop === "second-red"
          ? success >= 2
          : false;
    if (path.length === draws || reached || r + b === 0) {
      out.push({
        label: path.map((x) => x.label).join("→"),
        p,
        A: success >= 1,
        B: path[0]?.label === "红",
        path,
      });
      return;
    }
    if (r > 0)
      walk(
        replacement === "no" ? r - 1 : r,
        b,
        [...path, { label: "红", p: r / (r + b) }],
        (p * r) / (r + b),
        success + 1,
      );
    if (b > 0)
      walk(
        r,
        replacement === "yes" ? b : b - 1,
        [...path, { label: "蓝", p: b / (r + b) }],
        (p * b) / (r + b),
        success,
      );
  };
  walk(red, blue, [], 1, 0);
  return out;
}
export function sourcePrior(
  target: number,
  p1: number,
  p2: number,
): number | null {
  if (p1 === p2) {
    if (Math.abs(target - p1) > 1e-12)
      throw new Error("两来源成功率相同且不等于目标，总概率无解。");
    return null;
  }
  const prior = (target - p2) / (p1 - p2);
  if (prior < 0 || prior > 1)
    throw new Error("目标总概率超出两来源成功率之间，来源比例无解。");
  return prior;
}
export function rthSuccessProbability(p: number, r: number, k: number): number {
  if (
    p < 0 ||
    p > 1 ||
    !Number.isInteger(r) ||
    !Number.isInteger(k) ||
    r < 1 ||
    k < r ||
    k > 100
  )
    throw new Error("要求 0≤p≤1，1≤r≤k≤100。");
  return Number(choose(k - 1, r - 1)) * p ** r * (1 - p) ** (k - r);
}
export function probabilityModel(s: ProbabilityState): {
  outcomes: Outcome[];
  eventA: string;
  eventB: string;
  notes: string[];
} {
  if (s.template === "table")
    return {
      outcomes: parseOutcomes(s.outcomes),
      eventA: "事件表中 A=1",
      eventB: "事件表中 B=1",
      notes: [
        "每行是一类互不重叠的结果，使用所填概率权重。可用掷硬币、转盘或有限过程终点自行构造表。",
      ],
    };
  if (s.template === "dice") {
    const outcomes: Outcome[] = [];
    for (let a = 1; a <= s.dieSides; a++)
      for (let b = 1; b <= s.dieSides; b++)
        outcomes.push({
          label: `(${a},${b})`,
          p: 1 / (s.dieSides * s.dieSides),
          A: a + b >= s.eventA,
          B: a >= s.eventB,
        });
    return {
      outcomes,
      eventA: `两骰之和 ≥ ${s.eventA}`,
      eventB: `第一骰 ≥ ${s.eventB}`,
      notes: ["两枚公平且独立的骰子；有序点数对等可能，点数和并非等可能。"],
    };
  }
  if (s.template === "bag")
    return {
      outcomes: bagOutcomes(s.red, s.blue, s.draws, s.replacement, s.stop),
      eventA: "至少一次红球",
      eventB: "第一次是红球",
      notes: [
        s.replacement === "yes"
          ? "每次两色都放回，各次成功概率相同且独立。"
          : s.replacement === "no"
            ? "每支按库存更新概率；红、蓝均不放回。"
            : "依颜色放回：红球放回，蓝球不放回；成功概率随路径改变。",
        s.stop === "fixed"
          ? `最多抽 ${s.draws} 次；若袋空则立即停止。`
          : `遇到第 ${s.stop === "first-red" ? 1 : 2} 次红球后立即停止，最迟 ${s.draws} 次，袋空也停止。`,
        s.replacement === "yes" && s.stop === "fixed"
          ? "固定次数下红球总数可用二项分布。"
          : "依赖抽取或提前停止时，不将终点红球数直接标为同一固定 n 的二项分布。",
      ],
    };
  if (s.template === "source") {
    const q = s.sourceP,
      a = s.sourceA,
      b = s.sourceB;
    return {
      outcomes: [
        {
          label: "来源1→成功",
          p: q * a,
          A: true,
          B: true,
          path: [
            { label: "来源1", p: q },
            { label: "成功", p: a },
          ],
        },
        {
          label: "来源1→失败",
          p: q * (1 - a),
          A: false,
          B: true,
          path: [
            { label: "来源1", p: q },
            { label: "失败", p: 1 - a },
          ],
        },
        {
          label: "来源2→成功",
          p: (1 - q) * b,
          A: true,
          B: false,
          path: [
            { label: "来源2", p: 1 - q },
            { label: "成功", p: b },
          ],
        },
        {
          label: "来源2→失败",
          p: (1 - q) * (1 - b),
          A: false,
          B: false,
          path: [
            { label: "来源2", p: 1 - q },
            { label: "失败", p: 1 - b },
          ],
        },
      ],
      eventA: "最终成功",
      eventB: "选中来源 1",
      notes: ["先选来源，再按该来源成功率试验；这是全概率与贝叶斯模板。"],
    };
  }
  const p = rthSuccessProbability(s.successP, s.successR, s.successK);
  return {
    outcomes: [
      {
        label: `第 ${s.successR} 次成功恰在第 ${s.successK} 次`,
        p,
        A: true,
        B: true,
      },
      { label: "其余路径", p: 1 - p, A: false, B: true },
    ],
    eventA: `第 ${s.successR} 次成功恰在第 ${s.successK} 次`,
    eventB: "整个样本空间",
    notes: [
      `每次独立，成功概率 p=${s.successP}；前 ${s.successK - 1} 次恰有 ${s.successR - 1} 次成功，最后一次成功。`,
      `P = C(${s.successK - 1},${s.successR - 1}) p^${s.successR} (1-p)^${s.successK - s.successR}；显示的是事件聚合，未把这两类视为等可能。`,
    ],
  };
}
