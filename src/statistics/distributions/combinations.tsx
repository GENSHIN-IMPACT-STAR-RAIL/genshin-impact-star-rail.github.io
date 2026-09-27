import { NumberField } from "./ui";
import { Panel, Result, Notice, Plot, Formula } from "../shared";
import { useToolState } from "../workspace";
import { format } from "../math";
import {
  parseMasses,
  moments,
  affine,
  transformMasses,
  convolve,
  displayMasses,
  countMoments,
  countProbability,
  type Mass,
} from "./model";
import type { CombinationState } from "./state";
import { normalInterval } from "./tasks";
import { Select, TextInput, Check, Output, MomentResults, Button } from "./ui";
export function CombinationTool() {
  const [s, set] = useToolState<CombinationState>("combinations");
  const patch = (p: Partial<CombinationState>) => set({ ...s, ...p });
  const operations: [CombinationState["operation"], string][] =
    s.kind === "poisson"
      ? [
          ["double", "同一次计数：2X"],
          ["independent", "独立来源：X+Y"],
        ]
      : s.kind === "normal"
        ? [
            ["double", "同一个 X：2X"],
            ["affine", "aX+b"],
            ["independent", "独立线性组合 aX+cY+b"],
            ["difference", "独立差 X−Y"],
            ["mixture", "混合总体：先选择来源"],
          ]
        : [
            ["double", "同一骰子结果：2X"],
            ["independent", "独立组合 aX+cY+b"],
            ["affine", "aX+b"],
            ["square", "多对一变换 X²"],
            ["difference", "独立差 X−Y"],
            ["mixture", "混合总体：先选择来源"],
          ];
  return (
    <div className="stats-grid">
      <Panel title="变换、组合与依赖关系">
        <div className="stats-stack">
          <Notice>
            S1：线性变换；S2：独立和及正态线性组合；FS
            前置。使用同一次观测两次与新建独立副本有不同的支持和方差。
          </Notice>
          <Select
            label="源变量类型"
            value={s.kind}
            onChange={(kind) => patch({ kind, operation: "double" })}
            options={[
              ["finite", "有限概率表"],
              ["normal", "正态变量"],
              ["poisson", "泊松计数"],
            ]}
          />
          <Select
            label="生成方式"
            value={s.operation}
            onChange={(operation) =>
              patch({
                operation,
                ...(operation === "independent"
                  ? { a: 1, coefficientY: 1, b: 0 }
                  : {}),
              })
            }
            options={operations}
          />
          {s.kind === "finite" ? (
            <>
              <TextInput
                label="X 的概率表"
                value={s.table}
                onChange={(table) => patch({ table })}
              />
              {["independent", "difference", "mixture"].includes(
                s.operation,
              ) && (
                <TextInput
                  label="Y 的概率表（副本可用同一表）"
                  value={s.secondTable}
                  onChange={(secondTable) => patch({ secondTable })}
                />
              )}
            </>
          ) : s.kind === "normal" ? (
            <>
              <NumberField
                label="μX"
                value={s.meanX}
                onChange={(meanX) => patch({ meanX })}
              />
              <NumberField
                label="σX"
                value={s.sdX}
                onChange={(sdX) => patch({ sdX })}
                min={1e-8}
              />
              <NumberField
                label="μY"
                value={s.meanY}
                onChange={(meanY) => patch({ meanY })}
              />
              <NumberField
                label="σY"
                value={s.sdY}
                onChange={(sdY) => patch({ sdY })}
                min={1e-8}
              />
            </>
          ) : (
            <>
              <NumberField
                label="λX"
                value={s.lambdaX}
                onChange={(lambdaX) => patch({ lambdaX })}
                min={0}
                max={500}
              />
              <NumberField
                label="λY"
                value={s.lambdaY}
                onChange={(lambdaY) => patch({ lambdaY })}
                min={0}
                max={500}
              />
            </>
          )}
          {s.kind !== "poisson" &&
            ["affine", "independent"].includes(s.operation) && (
              <>
                <NumberField
                  label="X 的系数 a"
                  value={s.a}
                  onChange={(a) => patch({ a })}
                  min={-100}
                  max={100}
                />
                {s.operation === "independent" && (
                  <NumberField
                    label="Y 的系数 c"
                    value={s.coefficientY}
                    onChange={(coefficientY) => patch({ coefficientY })}
                    min={-100}
                    max={100}
                  />
                )}
                <NumberField
                  label="平移 b"
                  min={-1e4}
                  max={1e4}
                  value={s.b}
                  onChange={(b) => patch({ b })}
                />
              </>
            )}
          {["independent", "difference"].includes(s.operation) && (
            <Check
              label="明确给定 X 与 Y 独立"
              value={s.independent}
              onChange={(independent) => patch({ independent })}
            />
          )}{" "}
          {s.operation === "mixture" && (
            <NumberField
              label="选择 X 总体的概率 w"
              value={s.weight}
              onChange={(weight) => patch({ weight })}
              min={0}
              max={1}
            />
          )}
          <NumberField
            label="累计概率的阈值 z：P(结果≤z)"
            value={s.threshold}
            onChange={(threshold) => patch({ threshold })}
          />
          <Select
            label="任务"
            value={s.task}
            onChange={(task) => patch({ task })}
            options={[
              ["forward", "正向：比较分布"],
              ["target", "反求：给定 a 与目标 E(aX+b)，求 b"],
            ]}
          />
          {s.task === "target" && (
            <>
              <NumberField
                label="反求使用的 a"
                min={-100}
                max={100}
                value={s.a}
                onChange={(a) => patch({ a })}
              />
              <NumberField
                label="目标均值"
                value={s.target}
                onChange={(target) => patch({ target })}
              />
            </>
          )}
          <Button
            onClick={() =>
              patch({
                kind: "finite",
                operation: "independent",
                a: 1,
                coefficientY: 1,
                b: 0,
                independent: true,
                table: "1, 1/6\n2, 1/6\n3, 1/6\n4, 1/6\n5, 1/6\n6, 1/6",
                secondTable: "1, 1/6\n2, 1/6\n3, 1/6\n4, 1/6\n5, 1/6\n6, 1/6",
              })
            }
          >
            公平骰子：独立和
          </Button>
        </div>
      </Panel>
      <div className="stats-stack stats-tool-results">
        <Output>
          {() => {
            const a =
                s.operation === "double"
                  ? 2
                  : s.operation === "difference"
                    ? 1
                    : s.a,
              c =
                s.operation === "difference"
                  ? -1
                  : s.operation === "independent"
                    ? s.coefficientY
                    : 0,
              b = ["double", "difference"].includes(s.operation) ? 0 : s.b;
            if (
              ["independent", "difference"].includes(s.operation) &&
              !s.independent
            )
              return (
                <Panel title="依赖条件未给定">
                  <Formula value="E(aX+cY+b)=aE(X)+cE(Y)+b" />
                  <Formula value="\operatorname{Var}(aX+cY+b)=a^2\operatorname{Var}(X)+c^2\operatorname{Var}(Y)+2ac\operatorname{Cov}(X,Y)" />
                  <Notice>
                    没有依赖信息，保留协方差项；不会自动把它设为零，也不能由两个边缘分布唯一确定和的分布。
                  </Notice>
                </Panel>
              );
            let sourceMean = 0;
            let content;
            if (s.kind === "finite") {
              const x = parseMasses(s.table),
                y = parseMasses(s.secondTable);
              sourceMean = moments(x).mean;
              let result: Mass[];
              if (s.operation === "mixture")
                result = transformMasses(
                  [
                    ...x.map((p) => ({ ...p, y: p.y * s.weight })),
                    ...y.map((p) => ({ ...p, y: p.y * (1 - s.weight) })),
                  ],
                  (v) => v,
                );
              else if (s.operation === "square")
                result = transformMasses(x, (v) => v * v);
              else if (["independent", "difference"].includes(s.operation))
                result = affine(
                  convolve(affine(x, a, 0), affine(y, c, 0)),
                  1,
                  b,
                );
              else result = affine(x, a, b);
              const stats = moments(result),
                double = moments(affine(x, 2, 0)),
                sum = moments(convolve(x, x));
              content = (
                <Panel title="源分布与结果分布">
                  <Plot
                    series={[
                      { kind: "bar", data: x, name: "X", color: "#7c9bb8" },
                      {
                        kind: "bar",
                        data: result,
                        name: "结果",
                        color: "var(--stats-gold)",
                      },
                    ]}
                    xLabel="取值"
                    yLabel="概率"
                  />
                  <MomentResults {...stats} />
                  <Result
                    label="结果支持集"
                    value={result
                      .filter((p) => p.y > 0)
                      .map((p) => format(p.x))
                      .join(", ")}
                  />
                  <Result
                    label="P(结果≤z)"
                    value={format(
                      result
                        .filter((p) => p.x <= s.threshold)
                        .reduce((total, p) => total + p.y, 0),
                      10,
                    )}
                  />
                  <Result
                    label="同一 X 的 2X：方差"
                    value={format(double.variance)}
                  />
                  <Result
                    label="独立副本 X₁+X₂：方差"
                    value={format(sum.variance)}
                  />
                  {s.operation === "mixture" && (
                    <Notice>
                      先按 w
                      选择来源，再从所选总体抽一个值。此分布是概率加权，不是两次观测相加。
                    </Notice>
                  )}
                </Panel>
              );
            } else if (s.kind === "normal") {
              sourceMean = s.meanX;
              if (s.sdX <= 0 || s.sdY <= 0)
                throw new Error("两个正态源变量的标准差必须为正。");
              const mixture = s.operation === "mixture",
                mean = mixture
                  ? s.weight * s.meanX + (1 - s.weight) * s.meanY
                  : a * s.meanX + c * s.meanY + b,
                variance = mixture
                  ? s.weight * (s.sdX ** 2 + (s.meanX - mean) ** 2) +
                    (1 - s.weight) * (s.sdY ** 2 + (s.meanY - mean) ** 2)
                  : a * a * s.sdX ** 2 + c * c * s.sdY ** 2,
                sd = Math.sqrt(variance);
              const normalPdf = (x: number, m: number, d: number) =>
                Math.exp(-0.5 * ((x - m) / d) ** 2) /
                (d * Math.sqrt(2 * Math.PI));
              const low = mixture
                  ? Math.min(s.meanX - 4 * s.sdX, s.meanY - 4 * s.sdY)
                  : mean - 4 * sd,
                high = mixture
                  ? Math.max(s.meanX + 4 * s.sdX, s.meanY + 4 * s.sdY)
                  : mean + 4 * sd;
              const curve =
                sd === 0
                  ? [{ x: mean, y: 1 }]
                  : Array.from({ length: 241 }, (_, i) => {
                      const x = low + ((high - low) * i) / 240;
                      return {
                        x,
                        y: mixture
                          ? s.weight * normalPdf(x, s.meanX, s.sdX) +
                            (1 - s.weight) * normalPdf(x, s.meanY, s.sdY)
                          : normalPdf(x, mean, sd),
                      };
                    });
              const probability = mixture
                ? s.weight *
                    normalInterval(s.meanX, s.sdX, -Infinity, s.threshold) +
                  (1 - s.weight) *
                    normalInterval(s.meanY, s.sdY, -Infinity, s.threshold)
                : sd === 0
                  ? s.threshold >= mean
                    ? 1
                    : 0
                  : normalInterval(mean, sd, -Infinity, s.threshold);
              content = (
                <Panel
                  title={
                    mixture ? "混合总体（一般不再是正态分布）" : "正态线性组合"
                  }
                >
                  <Plot
                    series={[
                      {
                        kind: sd === 0 ? "points" : "line",
                        data: curve,
                        color: "var(--stats-gold)",
                      },
                    ]}
                    xLabel="结果"
                    yLabel={sd === 0 ? "退化点的概率" : "密度"}
                  />
                  <MomentResults mean={mean} variance={variance} />
                  <Result label="P(结果≤z)" value={format(probability, 10)} />
                  {sd === 0 && (
                    <Notice>
                      所有随机系数为零，结果为常数，不使用 σ=0 的正态密度。
                    </Notice>
                  )}
                  {!mixture && (
                    <Formula value="aX+cY+b\sim N(a\mu_X+c\mu_Y+b,\ a^2\sigma_X^2+c^2\sigma_Y^2)" />
                  )}
                </Panel>
              );
            } else {
              sourceMean = s.lambdaX;
              const independent = s.operation === "independent",
                source = { kind: "poisson" as const, lambda: s.lambdaX },
                target = {
                  kind: "poisson" as const,
                  lambda: s.lambdaX + s.lambdaY,
                },
                shown = displayMasses(independent ? target : source),
                result = independent
                  ? shown.masses
                  : affine(shown.masses, 2, 0),
                stats = countMoments(independent ? target : source);
              content = (
                <Panel title="泊松来源的组合">
                  <Plot
                    series={[{ kind: "bar", data: result, color: "var(--stats-gold)" }]}
                    xLabel="计数"
                    yLabel="概率"
                  />
                  <MomentResults
                    mean={independent ? stats.mean : 2 * stats.mean}
                    variance={independent ? stats.variance : 4 * stats.variance}
                  />
                  <Result label="图外质量" value={format(shown.tail, 12)} />
                  <Result
                    label="P(结果≤z)"
                    value={format(
                      countProbability(
                        independent ? target : source,
                        -Infinity,
                        independent ? s.threshold : s.threshold / 2,
                      ),
                      10,
                    )}
                  />
                  <Notice>
                    {independent
                      ? "独立泊松和仍为泊松，参数为 λX+λY。"
                      : "2X 只取偶数；λX>0 时它不是泊松分布。"}
                  </Notice>
                </Panel>
              );
            }
            return (
              <>
                {content}
                {s.task === "target" && (
                  <Panel title="反求仿射平移">
                    <Result
                      label="b = 目标均值 − aE(X)"
                      value={format(s.target - s.a * sourceMean)}
                    />
                    <Result
                      label="回代均值残差"
                      value={format(
                        s.a * sourceMean +
                          (s.target - s.a * sourceMean) -
                          s.target,
                      )}
                    />
                    {s.kind !== "poisson" && (
                      <Button
                        disabled={Math.abs(s.target - s.a * sourceMean) > 1e4}
                        onClick={() =>
                          patch({
                            operation: "affine",
                            b: s.target - s.a * sourceMean,
                          })
                        }
                      >
                        应用 aX+b
                      </Button>
                    )}
                    {Math.abs(s.target - s.a * sourceMean) > 1e4 && (
                      <Notice>
                        所求 b 超出本工具的可编辑域 |b|≤10000，保留反求结果。
                      </Notice>
                    )}
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
