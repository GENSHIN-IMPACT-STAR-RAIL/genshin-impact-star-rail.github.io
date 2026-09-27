import { normalSurvival } from "./model.ts";

export const normalSf = normalSurvival;
export function normalCdf(z: number): number {
  return z <= 0 ? normalSf(-z) : 1 - normalSf(z);
}
export function normalQuantile(p: number): number {
  if (!Number.isFinite(p) || p < 0 || p > 1)
    throw new RangeError("概率须在 0–1 之间");
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;
  if (p === 0.5) return 0;
  const tail = Math.min(p, 1 - p);
  let lo = 0,
    hi = 39;
  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2;
    if (normalSf(mid) > tail) lo = mid;
    else hi = mid;
  }
  return ((p < 0.5 ? -1 : 1) * (lo + hi)) / 2;
}

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406,
  12.507343278686905, -0.13857109526572012, 9.984369578019572e-6,
  1.5056327351493116e-7,
];
export function logGamma(x: number): number {
  if (!(x > 0) || !Number.isFinite(x))
    throw new RangeError("Gamma 参数须为有限正数");
  if (x < 0.5)
    return (
      Math.log(Math.PI) - Math.log(Math.sin(Math.PI * x)) - logGamma(1 - x)
    );
  const z = x - 1;
  let sum = 0.99999999999980993;
  LANCZOS.forEach((c, i) => {
    sum += c / (z + i + 1);
  });
  const t = z + 7.5;
  return (
    0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum)
  );
}
const tiny = 1e-300;
const nonzero = (x: number) =>
  Math.abs(x) < tiny ? (x < 0 ? -tiny : tiny) : x;
