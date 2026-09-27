import { NumberField } from "./ui";
import { useState } from "react";
import { Panel, Result, Notice, Plot, Formula } from "../shared";
import { useToolState, useStatisticsWorkspace } from "../workspace";
import { normalCdf, normalQuantile, format } from "../math";
import { validateNormal, type NormalState } from "./state";
import {
  normalInterval,
  normalFromQuantiles,
  normalMarkerPatch,
} from "./tasks";
import { Select, Output, Button, Reveal } from "./ui";
import { MobilePaneSwitch } from "./interaction";
export function NormalTool() {
  const [s, set] = useToolState<NormalState>("normal"),
    { share, navigate } = useStatisticsWorkspace();
  const patch = (p: Partial<NormalState>) => set({ ...s, ...p });
  const [pane, setPane] = useState<"input" | "results">("input");
  const moveMarker = (index: number, value: number) =>
    set((old) => ({ ...old, ...normalMarkerPatch(old, index, value) }));
  const sd = s.scaleKind === "variance" ? Math.sqrt(s.scale) : s.scale;
  return (
    <div className={`stats-grid distributions-view-${pane}`}>
      <MobilePaneSwitch value={pane} onChange={setPane} />
      <Panel title="正态顺求与反求">
        <div className="stats-stack">
          <Notice>
            S1 核心；S2 近似衔接。记号 N(μ,σ²)
            的第二个参数是方差。单个分位条件只能确定 μ+zσ=x 的关系。
          </Notice>
          <NumberField
            label="均值 μ"
            value={s.mean}
            onChange={(mean) => patch({ mean })}
          />
          <Select
            label="离散程度的输入形式"
            value={s.scaleKind}
            onChange={(scaleKind) =>
              patch({ scaleKind, scale: scaleKind === "sd" ? sd : sd * sd })
            }
            options={[
              ["sd", "标准差 σ"],
              ["variance", "方差 σ²"],
            ]}
          />
          <NumberField
            label={s.scaleKind === "sd" ? "标准差 σ" : "方差 σ²"}
            value={s.scale}
            onChange={(scale) => patch({ scale })}
            min={s.scaleKind === "variance" ? 1e-16 : 1e-8}
            max={s.scaleKind === "variance" ? 1e12 : 1e6}
          />
          <Select
            label="任务模板"
            value={s.task}
            onChange={(task) => patch({ task })}
            options={[
              ["forward", "正向：概率与标准化"],
              ["quantile", "反求：给左尾概率求分位"],
              ["mean", "反求：已知 σ 求 μ"],
              ["sd", "反求：已知 μ 求 σ"],
              ["both", "反求：两分位求 μ,σ"],
              ["relation", "一个条件、两个未知参数"],
            ]}
          />
          <Select
            label="概率区域"
            value={s.event}
            onChange={(event) =>
              patch({
                event,
                ...(["interval", "outside"].includes(event)
                  ? { high: Math.max(s.low, s.high) }
                  : {}),
              })
            }
            options={[
              ["left", "X ≤ a"],
              ["right", "X ≥ a"],
              ["interval", "a ≤ X ≤ b"],
              ["outside", "X ≤ a 或 X ≥ b"],
              ["central", "中央面积 q"],
            ]}
          />
          {s.event !== "central" && (
            <NumberField
              label="边界 a"
              value={s.low}
              onChange={(low) => moveMarker(0, low)}
              max={["interval", "outside"].includes(s.event) ? s.high : 1e6}
            />
          )}
          {["interval", "outside"].includes(s.event) && (
            <NumberField
              label="边界 b"
              value={s.high}
              onChange={(high) => moveMarker(1, high)}
              min={s.low}
            />
          )}
          <NumberField
            label="分位 / 中央概率 q"
            value={s.q}
            onChange={(q) => patch({ q })}
            min={0}
            max={1}
            step={0.01}
          />
          {["mean", "sd", "both", "relation"].includes(s.task) && (
            <>
              <NumberField
                label="条件 1 的位置 x₁"
                value={s.x1}
                onChange={(x1) => patch({ x1 })}
              />
              <NumberField
                label="P(X≤x₁)=p₁"
                value={s.p1}
                onChange={(p1) => patch({ p1 })}
                min={1e-10}
                max={1 - 1e-10}
              />
            </>
          )}
          {s.task === "both" && (
            <>
              <NumberField
                label="条件 2 的位置 x₂"
                value={s.x2}
                onChange={(x2) => patch({ x2 })}
              />
              <NumberField
                label="P(X≤x₂)=p₂"
                value={s.p2}
                onChange={(p2) => patch({ p2 })}
                min={1e-10}
                max={1 - 1e-10}
              />
            </>
          )}
          <Button
            onClick={() =>
              patch({
                task: "both",
                x1: 8,
                p1: 0.15865525393145707,
                x2: 12,
                p2: 0.8413447460685429,
              })
            }
          >
            两分位教学例
          </Button>
        </div>
      </Panel>
      <div className="stats-stack stats-tool-results">
        <Output>
          {() => {
            if (sd <= 0 || !Number.isFinite(sd))
              throw new Error("标准差 σ 必须大于 0。");
            let a = s.low,
              b = s.high;
            if (s.event === "left") ((a = -Infinity), (b = s.low));
            if (s.event === "right") ((a = s.low), (b = Infinity));
            if (s.event === "central") {
              a = s.mean + sd * normalQuantile((1 - s.q) / 2);
              b = s.mean + sd * normalQuantile((1 + s.q) / 2);
            }
            if (a > b) throw new Error("区间要求 a≤b。");
            const probability =
                s.event === "outside"
                  ? normalInterval(s.mean, sd, -Infinity, a) +
                    normalInterval(s.mean, sd, b, Infinity)
                  : normalInterval(s.mean, sd, a, b),
              zLow = (a - s.mean) / sd,
              zHigh = (b - s.mean) / sd;
            const density = (x: number) =>
                Math.exp(-0.5 * ((x - s.mean) / sd) ** 2) /
                (sd * Math.sqrt(2 * Math.PI)),
              curve = Array.from({ length: 241 }, (_, i) => {
                const x = s.mean + sd * (-4.5 + (i * 9) / 240);
                return { x, y: density(x) };
              }),
              region = curve.filter((p) =>
                s.event === "outside"
                  ? p.x <= a || p.x >= b
                  : b > a && p.x >= a && p.x <= b,
              );
            return (
              <>
                <Panel title="X 与 Z 的对应区域">
                  <Plot
                    series={[
                      { kind: "line", data: curve, name: "正态密度" },
                      {
                        kind: "bar",
                        data: region,
                        color: "var(--stats-gold)",
                        name: "概率区域",
                        barWidth: (sd * 9) / 240,
                      },
                    ]}
                    xLabel="X"
                    yLabel="概率密度"
                    xDomain={[s.mean - 4.5 * sd, s.mean + 4.5 * sd]}
                    markers={
                      s.event === "central"
                        ? [
                            { x: a, label: "左分位" },
                            { x: b, label: "右分位" },
                          ]
                        : [
                            { x: s.low, label: "a", step: sd / 100 },
                            ...(["interval", "outside"].includes(s.event)
                              ? [{ x: s.high, label: "b", step: sd / 100 }]
                              : []),
                          ]
                    }
                    onMarkerChange={
                      s.event === "central" ? undefined : moveMarker
                    }
                  />
                  <Plot
                    series={[
                      {
                        kind: "line",
                        data: curve.map((p) => ({
                          x: (p.x - s.mean) / sd,
                          y: p.y * sd,
                        })),
                      },
                      {
                        kind: "bar",
                        data: region.map((p) => ({
                          x: (p.x - s.mean) / sd,
                          y: p.y * sd,
                        })),
                        color: "var(--stats-gold)",
                        barWidth: 9 / 240,
                      },
                    ]}
                    xLabel="Z = (X−μ)/σ"
                    yLabel="标准正态密度"
                    xDomain={[-4.5, 4.5]}
                    markers={[
                      { x: zLow, label: "z(a)" },
                      { x: zHigh, label: "z(b)" },
                    ]}
                  />
                  <div className="stats-results">
                    <Result label="事件概率" value={format(probability, 10)} />
                    <Result
                      label="标准化边界"
                      value={`${format(zLow)}，${format(zHigh)}`}
                    />
                    <Result
                      label="N(μ,σ²)"
                      value={`N(${format(s.mean)}, ${format(sd * sd)})`}
                    />
                    <Result
                      label="左尾 q 的分位 xq"
                      value={format(s.mean + sd * normalQuantile(s.q))}
                    />
                  </div>
                  <Button
                    onClick={() => {
                      share({
                        distribution: { kind: "normal", mean: s.mean, sd },
                      });
                      navigate("sampling");
                    }}
                  >
                    将正态模型用于抽样
                  </Button>
                  <Notice>
                    {s.event !== "central" &&
                      "可拖动 a / b，或选中图上圆点后用左右方向键微调；区间边界保持 a≤b。"}
                    图窗只显示均值两侧约
                    4.5σ；概率计算覆盖完整实数轴。二项近似见既有样板，泊松近似见
                    “泊松过程与计数”。
                  </Notice>
                </Panel>
                {["mean", "sd", "both", "relation"].includes(s.task) && (
                  <Panel title="反求结果与残差">
                    <Output>
                      {() => {
                        const z = normalQuantile(s.p1);
                        let mean = s.mean,
                          solvedSd = sd;
                        if (s.task === "relation")
                          return (
                            <>
                              <Formula value="\mu+\Phi^{-1}(p_1)\sigma=x_1,\quad\sigma>0" />
                              <Result
                                label="可行关系（无唯一解）"
                                value={`μ = ${format(s.x1)} − (${format(z)}) σ`}
                              />
                            </>
                          );
                        if (s.task === "both") {
                          const solution = normalFromQuantiles(
                            s.x1,
                            s.p1,
                            s.x2,
                            s.p2,
                          );
                          mean = solution.mean;
                          solvedSd = solution.sd;
                        }
                        if (s.task === "mean") mean = s.x1 - z * sd;
                        if (s.task === "sd") {
                          if (Math.abs(z) < 1e-14)
                            throw new Error(
                              s.x1 === s.mean
                                ? "中位数等于均值，任意 σ>0 均满足，不能唯一反求。"
                                : "p=0.5 要求 x₁=μ；当前无解。",
                            );
                          solvedSd = (s.x1 - s.mean) / z;
                          if (solvedSd <= 0)
                            throw new Error("计算得到非正标准差，条件不相容。");
                        }
                        const residual = Math.max(
                          Math.abs(normalCdf((s.x1 - mean) / solvedSd) - s.p1),
                          s.task === "both"
                            ? Math.abs(
                                normalCdf((s.x2 - mean) / solvedSd) - s.p2,
                              )
                            : 0,
                        );
                        return (
                          <>
                            <Result label="μ" value={format(mean, 10)} />
                            <Result label="σ" value={format(solvedSd, 10)} />
                            <Result
                              label="最大概率残差"
                              value={format(residual, 12)}
                            />
                            <Button
                              disabled={
                                !validateNormal({
                                  ...s,
                                  mean,
                                  scaleKind: "sd",
                                  scale: solvedSd,
                                })
                              }
                              onClick={() =>
                                patch({
                                  mean,
                                  scaleKind: "sd",
                                  scale: solvedSd,
                                })
                              }
                            >
                              应用反求分布
                            </Button>
                            {!validateNormal({
                              ...s,
                              mean,
                              scaleKind: "sd",
                              scale: solvedSd,
                            }) && (
                              <Notice>
                                所求参数超出当前可编辑域（|μ|≤10⁶，10⁻⁸≤σ≤10⁶），保留结果但不能应用。
                              </Notice>
                            )}
                            <Reveal>
                              <Formula
                                value={`X\\sim N(${format(mean)},${format(solvedSd * solvedSd)})`}
                              />
                            </Reveal>
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
