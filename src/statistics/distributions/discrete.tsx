import { NumberField } from "./ui";
import { Panel, Result, Notice, Plot, Formula } from "../shared";
import { useToolState, useStatisticsWorkspace } from "../workspace";
import { format } from "../math";
import {
  parseMasses,
  countMoments,
  displayMasses,
  countQuantile,
  binomialFromMoments,
  minSuccessTrials,
} from "./model";
import { discreteModel, type DiscreteState } from "./state";
import { eventProbability, selected } from "./tasks";
import {
  Select,
  TextInput,
  Output,
  CountEventFields,
  MomentResults,
  Button,
  Reveal,
} from "./ui";

export function DiscreteTool() {
  const [s, set] = useToolState<DiscreteState>("discrete"),
    { share, navigate } = useStatisticsWorkspace();
  const patch = (p: Partial<DiscreteState>) => set({ ...s, ...p });
  return (
    <div className="stats-grid">
      <Panel title="离散变量（二项 / 几何 / 概率表）">
        <div className="stats-stack">
          <Notice>
            S1：概率表、二项与从 1 开始的几何分布。几何方差标作拓展 / FS
            衔接。完整试验的独立重复才能建立外层二项模型。
          </Notice>
          <Select
            label="模型"
            value={s.kind}
            onChange={(kind) =>
              patch({
                kind,
                ...(kind === "geometric" && s.p === 0 ? { p: 0.2 } : {}),
              })
            }
            options={[
              ["finite", "自定义概率表"],
              ["binomial", "二项 B(n,p)"],
              ["geometric", "几何：首次成功的总次数"],
            ]}
          />
          {s.kind === "finite" ? (
            <TextInput
              label="取值, 概率（每行一对）"
              value={s.table}
              onChange={(table) => patch({ table })}
              hint="相同取值会合并；可输入 1/6，概率总和必须为 1。"
            />
          ) : (
            <>
              {s.kind === "binomial" && (
                <NumberField
                  label="试验次数 n"
                  value={s.n}
                  onChange={(n) => patch({ n })}
                  min={0}
                  max={1000}
                  step={1}
                />
              )}
              <NumberField
                label="每次成功概率 p"
                value={s.p}
                onChange={(p) => patch({ p })}
                min={s.kind === "geometric" ? 0.00001 : 0}
                max={1}
                step={0.01}
              />
            </>
          )}
          <Select
            label="任务"
            value={s.task}
            onChange={(task) => patch({ task })}
            options={[
              ["forward", "正向：事件、矩与分位"],
              ["moments", "反求：二项的均值与方差 → n,p"],
              ["trials", "反求：至少一次成功的最小次数"],
              ["geometric", "反求：几何均值 → p"],
            ]}
          />
          <CountEventFields
            event={s.event}
            low={s.low}
            high={s.high}
            change={patch}
          />
          <NumberField
            label="分位概率 q"
            value={s.q}
            onChange={(q) => patch({ q })}
            min={0}
            max={1}
            step={0.01}
          />
          {s.task === "moments" || s.task === "geometric" ? (
            <NumberField
              label="目标均值"
              max={1e5}
              value={s.targetMean}
              onChange={(targetMean) => patch({ targetMean })}
              min={0}
            />
          ) : null}
          {s.task === "moments" && (
            <NumberField
              label="目标方差"
              max={1e5}
              value={s.targetVariance}
              onChange={(targetVariance) => patch({ targetVariance })}
              min={0}
            />
          )}
          <NumberField
            label="独立重复这个完整试验的次数 m"
            value={s.repetitions}
            onChange={(repetitions) => patch({ repetitions })}
            min={1}
            max={1000}
            step={1}
          />
          <div className="stats-toolbar">
            <Button
              onClick={() =>
                patch({
                  kind: "finite",
                  table: "-1, 1/4\n0, 1/2\n2, 1/4",
                  task: "forward",
                })
              }
            >
              载入不等概率映射
            </Button>
            <Button
              onClick={() =>
                patch({
                  kind: "geometric",
                  p: 0.2,
                  event: "gt",
                  low: 4,
                  task: "forward",
                })
              }
            >
              首次成功活动
            </Button>
          </div>
        </div>
      </Panel>
      <div className="stats-stack stats-tool-results">
        <Output>
          {() => {
            const model = discreteModel(s, parseMasses),
              stats = countMoments(model),
              { masses, tail } = displayMasses(model),
              probability = eventProbability(model, s.event, s.low, s.high),
              quantile = countQuantile(model, s.q);
            return (
              <>
                <Panel title="概率柱、支持与完整尾部">
                  <Plot
                    series={[
                      {
                        kind: "bar",
                        data: masses,
                        color: "var(--stats-blue)",
                        name: "全体取值",
                      },
                      {
                        kind: "bar",
                        data: masses.filter((p) =>
                          selected(p.x, s.event, s.low, s.high),
                        ),
                        color: "var(--stats-gold)",
                        name: "事件内",
                      },
                    ]}
                    xLabel="随机变量 X"
                    yLabel="P(X=x)"
                  />
                  <div className="stats-results">
                    <Result label="事件概率" value={format(probability, 10)} />
                    <Result
                      label="最小 F(x) ≥ q 的支持点"
                      value={format(quantile)}
                    />
                    <Result
                      label="图外尾部质量"
                      value={format(tail, 12)}
                      note="画图截断不改变概率或矩；未将可见部分重新归一。"
                    />
                  </div>
                  <MomentResults {...stats} />
                  {s.kind === "geometric" && (
                    <Notice>
                      支持为 1,2,…；X−1 是首次成功前的失败次数。方差公式
                      (1−p)/p² 属拓展 / FS 衔接。
                    </Notice>
                  )}
                  <Result
                    label="外层独立重复 Y 的分布"
                    value={`Y ∼ B(${s.repetitions}, ${format(probability)})`}
                    note="Y 计数的是 m 次完整试验中，内层事件发生的次数。"
                  />
                  <Button
                    onClick={() => {
                      if (model.kind === "finite")
                        share({
                          distribution: {
                            kind: "finite",
                            values: model.masses.map((p) => p.x),
                            probabilities: model.masses.map((p) => p.y),
                          },
                        });
                      else share({ distribution: model });
                      navigate("sampling");
                    }}
                  >
                    将当前模型用于抽样
                  </Button>
                </Panel>
                {s.task !== "forward" && (
                  <Panel title="反求与条件验证">
                    <Output>
                      {() => {
                        if (s.task === "moments") {
                          const result = binomialFromMoments(
                            s.targetMean,
                            s.targetVariance,
                          );
                          return (
                            <>
                              <Formula value="p=1-\frac{\operatorname{Var}(X)}{E(X)},\qquad n=\frac{E(X)}p" />
                              <Result
                                label="满足整数条件的解"
                                value={`n=${result.n}, p=${format(result.p)}`}
                              />
                              <Button
                                onClick={() =>
                                  patch({ kind: "binomial", ...result })
                                }
                              >
                                应用所求参数
                              </Button>
                            </>
                          );
                        }
                        if (s.task === "trials") {
                          const r = minSuccessTrials(s.p, s.q);
                          return (
                            <>
                              <Result
                                label="P(至少一次成功) ≥ q 的最小 n"
                                value={r.n}
                              />
                              <Result
                                label="n 次的概率"
                                value={format(r.at, 10)}
                              />
                              <Result
                                label="n−1 次的概率（相邻检查）"
                                value={format(r.before, 10)}
                              />
                            </>
                          );
                        }
                        if (s.targetMean < 1)
                          throw new Error("从 1 开始的几何分布均值必须 ≥1。");
                        return (
                          <>
                            <Result
                              label="p = 1 / E(X)"
                              value={format(1 / s.targetMean)}
                            />
                            <Button
                              onClick={() =>
                                patch({
                                  kind: "geometric",
                                  p: 1 / s.targetMean,
                                })
                              }
                            >
                              应用几何模型
                            </Button>
                          </>
                        );
                      }}
                    </Output>
                  </Panel>
                )}
                <Reveal>
                  <Notice>
                    支持：
                    {model.kind === "finite"
                      ? model.masses.map((p) => p.x).join(", ")
                      : model.kind === "binomial"
                        ? `0,1,…,${model.n}`
                        : "1,2,…"}
                    。有限概率表不假定各取值等可能。
                  </Notice>
                </Reveal>
              </>
            );
          }}
        </Output>
      </div>
    </div>
  );
}
