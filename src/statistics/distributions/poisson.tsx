import { NumberField } from "./ui";
import { useMemo, useState } from "react";
import { Panel, Result, Notice, Plot, Formula } from "../shared";
import { useToolState, useStatisticsWorkspace } from "../workspace";
import { format } from "../math";
import { countQuantile, countProbability, displayMasses } from "./model";
import type { PoissonState } from "./state";
import {
  eventBounds,
  eventProbability,
  selected,
  poissonWindow,
  poissonWindowForCdf,
  seededPoissonSamples,
  seededPoissonWindow,
  sampleHistogram,
  normalInterval,
} from "./tasks";
import { Select, Check, Output, CountEventFields, Button } from "./ui";
const units: [PoissonState["rateUnit"], string][] = [
  ["second", "秒"],
  ["minute", "分钟"],
  ["hour", "小时"],
  ["metre", "米（长度）"],
  ["centimetre", "厘米（长度）"],
  ["kilometre", "千米（长度）"],
  ["squareMetre", "平方米（面积）"],
  ["squareCentimetre", "平方厘米（面积）"],
  ["squareKilometre", "平方千米（面积）"],
];
export function PoissonTool() {
  const [s, set] = useToolState<PoissonState>("poisson"),
    { share, navigate } = useStatisticsWorkspace();
  const patch = (p: Partial<PoissonState>) => set({ ...s, ...p });
  const [seed, setSeed] = useState(20260925);
  const simulation = useMemo(() => {
    try {
      const { lambda } = poissonWindow(s);
      return {
        histogram: sampleHistogram(
          seededPoissonSamples(lambda, s.trials, seed),
        ),
        positions: seededPoissonWindow(lambda, seed),
      };
    } catch {
      return { histogram: [], positions: [] };
    }
  }, [
    s.rate,
    s.window,
    s.rateUnit,
    s.windowUnit,
    s.secondRate,
    s.combine,
    s.trials,
    seed,
  ]);
  return (
    <div className="stats-grid">
      <Panel title="泊松过程与观察窗口">
        <div className="stats-stack">
          <Notice>
            S2 核心；FS
            前置衔接。条件：恒定发生率、不相交区间独立、极短区间多次事件概率可忽略。教学模拟本身不能证明实际数据满足条件。
          </Notice>
          <NumberField
            label="发生率 r（每个率单位）"
            value={s.rate}
            onChange={(rate) => patch({ rate })}
            min={0}
            max={1000}
          />
          <Select
            label="率单位"
            value={s.rateUnit}
            onChange={(rateUnit) => patch({ rateUnit })}
            options={units}
          />
          <NumberField
            label="观察窗口 t"
            value={s.window}
            onChange={(window) => patch({ window })}
            min={0}
          />
          <Select
            label="窗口单位"
            value={s.windowUnit}
            onChange={(windowUnit) => patch({ windowUnit })}
            options={units}
          />
          <Check
            label="叠加第二个独立来源（相同率单位）"
            value={s.combine}
            onChange={(combine) => patch({ combine })}
          />
          {s.combine && (
            <NumberField
              label="第二来源发生率"
              value={s.secondRate}
              onChange={(secondRate) => patch({ secondRate })}
              min={0}
              max={1000}
            />
          )}
          <Select
            label="任务模板"
            value={s.task}
            onChange={(task) => patch({ task })}
            options={[
              ["forward", "顺求：计数、模拟与近似"],
              ["ratio", "反求：相邻概率之比 → λ"],
              ["window", "反求：P(X≤k)=q → 窗口"],
              ["threshold", "反求：最小 F(k)≥q 的整数界"],
            ]}
          />
          <CountEventFields
            event={s.event}
            low={s.low}
            high={s.high}
            change={patch}
          />
          <NumberField
            label="目标累计概率 q"
            value={s.q}
            onChange={(q) => patch({ q })}
            min={1e-10}
            max={1 - 1e-10}
          />
          {s.task === "ratio" && (
            <>
              <NumberField
                label="相邻关系的 k"
                max={10000}
                value={s.ratioK}
                onChange={(ratioK) => patch({ ratioK })}
                min={0}
                step={1}
              />
              <NumberField
                label="P(X=k+1) / P(X=k)"
                max={1000}
                value={s.ratio}
                onChange={(ratio) => patch({ ratio })}
                min={0}
              />
            </>
          )}
          <NumberField
            label="比较 B(n,λ/n) 的 n"
            value={s.binomialN}
            onChange={(binomialN) => patch({ binomialN })}
            min={1}
            max={1000}
            step={1}
          />
          <NumberField
            label="模拟的独立观察次数"
            value={s.trials}
            onChange={(trials) => patch({ trials })}
            min={10}
            max={2000}
            step={10}
          />
          <Button onClick={() => setSeed(seed + 1)}>重新生成独立观察</Button>
          <Button
            onClick={() =>
              patch({
                rate: 3,
                window: 60,
                rateUnit: "minute",
                windowUnit: "second",
                event: "le",
                low: 1,
                task: "forward",
              })
            }
          >
            每分钟 3 次，观察 60 秒
          </Button>
        </div>
      </Panel>
      <div className="stats-stack stats-tool-results">
        <Output>
          {() => {
            const { lambda, rate, multiplier } = poissonWindow(s),
              model = { kind: "poisson" as const, lambda },
              { masses, tail } = displayMasses(model),
              exact = eventProbability(model, s.event, s.low, s.high),
              bounds = eventBounds(s.event, s.low, s.high),
              corrected: [number, number] = [bounds[0] - 0.5, bounds[1] + 0.5];
            const raw: [number, number] =
              s.event === "le" || s.event === "lt"
                ? [-Infinity, s.low]
                : s.event === "ge" || s.event === "gt"
                  ? [s.low, Infinity]
                  : s.event === "equal"
                    ? [s.low, s.low]
                    : [s.low, s.high];
            const possible = s.event !== "equal" || Number.isInteger(s.low),
              normalCorrected =
                lambda > 0 && possible
                  ? normalInterval(lambda, Math.sqrt(lambda), ...corrected)
                  : 0,
              normalRaw =
                lambda > 0
                  ? normalInterval(lambda, Math.sqrt(lambda), ...raw)
                  : 0;
            const binomial =
              s.binomialN >= lambda
                ? eventProbability(
                    {
                      kind: "binomial",
                      n: s.binomialN,
                      p: lambda / s.binomialN,
                    },
                    s.event,
                    s.low,
                    s.high,
                  )
                : null;
            return (
              <>
                <Panel title="发生率 → 窗口 → 计数分布">
                  <Formula value="\lambda=rt,\qquad E(X)=\operatorname{Var}(X)=\lambda" />
                  <Result label="换算后的 λ" value={format(lambda)} />
                  <Plot
                    series={[
                      { kind: "bar", data: masses, name: "理论 Po(λ)" },
                      {
                        kind: "bar",
                        data: masses.filter((p) =>
                          selected(p.x, s.event, s.low, s.high),
                        ),
                        color: "var(--stats-gold)",
                        name: "事件",
                      },
                      {
                        kind: "points",
                        data: simulation.histogram,
                        color: "var(--chart-purple)",
                        name: "独立观察相对频数",
                      },
                    ]}
                    xLabel="窗口内计数 X"
                    yLabel="概率 / 相对频数"
                  />
                  <div className="stats-results">
                    <Result
                      label="精确泊松事件概率"
                      value={format(exact, 10)}
                    />
                    <Result label="图外未画尾部" value={format(tail, 12)} />
                    <Result label="模拟次数" value={s.trials} />
                  </div>
                  <Plot
                    series={[
                      {
                        kind: "points",
                        data: simulation.positions.map((x) => ({
                          x: x * s.window,
                          y: 1,
                        })),
                        color: "var(--chart-purple)",
                        name: "单次观察窗口中的事件位置",
                      },
                    ]}
                    xDomain={[0, Math.max(s.window, 1e-8)]}
                    yDomain={[0, 2]}
                    xLabel={`观察窗口（${units.find(([unit]) => unit === s.windowUnit)?.[1]}）`}
                    yLabel="事件位置示意"
                    height={130}
                  />
                  <Result
                    label="该单次窗口的计数"
                    value={simulation.positions.length}
                  />
                  <Notice>
                    位置图由泊松模型生成。长度 /
                    面积窗口按测量量的一维累计坐标展示；此位置生成算法不是必需记忆的课程公式。
                  </Notice>
                  <Button
                    onClick={() => {
                      share({ distribution: model });
                      navigate("sampling");
                    }}
                  >
                    将泊松模型用于抽样
                  </Button>
                </Panel>
                <Panel title="近似实验与连续性修正">
                  {lambda === 0 ? (
                    <Notice>
                      λ=0 时 X 恒等于 0，没有具有正标准差的正态近似。
                    </Notice>
                  ) : (
                    <>
                      <Result
                        label="实际整数事件的修正边界"
                        value={
                          possible
                            ? `${format(corrected[0])} 到 ${format(corrected[1])}`
                            : "空事件（非整数点）"
                        }
                      />
                      <Result
                        label="正态近似（使用原始边界）"
                        value={format(normalRaw, 10)}
                      />
                      <Result
                        label="正态近似（连续性修正）"
                        value={format(normalCorrected, 10)}
                      />
                      <Result
                        label="修正近似 − 精确概率"
                        value={format(normalCorrected - exact, 10)}
                      />
                      <Plot
                        series={[
                          { kind: "bar", data: masses },
                          {
                            kind: "line",
                            data: Array.from({ length: 201 }, (_, i) => {
                              const x =
                                Math.max(-1, lambda - 4 * Math.sqrt(lambda)) +
                                (i * (8 * Math.sqrt(lambda) + 2)) / 200;
                              return {
                                x,
                                y:
                                  Math.exp(
                                    -((x - lambda) ** 2) / (2 * lambda),
                                  ) / Math.sqrt(2 * Math.PI * lambda),
                              };
                            }),
                            color: "var(--chart-purple)",
                          },
                        ]}
                        xLabel="计数 / 连续近似"
                        yLabel="单位宽概率柱 / 密度"
                      />
                    </>
                  )}
                  {binomial === null ? (
                    <Notice>
                      二项比较要求 n≥λ，才能令 p=λ/n 在 [0,1] 内。
                    </Notice>
                  ) : (
                    <>
                      <Result
                        label="B(n,λ/n) 的精确事件概率"
                        value={format(binomial, 10)}
                      />
                      <Result
                        label="泊松近似 − 二项精确"
                        value={format(exact - binomial, 10)}
                      />
                    </>
                  )}
                  <Notice>
                    误差比较只描述当前参数与事件；不存在用单一 n
                    阈值保证所有事件近似优良的结论。
                  </Notice>
                </Panel>
                {s.task !== "forward" && (
                  <Panel title="反求与检查">
                    <Output>
                      {() => {
                        if (s.task === "ratio") {
                          const solution = (s.ratioK + 1) * s.ratio;
                          if (solution > 1000)
                            throw new Error("λ 解超出 1000 的计算上限。");
                          if (solution === 0 && s.ratioK > 0)
                            throw new Error(
                              "λ=0 时分母 P(X=k)=0，给定比值没有定义。",
                            );
                          return (
                            <>
                              <Formula value="\frac{P(X=k+1)}{P(X=k)}=\frac{\lambda}{k+1}" />
                              <Result label="λ 解" value={solution} />
                              <Button
                                onClick={() =>
                                  patch({
                                    rate: solution,
                                    window: 1,
                                    windowUnit: s.rateUnit,
                                    combine: false,
                                  })
                                }
                              >
                                应用所求 λ
                              </Button>
                            </>
                          );
                        }
                        if (s.task === "window") {
                          const r = poissonWindowForCdf(
                            s.low,
                            s.q,
                            rate * multiplier,
                          );
                          return (
                            <>
                              <Result
                                label="P(X≤k)=q 的窗口长度"
                                value={format(r.window)}
                              />
                              <Result label="λ" value={format(r.lambda)} />
                              <Result
                                label="概率残差"
                                value={format(r.residual, 12)}
                              />
                              <Button
                                disabled={r.window > 1e6}
                                onClick={() => patch({ window: r.window })}
                              >
                                应用所求窗口
                              </Button>
                              {r.window > 1e6 && (
                                <Notice>
                                  所求窗口超过可编辑域
                                  10⁶；可以换用更大的窗口单位。
                                </Notice>
                              )}
                              <Notice>
                                这里 k 使用边界 a 且须为非负整数。CDF
                                随窗口长度递减，可据此把等式解解释为单调约束的边界。
                              </Notice>
                            </>
                          );
                        }
                        const k = countQuantile(model, s.q);
                        return (
                          <>
                            <Result label="最小整数 k：P(X≤k)≥q" value={k} />
                            <Result
                              label="F(k)"
                              value={format(
                                countProbability(model, -Infinity, k),
                                10,
                              )}
                            />
                            <Result
                              label="F(k−1)"
                              value={format(
                                countProbability(model, -Infinity, k - 1),
                                10,
                              )}
                            />
                          </>
                        );
                      }}
                    </Output>
                  </Panel>
                )}
              </>
            );
          }}
        </Output>
      </div>
    </div>
  );
}
