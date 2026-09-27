import { Field, Notice, NumberField, Panel, Plot, Result } from "./shared";
import { useStatisticsWorkspace, useToolState } from "./workspace";
import { format, parseNumbers } from "./math";
import { regression } from "./legacy-model";
import type { ToolSpec } from "./workspace-types";
type State = { x: string; y: string; predict: number };
const initial: State = {
  x: "1, 2, 3, 4, 5, 6",
  y: "2, 2.8, 3.4, 4.8, 4.5, 6.1",
  predict: 3.5,
};
function LegacyTool() {
  const [state, setState] = useToolState<State>("legacy");
  const { resultsHidden } = useStatisticsWorkspace();
  let data: ReturnType<typeof regression> | null = null,
    x: number[] = [],
    y: number[] = [],
    error = "";
  try {
    x = parseNumbers(state.x);
    y = parseNumbers(state.y);
    if (x.length > 500) throw new Error("散点样板最多500对");
    data = regression(x, y);
  } catch (e) {
    error = e instanceof Error ? e.message : "输入无效";
  }
  return (
    <div className="stats-stack">
      <Notice tone="warning">
        历史 FS / 拓展：相关、回归及相关检验不属于当前 S1、S2、FS
        核心覆盖。这里保留旧题教学用途。
      </Notice>
      <Panel title="一一对应的双变量观测">
        <div className="stats-grid">
          <Field label="x 数据">
            <textarea
              className="stats-textarea"
              maxLength={10000}
              value={state.x}
              onChange={(e) => setState({ ...state, x: e.target.value })}
            />
          </Field>
          <Field label="y 数据">
            <textarea
              className="stats-textarea"
              maxLength={10000}
              value={state.y}
              onChange={(e) => setState({ ...state, y: e.target.value })}
            />
          </Field>
          <NumberField
            label="用于预测的 x"
            value={state.predict}
            onChange={(predict) => setState({ ...state, predict })}
          />
        </div>
      </Panel>
      {error ? (
        <Notice tone="warning">{error}</Notice>
      ) : (
        data && (
          <>
            <Panel title="散点图与两条回归线">
              <Plot
                series={[
                  {
                    kind: "points",
                    data: x.map((v, i) => ({ x: v, y: y[i] })),
                    name: "观测对",
                  },
                  ...(!resultsHidden
                    ? [
                        {
                          kind: "line" as const,
                          data: [Math.min(...x), Math.max(...x)].map((v) => ({
                            x: v,
                            y: data!.a + data!.b * v,
                          })),
                          name: "y 对 x 回归",
                        },
                        ...(Math.abs(data.bReverse) > 1e-14
                          ? [
                              {
                                kind: "line" as const,
                                data: [Math.min(...y), Math.max(...y)].map(
                                  (v) => ({
                                    x: data!.aReverse + data!.bReverse * v,
                                    y: v,
                                  }),
                                ),
                                name: "x 对 y 回归",
                              },
                            ]
                          : []),
                      ]
                    : []),
                ]}
                xLabel="x"
                yLabel="y"
              />
              <div className="stats-results">
                <Result label="Pearson r" value={format(data.r)} />
                <Result
                  label="y 对 x 的回归线"
                  value={`y = ${format(data.a)} + ${format(data.b)}x`}
                />
                <Result
                  label="x 对 y 的回归线"
                  value={`x = ${format(data.aReverse)} + ${format(data.bReverse)}y`}
                />
                <Result
                  label="用 y 对 x 估计 y"
                  value={format(data.a + data.b * state.predict)}
                />
              </div>
            </Panel>
            <Panel title="历史相关系数检验">
              <p>
                H₀: ρ=0，H₁:
                ρ≠0。检验需要独立随机配对样本及双变量正态模型；相关不意味着因果。
              </p>
              <div className="stats-results">
                <Result
                  label={`t，df=${data.df}`}
                  value={format(data.statistic)}
                />
                <Result label="双尾 p 值" value={format(data.pValue)} />
              </div>
            </Panel>
            {(state.predict < Math.min(...x) ||
              state.predict > Math.max(...x)) && (
              <Notice tone="warning">
                当前预测点超出观测 x 的范围，是外推；线性关系可能不再适用。
              </Notice>
            )}
          </>
        )
      )}
    </div>
  );
}
export const legacyTools: ToolSpec[] = [
  {
    id: "legacy",
    title: "相关与回归（历史拓展）",
    description: "比较两条回归线，保留旧 FS 的双变量统计教学。",
    courses: ["拓展"],
    group: "数据与图表",
    component: LegacyTool,
    initialState: initial,
    validate: (v) => {
      const s = v as State;
      return (
        !!s &&
        typeof s.x === "string" &&
        s.x.length <= 10000 &&
        typeof s.y === "string" &&
        s.y.length <= 10000 &&
        Number.isFinite(s.predict) &&
        Math.abs(s.predict) <= 1e12
      );
    },
  },
];
