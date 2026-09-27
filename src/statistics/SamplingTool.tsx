import { useEffect, useRef, useState } from "react";
import {
  Field,
  Formula,
  Notice,
  NumberField,
  Panel,
  Plot,
  Result,
} from "./shared";
import { useStatisticsWorkspace, useToolState } from "./workspace";
import {
  distributionMoments,
  histogram,
  validateSimulation,
  type SimulationConfig,
  type SimulationResult,
} from "./sampling-model";
import { format, mean, sampleVariance } from "./math";
import type { SharedDistribution, ToolSpec } from "./workspace-types";
import {
  SamplingDesign,
  initialDesign,
  validSamplingDesign,
  type SamplingDesignState,
} from "./SamplingDesign";
type State = {
  population: "normal" | "uniform" | "exponential" | "dice" | "shared";
  n: number;
  repeats: number;
  seed: number;
  statistic: SimulationConfig["statistic"];
  result: SimulationResult | null;
  design: SamplingDesignState;
};
const initial: State = {
  population: "exponential",
  n: 25,
  repeats: 500,
  seed: 20260925,
  statistic: "mean",
  result: null,
  design: initialDesign,
};
const finite = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x);
function validState(value: unknown): boolean {
  const s = value as State;
  if (
    !s ||
    typeof s !== "object" ||
    !["normal", "uniform", "exponential", "dice", "shared"].includes(
      s.population,
    ) ||
    !["mean", "sum", "variance"].includes(s.statistic) ||
    !Number.isInteger(s.n) ||
    s.n < 1 ||
    s.n > 2000 ||
    !Number.isInteger(s.repeats) ||
    s.repeats < 1 ||
    s.repeats > 5000 ||
    !Number.isInteger(s.seed) ||
    s.seed < 0 ||
    s.seed > 4294967295
  )
    return false;
  if (!validSamplingDesign(s.design)) return false;
  if (s.result === null) return true;
  try {
    validateSimulation(s.result.config);
    return (
      Array.isArray(s.result.statistics) &&
      s.result.statistics.length === s.result.config.repeats &&
      s.result.statistics.every(finite) &&
      Array.isArray(s.result.lastSample) &&
      s.result.lastSample.length === s.result.config.n &&
      s.result.lastSample.every(finite) &&
      s.result.seed === s.result.config.seed
    );
  } catch {
    return false;
  }
}
function SamplingTool() {
  const [state, setState] = useToolState<State>("sampling");
  const { shared, share, navigate, resultsHidden } = useStatisticsWorkspace();
  const [running, setRunning] = useState(false),
    [done, setDone] = useState(0),
    [preview, setPreview] = useState<number[]>([]),
    [error, setError] = useState("");
  const worker = useRef<Worker | null>(null);
  const distribution: SharedDistribution =
    state.population === "normal"
      ? { kind: "normal", mean: 10, sd: 3 }
      : state.population === "uniform"
        ? { kind: "uniform", low: 0, high: 12 }
        : state.population === "exponential"
          ? { kind: "exponential", rate: 0.2 }
          : state.population === "dice"
            ? {
                kind: "finite",
                values: [1, 2, 3, 4, 5, 6],
                probabilities: Array(6).fill(1 / 6),
              }
            : (shared.distribution ?? { kind: "normal", mean: 0, sd: 1 });
  const fingerprint = JSON.stringify({
    population: state.population,
    n: state.n,
    repeats: state.repeats,
    seed: state.seed,
    statistic: state.statistic,
    distribution,
  });
  useEffect(() => {
    worker.current?.terminate();
    worker.current = null;
    setRunning(false);
    setDone(0);
    setPreview([]);
    setError("");
    return () => {
      worker.current?.terminate();
      worker.current = null;
    };
  }, [fingerprint]);
  const moments = distributionMoments(distribution);
  const expected =
    state.statistic === "sum"
      ? state.n * moments.mean
      : state.statistic === "variance"
        ? moments.variance
        : moments.mean;
  const theoreticalSD =
    state.statistic === "variance"
      ? null
      : Math.sqrt(
          moments.variance *
            (state.statistic === "sum" ? state.n : 1 / state.n),
        );
  const currentResult =
    state.result &&
    JSON.stringify(state.result.config) ===
      JSON.stringify({
        distribution,
        n: state.n,
        repeats: state.repeats,
        seed: state.seed,
        statistic: state.statistic,
      })
      ? state.result
      : null;
  const stats = running ? preview : (currentResult?.statistics ?? []);
  const start = () => {
    setError("");
    const config: SimulationConfig = {
      distribution,
      n: state.n,
      repeats: state.repeats,
      seed: state.seed,
      statistic: state.statistic,
    };
    try {
      if (state.population === "shared" && !shared.distribution)
        throw new Error("请先从分布工具发送一个模型，或选择内置总体");
      validateSimulation(config);
      worker.current?.terminate();
      const active = new Worker(
        new URL("./simulation.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = active;
      setRunning(true);
      setDone(0);
      setPreview([]);
      active.onmessage = (e) => {
        if (worker.current !== active) return;
        if (e.data.type === "progress") {
          setDone(e.data.done);
          setPreview(e.data.statistics);
        }
        if (e.data.type === "done") {
          setState((old) => ({ ...old, result: e.data.result }));
          setRunning(false);
          active.terminate();
          worker.current = null;
        }
        if (e.data.type === "error") {
          setError(e.data.message);
          setRunning(false);
          active.terminate();
          worker.current = null;
        }
      };
      active.onerror = () => {
        setError("抽样任务未完成，请缩小规模后重试");
        setRunning(false);
        active.terminate();
        worker.current = null;
      };
      active.postMessage(config);
    } catch (e) {
      setError(e instanceof Error ? e.message : "输入无效");
    }
  };
  const density = (x: number) => {
    if (distribution.kind === "normal")
      return (
        Math.exp(-0.5 * ((x - distribution.mean) / distribution.sd) ** 2) /
        (distribution.sd * Math.sqrt(2 * Math.PI))
      );
    if (distribution.kind === "uniform")
      return x >= distribution.low && x <= distribution.high
        ? 1 / (distribution.high - distribution.low)
        : 0;
    if (distribution.kind === "exponential")
      return x >= 0 ? distribution.rate * Math.exp(-distribution.rate * x) : 0;
    return 0;
  };
  let popSeries: {
    kind: "bar" | "line";
    data: { x: number; y: number }[];
    name: string;
  }[];
  if (distribution.kind === "finite")
    popSeries = [
      {
        kind: "bar",
        data: distribution.values.map((x, i) => ({
          x,
          y: distribution.probabilities[i],
        })),
        name: "总体分布",
      },
    ];
  else if (["normal", "uniform", "exponential"].includes(distribution.kind)) {
    const lower =
      distribution.kind === "normal"
        ? moments.mean - 4 * Math.sqrt(moments.variance)
        : distribution.kind === "uniform"
          ? distribution.low
          : 0;
    const upper =
      distribution.kind === "normal"
        ? moments.mean + 4 * Math.sqrt(moments.variance)
        : distribution.kind === "uniform"
          ? distribution.high
          : (5 / moments.mean) * moments.mean ** 2;
    popSeries = [
      {
        kind: "line",
        data: Array.from({ length: 180 }, (_, i) => {
          const x = lower + ((upper - lower) * i) / 179;
          return { x, y: density(x) };
        }),
        name: "总体分布",
      },
    ];
  } else popSeries = [];
  const normalOverlay =
    theoreticalSD && state.statistic !== "variance"
      ? Array.from({ length: 180 }, (_, i) => {
          const x =
            expected - 4 * theoreticalSD + (8 * theoreticalSD * i) / 179;
          return {
            x,
            y:
              Math.exp(-0.5 * ((x - expected) / theoreticalSD) ** 2) /
              (theoreticalSD * Math.sqrt(2 * Math.PI)),
          };
        })
      : [];
  return (
    <div className="stats-stack">
      <Panel title="从总体抽一组，再重复很多组">
        <div className="stats-grid">
          <Field label="总体模型">
            <select
              className="stats-input"
              value={state.population}
              onChange={(e) =>
                setState({
                  ...state,
                  population: e.target.value as State["population"],
                })
              }
            >
              <option value="normal">正态 N(10,9)</option>
              <option value="uniform">均匀 U(0,12)</option>
              <option value="exponential">偏态总体：密度 0.2e⁻⁰·²ˣ，x≥0</option>
              <option value="dice">公平骰子</option>
              <option value="shared">其他工具发送的模型</option>
            </select>
          </Field>
          <Field label="记录的统计量">
            <select
              className="stats-input"
              value={state.statistic}
              onChange={(e) =>
                setState({
                  ...state,
                  statistic: e.target.value as State["statistic"],
                })
              }
            >
              <option value="mean">样本均值</option>
              <option value="sum">样本和</option>
              <option value="variance">无偏样本方差（n−1）</option>
            </select>
          </Field>
          <NumberField
            label="每组样本量 n"
            value={state.n}
            min={1}
            max={2000}
            step={1}
            onChange={(n) => setState({ ...state, n })}
          />
          <NumberField
            label="重复次数 R"
            value={state.repeats}
            min={1}
            max={5000}
            step={1}
            onChange={(repeats) => setState({ ...state, repeats })}
          />
          <NumberField
            label="随机种子"
            value={state.seed}
            min={0}
            max={4294967295}
            step={1}
            onChange={(seed) => setState({ ...state, seed })}
          />
        </div>
        <div className="stats-toolbar">
          <button
            className="stats-button primary"
            onClick={start}
            disabled={running}
          >
            运行抽样
          </button>
          {running && (
            <button
              className="stats-button"
              onClick={() => {
                worker.current?.terminate();
                worker.current = null;
                setRunning(false);
                setPreview([]);
              }}
            >
              停止
            </button>
          )}
          <span>
            {running
              ? `已完成 ${done} / ${state.repeats} 组`
              : currentResult
                ? `已完成 ${currentResult.statistics.length} 组，可用同一种子重复`
                : "每次观测独立，使用相同总体"}
          </span>
        </div>
        {error && <Notice tone="warning">{error}</Notice>}
        {state.population === "shared" && (
          <Notice>
            {shared.distribution
              ? `已收到 ${shared.distribution.kind} 模型；模型改变后需重新抽样。`
              : "尚未收到分布模型。也可在数据工具中将原始样本作为经验总体发送。"}
          </Notice>
        )}
      </Panel>
      <div className="stats-grid">
        <Panel title="① 总体">
          {popSeries.length ? (
            <Plot
              series={popSeries}
              xLabel="原始变量 X"
              yLabel="总体概率 / 密度"
              height={230}
            />
          ) : (
            <Notice>
              使用发送的 {distribution.kind} 模型直接生成独立观测。理论均值{" "}
              {format(moments.mean)}，方差 {format(moments.variance)}。
            </Notice>
          )}
        </Panel>
        <Panel title="② 最后一组样本">
          <Plot
            series={[
              {
                kind: "points",
                data:
                  currentResult?.lastSample.map((y, i) => ({ x: i + 1, y })) ??
                  [],
                name: "单组观测",
              },
            ]}
            xLabel="观测序号"
            yLabel="观测值"
            height={230}
          />
        </Panel>
      </div>
      <Panel title="③ 样本统计量的分布">
        <Plot
          series={[
            { kind: "bar", data: histogram(stats), name: "重复抽样的经验密度" },
            ...(normalOverlay.length
              ? [
                  {
                    kind: "line" as const,
                    data: normalOverlay,
                    name:
                      distribution.kind === "normal"
                        ? "理论正态密度"
                        : "CLT 正态近似",
                  },
                ]
              : []),
          ]}
          xLabel={
            state.statistic === "mean"
              ? "样本均值"
              : state.statistic === "sum"
                ? "样本和"
                : "无偏方差估计"
          }
          yLabel="密度"
          markers={[{ x: expected, label: "理论中心" }]}
        />
        <div className="stats-results">
          <Result label="理论中心" value={format(expected)} />
          <Result
            label="模拟平均值"
            value={stats.length ? format(mean(stats)) : "等待抽样"}
          />
          <Result
            label={state.statistic === "mean" ? "理论标准误" : "理论标准差"}
            value={
              theoreticalSD === null
                ? "方差估计量不叠加正态曲线"
                : format(theoreticalSD)
            }
          />
          <Result
            label="模拟标准差"
            value={
              stats.length > 1 ? format(Math.sqrt(sampleVariance(stats))) : "—"
            }
          />
        </div>
      </Panel>
      <Notice>
        n 决定每一组用了多少观测；R 决定经验分布有多少点。增加 R
        不改变理论标准误。正态总体的均值分布为精确正态；其他有限方差总体使用 CLT
        近似，不保证小样本已近似良好。
      </Notice>
      <Formula
        value={
          "E(\\bar X)=\\mu,\\quad \\operatorname{Var}(\\bar X)=\\frac{\\sigma^2}{n},\\quad S^2=\\frac{\\sum(X_i-\\bar X)^2}{n-1}"
        }
      />
      {state.statistic === "variance" && stats.length > 0 && (
        <Panel title="为什么分母用 n−1？">
          <Plot
            series={[
              {
                kind: "bar",
                data: histogram(stats),
                name: "分母 n−1 的估计量",
              },
              {
                kind: "line",
                data: histogram(
                  stats.map((v) => (v * (state.n - 1)) / state.n),
                ),
                name: "分母 n 的估计量",
              },
            ]}
            xLabel="估计的总体方差"
            yLabel="经验密度"
            markers={[{ x: moments.variance, label: "真方差" }]}
          />
          <div className="stats-results">
            <Result label="n−1 估计的模拟均值" value={format(mean(stats))} />
            <Result
              label="n 估计的模拟均值"
              value={format((mean(stats) * (state.n - 1)) / state.n)}
            />
          </div>
          <Notice>
            这是重复抽样意义下的偏差；无偏不保证每一次估计都更接近真值。
          </Notice>
        </Panel>
      )}
      {currentResult && (
        <Panel title="继续分析这一次样本">
          <div className="stats-toolbar">
            <button
              className="stats-button"
              onClick={() => {
                share({
                  sample: currentResult.lastSample,
                  label: `${distribution.kind} 独立抽样，n=${state.n}，seed=${state.seed}`,
                  design: "single",
                });
                navigate("intervals");
              }}
            >
              送到置信区间
            </button>
            <button
              className="stats-button"
              onClick={() => {
                share({
                  sample: currentResult.lastSample,
                  label: `独立样本 seed=${state.seed}`,
                  design: "single",
                });
                navigate("means");
              }}
            >
              送到均值检验
            </button>
          </div>
          {!resultsHidden && (
            <details>
              <summary>查看本组样本</summary>
              <p className="stats-sample-values">
                {currentResult.lastSample
                  .slice(0, 200)
                  .map((v) => format(v, 5))
                  .join(", ")}
                {state.n > 200
                  ? " …（页面仅显示前200项，传递与保存包含全组）"
                  : ""}
              </p>
            </details>
          )}
        </Panel>
      )}
      <SamplingDesign
        state={state.design}
        onChange={(design) => setState({ ...state, design })}
      />
    </div>
  );
}
export const samplingTools: ToolSpec[] = [
  {
    id: "sampling",
    title: "抽样与中心极限定理",
    description: "区分总体、一次样本与统计量的抽样分布。",
    courses: ["S2", "FS"],
    group: "抽样与估计",
    component: SamplingTool,
    initialState: initial,
    validate: validState,
  },
];