function betaFraction(a: number, b: number, x: number): number {
  const qab = a + b,
    qap = a + 1,
    qam = a - 1;
  let c = 1,
    d = 1 / nonzero(1 - (qab * x) / qap),
    h = d;
  for (let m = 1; m <= 10000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 / nonzero(1 + aa * d);
    c = nonzero(1 + aa / c);
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 / nonzero(1 + aa * d);
    c = nonzero(1 + aa / c);
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 3e-14) return h;
  }
  throw new Error("不完全 Beta 函数未收敛");
}
function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const factor = Math.exp(
    logGamma(a + b) -
      logGamma(a) -
      logGamma(b) +
      a * Math.log(x) +
      b * Math.log1p(-x),
  );
  const result =
    x < (a + 1) / (a + b + 2)
      ? (factor * betaFraction(a, b, x)) / a
      : 1 - (factor * betaFraction(b, a, 1 - x)) / b;
  return Math.max(0, Math.min(1, result));
}
function checkDf(df: number) {
  if (!Number.isFinite(df) || df <= 0 || df > 1e7)
    throw new RangeError("自由度须为 0–10000000 范围内的正数");
}
export function tSf(x: number, df: number): number {
  checkDf(df);
  if (Number.isNaN(x)) throw new RangeError("统计量无效");
  if (x === Infinity) return 0;
  if (x === -Infinity) return 1;
  if (x === 0) return 0.5;
  const half = regularizedBeta(df / (df + x * x), df / 2, 0.5) / 2;
  return x > 0 ? half : 1 - half;
}
export function tCdf(x: number, df: number): number {
  return tSf(-x, df);
}
export function tQuantile(p: number, df: number): number {
  checkDf(df);
  if (!(p >= 0 && p <= 1)) throw new RangeError("概率须在 0–1 之间");
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;
  if (p === 0.5) return 0;
  const tail = Math.min(p, 1 - p);
  let lo = 0,
    hi = 1;
  while (tSf(hi, df) > tail && hi < 1e150) hi *= 2;
  if (hi >= 1e150) throw new RangeError("分位数超过计算范围");
  for (let i = 0; i < 90; i++) {
    const mid = (lo + hi) / 2;
    if (tSf(mid, df) > tail) lo = mid;
    else hi = mid;
  }
  return ((p < 0.5 ? -1 : 1) * (lo + hi)) / 2;
}
/** Returns both regularised gamma tails, computing the smaller tail directly. */
function gammaTails(a: number, x: number): [number, number] {
  if (x <= 0) return [0, 1];
  if (x === Infinity) return [1, 0];
  const exponent = -x + a * Math.log(x) - logGamma(a);
  if (x < a + 1) {
    let ap = a,
      term = 1 / a,
      sum = term;
    for (let i = 0; i < 100000; i++) {
      ap++;
      term *= x / ap;
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 2e-14) {
        const p = Math.min(1, sum * Math.exp(exponent));
        return [p, 1 - p];
      }
    }
  } else {
    let b = x + 1 - a,
      c = 1 / tiny,
      d = 1 / nonzero(b),
      h = d;
    for (let i = 1; i < 100000; i++) {
      const an = -i * (i - a);
      b += 2;
      d = 1 / nonzero(an * d + b);
      c = nonzero(b + an / c);
      const delta = d * c;
      h *= delta;
      if (Math.abs(delta - 1) < 2e-14) {
        const q = Math.min(1, Math.exp(exponent) * h);
        return [1 - q, q];
      }
    }
  }
  throw new Error("不完全 Gamma 函数未收敛");
}
export function chiSquareCdf(x: number, df: number): number {
  checkDf(df);
  if (Number.isNaN(x)) throw new RangeError("统计量无效");
  return gammaTails(df / 2, x / 2)[0];
}
export function chiSquareSf(x: number, df: number): number {
  checkDf(df);
  if (Number.isNaN(x)) throw new RangeError("统计量无效");
  return gammaTails(df / 2, x / 2)[1];
}
export function chiSquareQuantile(p: number, df: number): number {
  checkDf(df);
  if (!(p >= 0 && p <= 1)) throw new RangeError("概率须在 0–1 之间");
  if (p === 0) return 0;
  if (p === 1) return Infinity;
  let lo = 0,
    hi = Math.max(1, df);
  while (
    (p > 0.5 ? chiSquareSf(hi, df) > 1 - p : chiSquareCdf(hi, df) < p) &&
    hi < 1e12
  )
    hi *= 2;
  for (let i = 0; i < 90; i++) {
    const mid = (lo + hi) / 2;
    if (p > 0.5 ? chiSquareSf(mid, df) > 1 - p : chiSquareCdf(mid, df) < p)
      lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
export function mean(values: number[]): number {
  if (!values.length || values.some((x) => !Number.isFinite(x)))
    throw new RangeError("需要非空的有限数值样本");
  let result = 0;
  values.forEach((v, i) => {
    result += (v - result) / (i + 1);
  });
  return result;
}
function variance(values: number[], correction: number): number {
  if (values.length <= correction || values.some((x) => !Number.isFinite(x)))
    throw new RangeError("样本量不足或存在无效数据");
  let average = 0,
    square = 0;
  values.forEach((value, i) => {
    const delta = value - average;
    average += delta / (i + 1);
    square += delta * (value - average);
  });
  return Math.max(0, square / (values.length - correction));
}
export function sampleVariance(values: number[]): number {
  return variance(values, 1);
}
export function populationVariance(values: number[]): number {
  return variance(values, 0);
}
export function parseNumbers(text: string): number[] {
  if (text.length > 150000) throw new RangeError("数据过长");
  const tokens = text
    .trim()
    .split(/[\s,，;；]+/)
    .filter(Boolean);
  if (!tokens.length || tokens.length > 10000)
    throw new RangeError("请输入 1–10000 个数值");
  return tokens.map((token) => {
    const fraction =
      /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\/([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/.exec(
        token,
      );
    if (
      !fraction &&
      !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(token)
    )
      throw new RangeError(`无法识别数值：${token.slice(0, 24)}`);
    const value = fraction
      ? Number(fraction[1]) / Number(fraction[2])
      : Number(token);
    if (!Number.isFinite(value) || Math.abs(value) > 1e100)
      throw new RangeError("数据须为有限数值，绝对值不超过 10¹⁰⁰");
    return value;
  });
}
export function format(value: number, digits = 6): string {
  if (!Number.isFinite(value))
    return value === Infinity ? "∞" : value === -Infinity ? "−∞" : "未定义";
  if (value === 0) return "0";
  if (Math.abs(value) < 10 ** -digits || Math.abs(value) >= 1e8)
    return value.toExponential(Math.min(5, digits));
  return Number(value.toPrecision(digits)).toString();
}
