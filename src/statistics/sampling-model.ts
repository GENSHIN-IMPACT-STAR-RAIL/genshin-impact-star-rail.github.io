import { mean, sampleVariance } from "./math.ts";
import { validDistribution } from "./workspace-model.ts";
import type { SharedDistribution } from "./workspace-types.ts";

export type SimulationConfig = {
  distribution: SharedDistribution;
  n: number;
  repeats: number;
  seed: number;
  statistic: "mean" | "sum" | "variance";
};
export type SimulationResult = {
  statistics: number[];
  lastSample: number[];
  seed: number;
  config: SimulationConfig;
};
export function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function distributionMoments(d: SharedDistribution): {
  mean: number;
  variance: number;
} {
  switch (d.kind) {
    case "normal":
      return { mean: d.mean, variance: d.sd * d.sd };
    case "binomial":
      return { mean: d.n * d.p, variance: d.n * d.p * (1 - d.p) };
    case "poisson":
      return { mean: d.lambda, variance: d.lambda };
    case "geometric":
      return { mean: 1 / d.p, variance: (1 - d.p) / (d.p * d.p) };
    case "uniform":
      return {
        mean: (d.low + d.high) / 2,
        variance: (d.high - d.low) ** 2 / 12,
      };
    case "exponential":
      return { mean: 1 / d.rate, variance: 1 / d.rate ** 2 };
    case "finite": {
      const m = d.values.reduce((s, v, i) => s + v * d.probabilities[i], 0);
      return {
        mean: m,
        variance: d.values.reduce(
          (s, v, i) => s + (v - m) ** 2 * d.probabilities[i],
          0,
        ),
      };
    }
  }
}
export function validateSimulation(config: SimulationConfig): void {
  if (
    !validDistribution(config.distribution) ||
    !Number.isInteger(config.n) ||
    config.n < 1 ||
    config.n > 2000 ||
    !Number.isInteger(config.repeats) ||
    config.repeats < 1 ||
    config.repeats > 5000 ||
    config.n * config.repeats > 500000 ||
    !Number.isInteger(config.seed) ||
    config.seed < 0 ||
    config.seed > 4294967295 ||
    !["mean", "sum", "variance"].includes(config.statistic)
  )
    throw new RangeError(
      "每批最多 50 万个观测；n≤2000，重复次数≤5000，种子为非负32位整数",
    );
  if (config.statistic === "variance" && config.n < 2)
    throw new RangeError("无偏方差估计需要 n≥2");
  if (
    config.distribution.kind === "poisson" &&
    config.distribution.lambda > 200
  )
    throw new RangeError(
      "当前抽样生成器支持泊松 λ≤200；分布工具仍可计算更大的 λ",
    );
  if (
    config.distribution.kind === "binomial" &&
    config.n * config.repeats * config.distribution.n > 5e6
  )
    throw new RangeError(
      "该二项模型需生成过多 Bernoulli 试验，请减小样本量或重复次数",
    );
}
export function makeSampler(
  d: SharedDistribution,
  random: () => number,
): () => number {
  if (!validDistribution(d)) throw new Error("分布无效");
  switch (d.kind) {
    case "normal": {
      let spare: number | undefined;
      return () => {
        if (spare !== undefined) {
          const z = spare;
          spare = undefined;
          return d.mean + d.sd * z;
        }
        const radius = Math.sqrt(-2 * Math.log(1 - random())),
          angle = 2 * Math.PI * random();
        spare = radius * Math.sin(angle);
        return d.mean + d.sd * radius * Math.cos(angle);
      };
    }
    case "uniform":
      return () => d.low + (d.high - d.low) * random();
    case "exponential":
      return () => -Math.log(1 - random()) / d.rate;
    case "geometric":
      return d.p === 1
        ? () => 1
        : () => Math.floor(Math.log(1 - random()) / Math.log1p(-d.p)) + 1;
    case "binomial":
      return () => {
        let count = 0;
        for (let i = 0; i < d.n; i++) if (random() < d.p) count++;
        return count;
      };
    case "poisson": {
      if (d.lambda === 0) return () => 0;
      const chunks = Math.ceil(d.lambda / 20),
        threshold = Math.exp(-d.lambda / chunks);
      return () => {
        let result = 0;
        for (let j = 0; j < chunks; j++) {
          let product = 1,
            k = 0;
          do {
            k++;
            product *= 1 - random();
          } while (product > threshold);
          result += k - 1;
        }
        return result;
      };
    }
    case "finite": {
      const cdf: number[] = [];
      let total = 0;
      d.probabilities.forEach((p) => {
        total += p;
        cdf.push(total);
      });
      return () => {
        const u = random() * total;
        let lo = 0,
          hi = cdf.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (u < cdf[mid]) hi = mid;
          else lo = mid + 1;
        }
        return d.values[lo];
      };
    }
  }
}
export function simulate(
  config: SimulationConfig,
  progress?: (done: number, values: number[]) => void,
): SimulationResult {
  validateSimulation(config);
  const sample = makeSampler(config.distribution, seededRandom(config.seed));
  const statistics: number[] = [];
  let lastSample: number[] = [];
  for (let repeat = 0; repeat < config.repeats; repeat++) {
    lastSample = Array.from({ length: config.n }, sample);
    const value =
      config.statistic === "mean"
        ? mean(lastSample)
        : config.statistic === "sum"
          ? mean(lastSample) * config.n
          : sampleVariance(lastSample);
    if (!Number.isFinite(value)) throw new Error("生成样本超出有限数值范围");
    statistics.push(value);
    if (progress && (repeat % 50 === 49 || repeat === config.repeats - 1))
      progress(repeat + 1, statistics);
  }
  return { statistics, lastSample, seed: config.seed, config };
}
export function histogram(
  values: number[],
  bins = 20,
): { x: number; y: number }[] {
  if (!values.length) return [];
  const min = Math.min(...values),
    max = Math.max(...values);
  if (min === max) return [{ x: min, y: 1 }];
  const width = (max - min) / bins,
    counts = Array<number>(bins).fill(0);
  values.forEach(
    (value) => counts[Math.min(bins - 1, Math.floor((value - min) / width))]++,
  );
  return counts.map((count, i) => ({
    x: min + (i + 0.5) * width,
    y: count / (values.length * width),
  }));
}
