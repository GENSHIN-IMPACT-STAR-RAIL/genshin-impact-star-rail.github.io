import { NumberField } from "./ui";
import { useState } from "react";
import { Panel, Result, Notice, Plot, Formula } from "../shared";
import { useToolState, useStatisticsWorkspace } from "../workspace";
import { format } from "../math";
import {
  parseSegments,
  densityArea,
  densityPdf,
  densityCdf,
  densityMoment,
  densityBounds,
  densityQuantile,
  transformedCdf,
  transformedPdf,
  type Density,
} from "./model";
import type { ContinuousState } from "./state";
import { Select, TextInput, Output, MomentResults, Button } from "./ui";
import { continuousMarkerPatch } from "./tasks";
import { MobilePaneSwitch } from "./interaction";
export function ContinuousTool() {
  const [s, set] = useToolState<ContinuousState>("continuous"),
    { share, navigate } = useStatisticsWorkspace();
  const patch = (p: Partial<ContinuousState>) => set({ ...s, ...p });
  const [pane, setPane] = useState<"input" | "results">("input");
  const moveMarker = (index: number, value: number) =>
    set((old) => ({ ...old, ...continuousMarkerPatch(old, index, value) }));
  return (
    <div className={`stats-grid distributions-view-${pane}`}>
      <MobilePaneSwitch value={pane} onChange={setPane} />
      <Panel title="PDF、CDF 与变量变换">
        <div className="stats-stack">
          <Notice>
            S2：单区间密度、面积、矩、分位。FS：分段 PDF / CDF
            与相关变量变换。指数模板用于无限支持展示；一般函数求解未实现。
          </Notice>
          <Select
            label="受支持的密度模板"
            value={s.kind}
            onChange={(kind) => patch({ kind })}
            options={[
              ["polynomial", "单段 / 分段二次多项式"],
              ["power", "幂密度 (r+1)xʳ，0≤x≤1"],
              ["exponential", "无限支持：指数密度（拓展模板）"],
            ]}
          />
          {s.kind === "polynomial" ? (
            <TextInput
              label="每段：low, high, c₀, c₁, c₂"
              value={s.segments}
              onChange={(segments) => patch({ segments })}
              hint="f(x)=c₀+c₁x+c₂x²；末尾零系数可省略。区间外为 0，段内非负性由端点与顶点验证。"
            />
          ) : s.kind === "power" ? (
            <NumberField
              label="幂参数 r≥0"
              value={s.power}
              onChange={(power) => patch({ power })}
              min={0}
              max={1000}
            />
          ) : (
            <NumberField
              label="指数率参数 λ>0"
              value={s.rate}
              onChange={(rate) => patch({ rate })}
              min={1e-6}
              max={1000}
            />
          )}
          <NumberField
            label="概率区间下界 a"
            value={s.low}
            onChange={(low) => moveMarker(0, low)}
            max={s.high}
          />
          <NumberField
            label="概率区间上界 b"
            value={s.high}
            onChange={(high) => moveMarker(1, high)}
            min={s.low}
          />
          <NumberField
            label="CDF 游标 x"
            value={s.cursor}
            onChange={(cursor) => moveMarker(2, cursor)}
          />
          <NumberField
            label="分位概率 q"
            value={s.q}
            onChange={(q) => patch({ q })}
            min={0}
            max={1}
          />
          <Select
            label="反求任务"
            value={s.task}
            onChange={(task) => patch({ task })}
            options={[
              ["forward", "正向 / 显式归一化"],
              ["mean", "模板参数：给均值"],
              ["quantile", "模板参数：给分位条件"],
            ]}
          />
          {s.task === "mean" && (
            <NumberField
              label="目标 E(X)"
              value={s.targetMean}
              onChange={(targetMean) => patch({ targetMean })}
              min={0}
              max={1}
            />
          )}{" "}
          {s.task === "quantile" && (
            <>
              <NumberField
                label="给定分位位置 x₀"
                value={s.targetX}
                onChange={(targetX) => patch({ targetX })}
                min={1e-10}
                max={1 - 1e-10}
              />
              <NumberField
                label="F(x₀)=p₀"
                value={s.targetP}
                onChange={(targetP) => patch({ targetP })}
                min={1e-10}
                max={1 - 1e-10}
              />
            </>
          )}
          <Select
            label="Y=h(X) 的变换模板"
            value={s.transform}
            onChange={(transform) => patch({ transform })}
            options={[
              ["square", "Y=X²（正负两分支）"],
              ["absolute", "Y=|X|"],
              ["affine", "Y=aX+b"],
            ]}
          />
          {s.transform === "affine" && (
            <>
              <NumberField
                label="变换系数 a"
                min={-100}
                max={100}
                value={s.a}
                onChange={(a) => patch({ a })}
              />
              <NumberField
                label="变换平移 b"
                min={-1e4}
                max={1e4}
                value={s.b}
                onChange={(b) => patch({ b })}
              />
            </>
          )}
          <NumberField
            label="变换后 CDF 的 y"
            value={s.y}
            onChange={(y) => patch({ y })}
          />
          <div className="stats-toolbar">
            <Button
              onClick={() =>
                patch({
                  kind: "polynomial",
                  segments: "-1, 1, 0.5",
                  transform: "square",
                  y: 0.25,
                  cursor: 0,
                  low: -0.5,
                  high: 0.5,
                })
              }
            >
              双原像：U(−1,1) 的平方
            </Button>
            <Button
              onClick={() =>
                patch({
                  kind: "polynomial",
                  segments: "0, 1, 0, 1\n1, 2, 2, -1",
                  cursor: 1,
                  low: 0,
                  high: 1,
                })
              }
            >
              分段三角密度
            </Button>
          </div>
        </div>
      </Panel>
      <div className="stats-stack stats-tool-results">
        <Output>
          {() => {
            const d: Density =
              s.kind === "polynomial"
                ? { kind: "polynomial", segments: parseSegments(s.segments) }
                : s.kind === "power"
                  ? { kind: "power", power: s.power }
                  : { kind: "exponential", rate: s.rate };
            if (
              (d.kind === "exponential" && d.rate <= 0) ||
              (d.kind === "power" && d.power < 0)
            )
              throw new Error("模板参数不在允许范围内。");
            const area = densityArea(d);
            if (!Number.isFinite(area) || area <= 0)
              throw new Error("密度总面积必须是有限正数。");
            if (Math.abs(area - 1) > 1e-8)
              return (
                <Panel title="该输入尚不是合法密度">
                  <Notice tone="warning">
                    区间内非负，但总面积不等于 1；停止概率、CDF 与矩计算。
                  </Notice>
                  <Result label="当前总面积" value={format(area, 10)} />
                  {d.kind === "polynomial" && (
                    <Button
                      onClick={() =>
                        patch({
                          segments: d.segments
                            .map((row) =>
                              [
                                row.low,
                                row.high,
                                ...row.coefficients.map((c) => c / area),
                              ].join(", "),
                            )
                            .join("\n"),
                        })
                      }
                    >
                      将当前函数归一化（明确除以总面积）
                    </Button>
                  )}
                </Panel>
              );
            if (s.low > s.high) throw new Error("概率区间要求 a≤b。");
            const [left, supportHigh] = densityBounds(d),
              right = Number.isFinite(supportHigh)
                ? supportHigh
                : densityQuantile(d, 0.999),
              width = right - left,
              plotLeft = left - width * 0.06,
              plotRight = right + width * 0.06;
            const grid = Array.from(
                { length: 301 },
                (_, i) => plotLeft + ((plotRight - plotLeft) * i) / 300,
              ),
              pdf = grid.map((x) => ({ x, y: densityPdf(d, x) })),
              cdf = grid.map((x) => ({ x, y: densityCdf(d, x) })),
              mean = densityMoment(d, 1),
              second = densityMoment(d, 2),
              quantile = densityQuantile(d, s.q);
            const probability =
              d.kind === "exponential"
                ? s.high <= 0
                  ? 0
                  : Math.exp(-d.rate * Math.max(0, s.low)) *
                    -Math.expm1(-d.rate * (s.high - Math.max(0, s.low)))
                : Math.max(0, densityCdf(d, s.high) - densityCdf(d, s.low));
            const h = (x: number) =>
                s.transform === "square"
                  ? x * x
                  : s.transform === "absolute"
                    ? Math.abs(x)
                    : s.a * x + s.b,
              ends = [h(left), h(right)],
              min =
                s.transform === "affine"
                  ? Math.min(...ends)
                  : left <= 0 && right >= 0
                    ? 0
                    : Math.min(...ends),
              max = Math.max(...ends),
              transformGrid = Array.from(
                { length: 220 },
                (_, i) => min + ((max - min) * (i + 0.5)) / 220,
              );
            return (
              <>
                <Panel title="密度面积累积成 CDF">
                  <Plot
                    series={[
                      { kind: "line", data: pdf, name: "PDF" },
                      {
                        kind: "bar",
                        data: pdf.filter((p) => p.x <= s.cursor),
                        color: "var(--stats-blue)",
                        name: "累计至游标 x 的面积",
                        barWidth: (plotRight - plotLeft) / 300,
                      },
                      {
                        kind: "bar",
                        data: pdf.filter(
                          (p) =>
                            s.high > s.low && p.x >= s.low && p.x <= s.high,
                        ),
                        color: "var(--stats-gold)",
                        name: "区间 [a,b] 的面积",
                        barWidth: (plotRight - plotLeft) / 300,
                      },
                    ]}
                    xLabel="x"
                    yLabel="f(x)"
                    xDomain={[plotLeft, plotRight]}
                    markers={[
                      { x: s.low, label: "a", step: width / 100 },
                      { x: s.high, label: "b", step: width / 100 },
                    ]}
                    onMarkerChange={moveMarker}
                  />
                  <Plot
                    series={[
                      {
                        kind: "line",
                        data: cdf,
                        name: "CDF",
                        color: "var(--chart-purple)",
                      },
                    ]}
                    xLabel="x"
                    yLabel="F(x)"
                    yDomain={[0, 1]}
                    xDomain={[plotLeft, plotRight]}
                    markers={[
                      {
                        x: s.cursor,
                        label: "累计游标 x",
                        step: width / 100,
                        color: "var(--stats-blue)",
                      },
                    ]}
                    onMarkerChange={(_, value) => moveMarker(2, value)}
                  />
                  <div className="stats-results">
                    <Result label="总面积" value={format(area)} />
                    <Result
                      label="F(游标 x)"
                      value={format(densityCdf(d, s.cursor), 10)}
                    />
                    <Result label="P(a≤X≤b)" value={format(probability, 10)} />
                    <Result label="q 分位" value={format(quantile, 10)} />
                    <Result
                      label="回代 F(xq)−q"
                      value={format(densityCdf(d, quantile) - s.q, 12)}
                    />
                  </div>
                  <MomentResults
                    mean={mean}
                    second={second}
                    variance={Math.max(0, second - mean * mean)}
                  />
                  <Notice>
                    可拖动 PDF 图中的 a / b，或 CDF
                    图中的累计游标；选中圆点后按左右方向键微调。图窗由密度支持固定，拖动不改变横轴尺度。
                    多项式面积和矩用解析原函数；分位用有界二分。密度在分段点可跳跃，连续型变量的
                    CDF 不产生跳跃。
                    {d.kind === "exponential"
                      ? "图窗止于 99.9% 分位，余下 0.001 质量仍纳入计算。"
                      : ""}
                  </Notice>
                  {d.kind === "exponential" && (
                    <Button
                      onClick={() => {
                        share({
                          distribution: { kind: "exponential", rate: d.rate },
                        });
                        navigate("sampling");
                      }}
                    >
                      将指数模板用于抽样
                    </Button>
                  )}
                </Panel>
                <Panel title="变换先找全部原像">
                  <Formula
                    value={
                      s.transform === "square"
                        ? "F_Y(y)=P(-\\sqrt y\\le X\\le\\sqrt y),\\quad y\\ge0"
                        : s.transform === "absolute"
                          ? "F_Y(y)=P(-y\\le X\\le y),\\quad y\\ge0"
                          : "Y=aX+b"
                    }
                  />
                  <Plot
                    series={[
                      {
                        kind: "line",
                        data: grid
                          .filter((x) => x >= left && x <= right)
                          .map((x) => ({ x, y: h(x) })),
                        color: "var(--stats-blue)",
                      },
                    ]}
                    xLabel="X 的支持"
                    yLabel="h(x)"
                  />
                  <Result
                    label="P(h(X)≤y)"
                    value={format(
                      transformedCdf(d, s.y, s.transform, s.a, s.b),
                      10,
                    )}
                  />
                  {s.transform === "affine" && s.a === 0 ? (
                    <Notice>
                      Y=b 为退化点分布，CDF 在 b 跳跃；没有普通连续密度。
                    </Notice>
                  ) : (
                    <>
                      <Plot
                        series={[
                          {
                            kind: "line",
                            data: transformGrid.map((x) => ({
                              x,
                              y: transformedCdf(d, x, s.transform, s.a, s.b),
                            })),
                            color: "var(--chart-purple)",
                          },
                        ]}
                        xLabel="y"
                        yLabel="变换后的 CDF"
                        yDomain={[0, 1]}
                      />
                      <Plot
                        series={[
                          {
                            kind: "line",
                            data: transformGrid.map((x) => ({
                              x,
                              y: transformedPdf(d, x, s.transform, s.a, s.b),
                            })),
                            color: "var(--stats-gold)",
                          },
                        ]}
                        xLabel="y"
                        yLabel="变换后的 PDF"
                      />
                    </>
                  )}
                  {s.transform === "square" && (
                    <>
                      <Result label="E(Y)=E(X²)" value={format(second)} />
                      <Result
                        label="Var(Y)=E(X⁴)−E(X²)²"
                        value={format(
                          Math.max(0, densityMoment(d, 4) - second ** 2),
                        )}
                      />
                      <Notice>
                        平方变换的密度累加 ±√y 两个合法分支；y=0
                        的密度值不影响概率，曲线用内部采样表示可能的无界峰。
                      </Notice>
                    </>
                  )}
                </Panel>
                {s.task !== "forward" && (
                  <Panel title="有限模板反求">
                    <Output>
                      {() => {
                        if (d.kind === "polynomial")
                          return (
                            <Notice>
                              任意分段系数由单个矩或分位不能唯一反求。请切换幂密度或指数模板；本工具不把任意函数约束冒充通用求解。
                            </Notice>
                          );
                        let value: number, residual: number;
                        if (d.kind === "power") {
                          value =
                            s.task === "mean"
                              ? (2 * s.targetMean - 1) / (1 - s.targetMean)
                              : Math.log(s.targetP) / Math.log(s.targetX) - 1;
                          if (
                            !Number.isFinite(value) ||
                            value < 0 ||
                            value > 1000
                          )
                            throw new Error(
                              "所给条件没有 r∈[0,1000] 的幂密度解。均值须在 [1/2,1) 内。",
                            );
                          const solved: Density = {
                            kind: "power",
                            power: value,
                          };
                          residual =
                            s.task === "mean"
                              ? densityMoment(solved, 1) - s.targetMean
                              : densityCdf(solved, s.targetX) - s.targetP;
                          return (
                            <>
                              <Result
                                label="幂参数 r"
                                value={format(value, 10)}
                              />
                              <Result
                                label="回代残差"
                                value={format(residual, 12)}
                              />
                              <Button onClick={() => patch({ power: value })}>
                                应用幂密度参数
                              </Button>
                            </>
                          );
                        }
                        value =
                          s.task === "mean"
                            ? 1 / s.targetMean
                            : -Math.log1p(-s.targetP) / s.targetX;
                        if (
                          !Number.isFinite(value) ||
                          value < 1e-6 ||
                          value > 1000
                        )
                          throw new Error(
                            "条件对应的率参数不在 (0,1000] 的计算范围内。",
                          );
                        residual =
                          s.task === "mean"
                            ? 1 / value - s.targetMean
                            : densityCdf(
                                { kind: "exponential", rate: value },
                                s.targetX,
                              ) - s.targetP;
                        return (
                          <>
                            <Result
                              label="率参数 λ"
                              value={format(value, 10)}
                            />
                            <Result
                              label="回代残差"
                              value={format(residual, 12)}
                            />
                            <Button onClick={() => patch({ rate: value })}>
                              应用指数参数
                            </Button>
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
