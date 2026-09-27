import { useState } from "react";
import { Field, Notice, NumberField, Panel, Plot, Result } from "./shared";
import { seededRandom } from "./sampling-model";
import { useStatisticsWorkspace } from "./workspace";
export type SamplingDesignState = {
  population: number;
  draws: number;
  digits: number;
  method: "reject" | "modulo" | "convenience";
};
export const initialDesign: SamplingDesignState = {
  population: 851,
  draws: 15,
  digits: 3,
  method: "reject",
};
export function validSamplingDesign(s: unknown): s is SamplingDesignState {
  const x = s as SamplingDesignState;
  return (
    !!x &&
    Number.isInteger(x.population) &&
    x.population >= 2 &&
    x.population <= 1000 &&
    Number.isInteger(x.draws) &&
    x.draws >= 1 &&
    x.draws <= 100 &&
    Number.isInteger(x.digits) &&
    x.digits >= 1 &&
    x.digits <= 4 &&
    ["reject", "modulo", "convenience"].includes(x.method)
  );
}
export function mappingProbabilities(s: SamplingDesignState): number[] {
  if (!validSamplingDesign(s) || 10 ** s.digits < s.population)
    throw new Error("随机数字的可能数不足以覆盖总体编号");
  if (s.method === "reject") return Array(s.population).fill(1 / s.population);
  if (s.method === "convenience")
    return Array.from({ length: s.population }, (_, i) =>
      i < Math.ceil(s.population / 2) ? 1 / Math.ceil(s.population / 2) : 0,
    );
  const counts = Array<number>(s.population).fill(0);
  for (let k = 0; k < 10 ** s.digits; k++) counts[k % s.population]++;
  return counts.map((x) => x / 10 ** s.digits);
}
export function SamplingDesign({
  state,
  onChange,
}: {
  state: SamplingDesignState;
  onChange: (state: SamplingDesignState) => void;
}) {
  const { resultsHidden } = useStatisticsWorkspace();
  const [trace, setTrace] = useState<{ raw: number; id: number | null }[]>([]);
  let probs: number[] = [],
    error = "";
  try {
    probs = mappingProbabilities(state);
  } catch (e) {
    error = e instanceof Error ? e.message : "设置无效";
  }
  const run = () => {
    const rng = seededRandom(12345),
      items: { raw: number; id: number | null }[] = [];
    let accepted = 0;
    while (accepted < state.draws && items.length < 2000) {
      const raw = Math.floor(rng() * 10 ** state.digits),
        id =
          state.method === "reject"
            ? raw < state.population
              ? raw + 1
              : null
            : state.method === "modulo"
              ? (raw % state.population) + 1
              : Math.floor(rng() * Math.ceil(state.population / 2)) + 1;
      items.push({ raw, id });
      if (id !== null) accepted++;
    }
    setTrace(items);
  };
  return (
    <Panel title="抽样设计：随机数字怎样对应总体编号">
      <div className="stats-grid">
        <NumberField
          label="总体人数 N"
          value={state.population}
          min={2}
          max={1000}
          step={1}
          onChange={(population) => {
            onChange({ ...state, population });
            setTrace([]);
          }}
        />
        <NumberField
          label="随机数字位数"
          value={state.digits}
          min={1}
          max={4}
          step={1}
          onChange={(digits) => {
            onChange({ ...state, digits });
            setTrace([]);
          }}
        />
        <NumberField
          label="展示的有效抽取次数"
          value={state.draws}
          min={1}
          max={100}
          step={1}
          onChange={(draws) => {
            onChange({ ...state, draws });
            setTrace([]);
          }}
        />
        <Field label="编号方案">
          <select
            className="stats-input"
            value={state.method}
            onChange={(e) => {
              onChange({
                ...state,
                method: e.target.value as SamplingDesignState["method"],
              });
              setTrace([]);
            }}
          >
            <option value="reject">拒绝超范围数字，再重新抽取</option>
            <option value="modulo">直接取余数（观察不等机会）</option>
            <option value="convenience">只从前半数名单抽取</option>
          </select>
        </Field>
      </div>
      {error ? (
        <Notice tone="warning">{error}</Notice>
      ) : (
        <>
          <Plot
            series={[
              {
                kind: "bar",
                data: probs.map((y, i) => ({ x: i + 1, y })),
                barWidth: 1,
                name: "一次有效抽取的编号概率",
              },
            ]}
            xLabel="总体编号"
            yLabel="概率"
            height={210}
          />
          <div className="stats-results">
            <Result
              label="最小编号概率"
              value={Math.min(...probs).toPrecision(5)}
            />
            <Result
              label="最大编号概率"
              value={Math.max(...probs).toPrecision(5)}
            />
            <Result
              label="所有成员等机会？"
              value={
                Math.max(...probs) - Math.min(...probs) < 1e-14 ? "是" : "否"
              }
            />
          </div>
          <div className="stats-toolbar">
            <button className="stats-button" onClick={run}>
              逐步查看一批编号
            </button>
          </div>
          {!!trace.length && !resultsHidden && (
            <p>
              {trace.map((t, i) => (
                <span
                  key={i}
                  style={{
                    color: t.id === null ? "var(--stats-rose)" : undefined,
                  }}
                >
                  {String(t.raw).padStart(state.digits, "0")} →{" "}
                  {t.id === null ? "拒绝" : t.id}
                  {i < trace.length - 1 ? "； " : ""}
                </span>
              ))}
            </p>
          )}
        </>
      )}
      <Notice>
        这里演示独立、有放回的编号抽取；不放回抽样需在已抽编号处重新抽取。重复使用重叠的随机数字，可能破坏独立性。增加样本量不能修复名单只覆盖前半数造成的抽样框偏差。
      </Notice>
    </Panel>
  );
}
