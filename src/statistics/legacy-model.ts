import { mean, tSf } from "./math.ts";
export function regression(xs: number[], ys: number[]) {
  if (
    xs.length !== ys.length ||
    xs.length < 3 ||
    xs.some((x) => !Number.isFinite(x)) ||
    ys.some((y) => !Number.isFinite(y))
  )
    throw new Error("两列须一一配对，至少三个有限观测");
  const mx = mean(xs),
    my = mean(ys),
    sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0),
    syy = ys.reduce((s, y) => s + (y - my) ** 2, 0),
    sxy = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  if (sxx === 0 || syy === 0)
    throw new Error("两列都须有变化，否则相关系数未定义");
  const r = Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy))),
    b = sxy / sxx,
    a = my - b * mx,
    bReverse = sxy / syy,
    aReverse = mx - bReverse * my;
  const statistic =
    Math.abs(r) === 1 ? Infinity : r * Math.sqrt((xs.length - 2) / (1 - r * r));
  return {
    n: xs.length,
    mx,
    my,
    r,
    b,
    a,
    bReverse,
    aReverse,
    statistic,
    pValue: Math.min(1, 2 * tSf(Math.abs(statistic), xs.length - 2)),
    df: xs.length - 2,
  };
}
