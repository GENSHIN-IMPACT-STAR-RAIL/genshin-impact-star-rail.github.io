export type Rational = { n: bigint; d: bigint };
export type ExactMass = { x: number; p: Rational };
function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  while (b) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}
export function fraction(n: bigint, d = 1n): Rational {
  if (d === 0n) throw new Error("分母不能为 0。");
  if (d < 0n) ((n = -n), (d = -d));
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}
export function add(a: Rational, b: Rational) {
  return fraction(a.n * b.d + b.n * a.d, a.d * b.d);
}
export function multiply(a: Rational, b: Rational) {
  return fraction(a.n * b.n, a.d * b.d);
}
function decimal(text: string): Rational {
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text))
    throw new Error("精确概率只接受十进制数或整数分数。");
  const sign = text.startsWith("-") ? -1n : 1n;
  const parts = text.replace(/^[+-]/, "").split(".");
  return fraction(
    sign * BigInt((parts[0] || "0") + (parts[1] || "")),
    10n ** BigInt(parts[1]?.length ?? 0),
  );
}
export function rational(text: string): Rational {
  const parts = text.split("/");
  const a = decimal(parts[0]);
  if (parts.length === 1) return a;
  if (parts.length !== 2) throw new Error("分数格式错误。");
  const b = decimal(parts[1]);
  return fraction(a.n * b.d, a.d * b.n);
}
export function rationalText(r: Rational) {
  return r.d === 1n ? String(r.n) : `${r.n}/${r.d}`;
}
export function exactMasses(text: string): ExactMass[] {
  const map = new Map<number, Rational>();
  for (const row of text
    .trim()
    .split(/\n|;/)
    .filter((r) => r.trim())) {
    const [x, p] = row.trim().split(/[,，\s]+/),
      key = Number(x);
    map.set(key, add(map.get(key) ?? fraction(0n), rational(p)));
  }
  const masses = [...map].map(([x, p]) => ({ x, p })).sort((a, b) => a.x - b.x);
  const total = masses.reduce((s, row) => add(s, row.p), fraction(0n));
  if (total.n !== total.d)
    throw new Error(
      "精确有理系数之和必须恰好为 1；请用 1/3 而不是 0.333333 表示精确三分之一。",
    );
  return masses.filter((p) => p.p.n !== 0n);
}
export function exactAffine(
  masses: ExactMass[],
  a: number,
  b: number,
): ExactMass[] {
  const map = new Map<number, Rational>();
  for (const row of masses) {
    const x = a * row.x + b;
    map.set(x, add(map.get(x) ?? fraction(0n), row.p));
  }
  return [...map].map(([x, p]) => ({ x, p })).sort((a, b) => a.x - b.x);
}
export function exactConvolve(masses: ExactMass[]): ExactMass[] {
  const map = new Map<number, Rational>();
  for (const row of masses)
    for (const col of masses) {
      const x = row.x + col.x;
      map.set(x, add(map.get(x) ?? fraction(0n), multiply(row.p, col.p)));
    }
  return [...map].map(([x, p]) => ({ x, p })).sort((a, b) => a.x - b.x);
}
export function polynomialText(masses: ExactMass[], derivative = 0): string {
  return (
    masses
      .map((row) => {
        let multiplier = 1;
        for (let i = 0; i < derivative; i++) multiplier *= row.x - i;
        if (multiplier === 0) return "";
        const c = multiply(row.p, fraction(BigInt(multiplier))),
          power = row.x - derivative;
        return `${rationalText(c)}${power === 0 ? "" : power === 1 ? "·t" : `·t^(${power})`}`;
      })
      .filter(Boolean)
      .join(" + ") || "0"
  );
}
