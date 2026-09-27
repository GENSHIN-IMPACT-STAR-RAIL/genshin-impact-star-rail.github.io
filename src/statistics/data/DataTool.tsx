import { useRef, useState } from "react";
import { Field, NumberField, Notice, Panel, Result } from "../shared";
import { useStatisticsWorkspace, useToolState } from "../workspace";
import type { DataState } from "./state";
import {
  dataModel,
  equalWidthGroups,
  mergeMoments,
  numericList,
  parseGroups,
  rawFrequency,
  summaryMoments,
  weightedMoments,
  weightedQuantile,
} from "./model";
import type { GroupRow } from "./model";
import { attempt, fmt, HiddenResults, Select } from "./ui";

type Box = { label: string; values: number[]; mean: number };
function CumulativePlot({
  points,
  n,
  percentile,
  quantile,
  unit,
  onChange,
}: {
  points: { x: number; y: number }[];
  n: number;
  percentile: number;
  quantile: number;
  unit: string;
  onChange: (p: number) => void;
}) {
  let lo = Math.min(...points.map((p) => p.x)),
    hi = Math.max(...points.map((p) => p.x));
  if (lo === hi) {
    const halfWidth = Math.max(1, Math.abs(lo) * 1e-6) / 2;
    lo -= halfWidth;
    hi += halfWidth;
  }
  const x = (v: number) => 50 + ((v - lo) / (hi - lo)) * 540,
    y = (v: number) => 225 - (v / n) * 185;
  const move = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect(),
      sy = ((event.clientY - rect.top) / rect.height) * 280;
    onChange(Math.max(0, Math.min(100, Math.round(((225 - sy) / 185) * 100))));
  };
  return (
    <svg
      className="data-chart"
      style={{ touchAction: "none", cursor: "ns-resize" }}
      viewBox="0 0 640 280"
      role="img"
      aria-label="累计频数图，可上下拖动百分位水平线"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) move(e);
      }}
      onPointerUp={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
      }}
    >
      <text x="12" y="20">
        累计频数
      </text>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line className="axis" x1="50" x2="590" y1={y(n * f)} y2={y(n * f)} />
          <text x="42" y={y(n * f) + 4} textAnchor="end">
            {fmt(n * f)}
          </text>
        </g>
      ))}
      <path
        d={points
          .map((p, i) => `${i ? "L" : "M"}${x(p.x)},${y(p.y)}`)
          .join(" ")}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
      />
      <line
        x1="50"
        x2="590"
        y1={y((n * percentile) / 100)}
        y2={y((n * percentile) / 100)}
        stroke="var(--stats-gold)"
        strokeWidth="2"
        strokeDasharray="5 4"
      />
      <line
        x1={x(quantile)}
        x2={x(quantile)}
        y1="35"
        y2="225"
        stroke="var(--stats-gold)"
        strokeDasharray="5 4"
      />
      <text
        x="588"
        y={Math.max(30, y((n * percentile) / 100) - 7)}
        textAnchor="end"
      >
        {percentile}%
      </text>
      <text x="50" y="245">
        {fmt(lo)}
      </text>
      <text x="590" y="245" textAnchor="end">
        {fmt(hi)}
      </text>
      <text x="590" y="272" textAnchor="end">
        {unit}；上下拖动改变百分位
      </text>
    </svg>
  );
}
function BoxPlots({ boxes, unit }: { boxes: Box[]; unit: string }) {
  const all = boxes.flatMap((b) => b.values),
    min = Math.min(...all),
    max = Math.max(...all),
    span = max - min || Math.max(1, Math.abs(min) * 1e-6),
    lo = min - span * 0.08,
    hi = max + span * 0.08,
    x = (v: number) => 60 + ((v - lo) / (hi - lo)) * 520;
  return (
    <svg
      className="data-chart"
      viewBox={`0 0 640 ${boxes.length * 72 + 65}`}
      role="img"
      aria-label="使用相同坐标尺度的箱线图，须为最小值和最大值"
    >
      {boxes.map((b, i) => {
        const y = 42 + i * 72,
          [minimum, q1, median, q3, maximum] = b.values;
        return (
          <g key={b.label}>
            <text x="8" y={y - 15}>
              {b.label}
            </text>
            <line
              x1={x(minimum)}
              x2={x(maximum)}
              y1={y}
              y2={y}
              stroke="var(--accent)"
              strokeWidth="2"
            />
            <rect
              x={x(q1)}
              y={y - 14}
              width={Math.max(1, x(q3) - x(q1))}
              height="28"
              fill="var(--accent-soft)"
              stroke="var(--accent)"
            />
            <line
              x1={x(median)}
              x2={x(median)}
              y1={y - 14}
              y2={y + 14}
              stroke="var(--accent)"
              strokeWidth="3"
            />
            {[minimum, maximum].map((v, j) => (
              <line
                key={j}
                x1={x(v)}
                x2={x(v)}
                y1={y - 8}
                y2={y + 8}
                stroke="var(--accent)"
              />
            ))}
            <circle cx={x(b.mean)} cy={y} r="4" fill="var(--stats-gold)">
              <title>均值 {fmt(b.mean)}</title>
            </circle>
            {b.values.map((v, j) => (
              <text key={j} x={x(v)} y={y + 29} textAnchor="middle">
                {fmt(v)}
              </text>
            ))}
          </g>
        );
      })}
      <text x="620" y={boxes.length * 72 + 50} textAnchor="end">
        {unit || "观测值"}（橙点为均值）
      </text>
    </svg>
  );
}
function Histogram({
  groups,
  probability,
  unit,
  onMerge,
}: {
  groups: GroupRow[];
  probability: boolean;
  unit: string;
  onMerge?: (i: number) => void;
}) {
  const n = groups.reduce((s, g) => s + g.f, 0),
    lo = groups[0].low,
    hi = groups[groups.length - 1].high,
    x = (v: number) => 55 + ((v - lo) / (hi - lo)) * 555,
    heights = groups.map((g) => g.f / (g.high - g.low) / (probability ? n : 1)),
    top = Math.max(...heights, Number.MIN_VALUE),
    y = (v: number) => 195 - (v / top) * 145;
  return (
    <>
      <svg
        className="data-chart"
        viewBox="0 0 650 250"
        role="img"
        aria-label="不等组距直方图，柱面积表示频数或概率"
      >
        <text x="8" y="20">
          {probability ? "概率密度 f/(n × 组宽)" : "频数密度 f/组宽"}
        </text>
        <line className="axis" x1="55" x2="615" y1="195" y2="195" />
        {groups.map((g, i) => (
          <g key={`${g.low}-${g.high}`}>
            <rect
              x={x(g.low)}
              y={y(heights[i])}
              width={Math.max(0.3, x(g.high) - x(g.low))}
              height={195 - y(heights[i])}
              fill="color-mix(in srgb, var(--accent) 27%, transparent)"
              stroke="var(--accent)"
            >
              <title>
                {g.low}–{g.high}：组宽 {fmt(g.high - g.low)}，密度{" "}
                {fmt(heights[i])}，面积 {fmt(probability ? g.f / n : g.f)}
              </title>
            </rect>
            <text
              x={(x(g.low) + x(g.high)) / 2}
              y={y(heights[i]) - 7}
              textAnchor="middle"
            >
              {fmt(heights[i])}
            </text>
            <text x={x(g.low)} y="214" textAnchor="middle">
              {fmt(g.low)}
            </text>
          </g>
        ))}
        <text x={x(hi)} y="214" textAnchor="middle">
          {fmt(hi)}
        </text>
        <text x="610" y="240" textAnchor="end">
          {unit || "组界"}
        </text>
      </svg>
      <p className="data-viz-caption">
        面积总和 = {probability ? "1" : fmt(n)}
        。这里使用连续组界；例如精确到整数的 10–19 需自行输入边界 9.5–19.5。
      </p>
      <div className="stats-toolbar">
        {onMerge &&
          groups.length <= 12 &&
          groups.slice(0, -1).map((g, i) => (
            <button
              key={i}
              className="stats-button"
              disabled={g.high !== groups[i + 1].low}
              onClick={() => onMerge(i)}
            >
              合并第 {i + 1}、{i + 2} 组
            </button>
          ))}
      </div>
    </>
  );
}

export function DataTool() {
  const [s, set] = useToolState<DataState>("data");
  const { share, navigate, resultsHidden } = useStatisticsWorkspace();
  const update = <K extends keyof DataState>(key: K, value: DataState[K]) =>
    set((old) => ({ ...old, [key]: value }));
  const [operationError, setOperationError] = useState(""),
    [summaryOld, setSummaryOld] = useState(5),
    [areaHeight, setAreaHeight] = useState(3),
    [areaWidth, setAreaWidth] = useState(4),
    [areaScale, setAreaScale] = useState(1);
  const drag = useRef<{ index: number; lo: number; hi: number } | null>(null);
  const computed = attempt(() => dataModel(s)),
    d = computed.value;
  const histogram =
    d?.groups ?? (d?.table ? equalWidthGroups(d.table, s.histogramBins) : null);
  const selectedIndex = Math.min(
    s.selected,
    Math.max(0, (d?.values?.length ?? 1) - 1),
  );
  const second = attempt(() =>
    weightedMoments(rawFrequency(numericList(s.second))),
  );
  const secondValues = attempt(() => numericList(s.second)).value;
  const setRaw = (values: number[], ids?: number[], history?: string) =>
    set((old) => ({
      ...old,
      raw: values.join(", "),
      observationIds: ids ?? old.observationIds,
      history: history ?? old.history,
      selected: Math.min(old.selected, Math.max(0, values.length - 1)),
    }));
  const importRaw = (text: string) => {
    const parsed = attempt(() => numericList(text));
    set((old) => {
      const count = parsed.value?.length ?? old.observationIds.length,
        ids = old.observationIds.slice(0, count);
      let next = old.nextId;
      while (ids.length < count) ids.push(next++);
      return {
        ...old,
        raw: text,
        observationIds: ids,
        nextId: next,
        selected: Math.min(old.selected, Math.max(0, count - 1)),
        history: "",
      };
    });
  };
  const changeObservation = (index: number, x: number) => {
    if (!d?.raw || !Number.isFinite(x)) return;
    const sourceValue = s.coded ? (x - s.codeA) / s.codeB : x,
      values = [...d.raw];
    if (Math.abs(sourceValue) > 1e12) {
      setOperationError("编码后的观测值超出当前数值范围。");
      return;
    }
    values[index] = sourceValue;
    if (values.join(", ").length > 20000) {
      setOperationError("调整后的文本超过 20000 字符，未应用此次移动。");
      return;
    }
    setRaw(values);
  };
  const operate = (kind: "add" | "delete" | "correct") => {
    if (!d) return;
    setOperationError("");
    try {
      const m = d.moments,
        oldValue = d.values?.[selectedIndex] ?? summaryOld,
        newValue = s.editValue;
      let n = m.n,
        sum = m.sum,
        sumSquares = m.sumSquares;
      if (kind === "add") {
        n++;
        sum += newValue;
        sumSquares += newValue * newValue;
      }
      if (kind === "delete") {
        n--;
        sum -= oldValue;
        sumSquares -= oldValue * oldValue;
      }
      if (kind === "correct") {
        sum += newValue - oldValue;
        sumSquares += newValue * newValue - oldValue * oldValue;
      }
      summaryMoments(n, sum, sumSquares);
      const history = `${kind === "add" ? "新增" : kind === "delete" ? "删除" : "订正"}：Δn = ${n - m.n}，ΔΣx = ${fmt(sum - m.sum)}，ΔΣx² = ${fmt(sumSquares - m.sumSquares)}。`;
      if (d.raw) {
        const values = [...d.raw],
          ids = [...s.observationIds],
          v = s.coded ? (newValue - s.codeA) / s.codeB : newValue;
        if (Math.abs(v) > 1e12)
          throw new Error("编码后的观测值超出当前数值范围。");
        if (kind === "add") {
          if (values.length >= 2000) throw new Error("原始数据最多 2000 项。");
          values.push(v);
          ids.push(s.nextId);
        }
        if (kind === "delete") {
          values.splice(selectedIndex, 1);
          ids.splice(selectedIndex, 1);
        }
        if (kind === "correct") values[selectedIndex] = v;
        set((old) => ({
          ...old,
          raw: values.join(", "),
          observationIds: ids,
          nextId: old.nextId + (kind === "add" ? 1 : 0),
          selected: Math.min(old.selected, values.length - 1),
          history,
        }));
      } else
        set((old) => ({
          ...old,
          mode: "summary",
          n,
          sum,
          sumSquares,
          coded: false,
          history,
        }));
    } catch (e) {
      setOperationError(e instanceof Error ? e.message : String(e));
    }
  };
  const mergeGroups = (i: number) => {
    try {
      let groups = parseGroups(s.grouped);
      if (s.coded && s.codeB < 0) i = groups.length - 2 - i;
      if (groups[i].high !== groups[i + 1].low)
        throw new Error("仅合并边界相接的两组。");
      groups.splice(i, 2, {
        low: groups[i].low,
        high: groups[i + 1].high,
        f: groups[i].f + groups[i + 1].f,
      });
      update(
        "grouped",
        groups.map((g) => `${g.low} ${g.high} ${g.f}`).join("\n"),
      );
      update(
        "history",
        "已合并相邻组：总频数不变；用新组中点重新估计矩，估计均值和方差可能改变。",
      );
    } catch (e) {
      setOperationError(String(e));
    }
  };
  const equalizeGroupWidths = () => {
    try {
      const groups = parseGroups(s.grouped),
        lo = groups[0].low,
        hi = groups.at(-1)!.high,
        width = (hi - lo) / groups.length;
      const next = groups.map((g, i) => ({
        low: lo + i * width,
        high: i === groups.length - 1 ? hi : lo + (i + 1) * width,
        f: g.f,
      }));
      if (next.some((g) => g.high <= g.low))
        throw new Error("等组距小于当前数值可分辨精度。");
      set((old) => ({
        ...old,
        grouped: next.map((g) => `${g.low} ${g.high} ${g.f}`).join("\n"),
        history:
          "已保留各行频数并改写为等组距。这改变了分组数据的组界，不代表从原分组表恢复了原始观测。",
      }));
      setOperationError("");
    } catch (e) {
      setOperationError(e instanceof Error ? e.message : String(e));
    }
  };
  const graphValues = d?.values ?? [],
    min = graphValues.length ? Math.min(...graphValues) : 0,
    max = graphValues.length ? Math.max(...graphValues) : 1,
    span = max - min || Math.max(1, Math.abs(min) * 0.1),
    lo = drag.current?.lo ?? min - span * 0.15,
    hi = drag.current?.hi ?? max + span * 0.15;
  const boxes: Box[] = [];
  if (d?.table || d?.groups) {
    boxes.push({
      label: d.groups ? "本组（估计）" : "本组",
      values: [
        d.groups?.find((g) => g.f > 0)?.low ?? d.moments.minimum!,
        d.quantile(0.25)!,
        d.quantile(0.5)!,
        d.quantile(0.75)!,
        d.groups?.filter((g) => g.f > 0).at(-1)?.high ?? d.moments.maximum!,
      ],
      mean: d.moments.mean,
    });
  }
  if (second.value && secondValues) {
    const t = rawFrequency(secondValues);
    boxes.push({
      label: "比较组",
      values: [
        second.value.minimum!,
        weightedQuantile(t, 0.25, s.quartiles),
        weightedQuantile(t, 0.5, s.quartiles),
        weightedQuantile(t, 0.75, s.quartiles),
        second.value.maximum!,
      ],
      mean: second.value.mean,
    });
  }
  let cumulative: { x: number; y: number }[] = [];
  if (d?.groups) {
    let total = 0;
    for (const g of d.groups) {
      cumulative.push({ x: g.low, y: total });
      total += g.f;
      cumulative.push({ x: g.high, y: total });
    }
  } else if (d?.table) {
    let total = 0;
    for (const v of d.table) {
      cumulative.push({ x: v.x, y: total });
      total += v.f;
      cumulative.push({ x: v.x, y: total });
    }
  }
  const stem = attempt(() => {
    if (!d?.values) return "";
    if (s.precision <= 0) throw new Error("茎叶图需设置正测量精度。");
    if (
      d.values.some(
        (x) =>
          x < 0 ||
          Math.abs(x / s.precision - Math.round(x / s.precision)) > 1e-6,
      )
    )
      throw new Error("当前茎叶模板支持非负数据且数据须为所填精度的整数倍。");
    const rows = new Map<number, number[]>();
    for (const x of d.values) {
      const scaled = Math.round(x / s.precision),
        stem = Math.floor(scaled / 10),
        leaf = scaled % 10;
      rows.set(stem, [...(rows.get(stem) ?? []), leaf]);
    }
    return [...rows]
      .sort((a, b) => a[0] - b[0])
      .map(([k, v]) => `${k} | ${v.sort((a, b) => a - b).join(" ")}`)
      .join("\n");
  });
  const observationPlot = d?.values && (
    <Panel title="拖动原始点，观察统计量变化">
      <p className="data-viz-caption">
        横向拖动一个点，或选中后用左右方向键按测量精度移动。观测保留身份编号；显示前
        300 点。
      </p>
      <svg
        className="data-chart data-svg-draggable"
        viewBox="0 0 640 160"
        role="group"
        aria-label="可拖动原始观测点"
        onPointerMove={(e) => {
          if (!drag.current) return;
          const rect = e.currentTarget.getBoundingClientRect(),
            fraction = Math.max(
              0,
              Math.min(
                1,
                (((e.clientX - rect.left) / rect.width) * 640) / 540 - 50 / 540,
              ),
            ),
            v =
              drag.current.lo + fraction * (drag.current.hi - drag.current.lo),
            step = s.precision || 0.01;
          changeObservation(drag.current.index, Math.round(v / step) * step);
        }}
        onPointerUp={(e) => {
          drag.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <line className="axis" x1="50" x2="590" y1="110" y2="110" />
        <text x="50" y="137">
          {fmt(lo)}
        </text>
        <text x="590" y="137" textAnchor="end">
          {fmt(hi)} {s.unit}
        </text>
        {d.values.slice(0, 300).map((v, i) => (
          <circle
            key={s.observationIds[i] ?? i}
            cx={50 + ((v - lo) / (hi - lo)) * 540}
            cy={48 + (i % 4) * 15}
            r={s.selected === i ? 7 : 5}
            fill={s.selected === i ? "var(--stats-gold)" : "var(--accent)"}
            tabIndex={0}
            aria-label={`观测 ${s.observationIds[i] ?? i + 1}：${fmt(v)}`}
            onFocus={() => update("selected", i)}
            onPointerDown={(e) => {
              e.preventDefault();
              drag.current = { index: i, lo, hi };
              update("selected", i);
              e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                changeObservation(
                  i,
                  v + (e.key === "ArrowLeft" ? -1 : 1) * (s.precision || 0.01),
                );
              }
            }}
          >
            <title>
              观测 #{s.observationIds[i] ?? i + 1}：{fmt(v)}
            </title>
          </circle>
        ))}
      </svg>
    </Panel>
  );
  return (
    <div className="stats-stack">
      <Panel title="输入数据与计算约定">
        <div className="stats-grid">
          <div className="stats-stack">
            <Select
              label="数据来源"
              value={s.mode}
              onChange={(v) => update("mode", v)}
              options={[
                ["raw", "原始数据"],
                ["frequency", "值—频数表"],
                ["grouped", "组界—频数表"],
                ["summary", "仅汇总量 n、Σx、Σx²"],
              ]}
            />
            <div className="data-controls-row">
              <Field label="变量名称">
                <input
                  className="stats-input"
                  value={s.name}
                  maxLength={100}
                  onChange={(e) => update("name", e.target.value)}
                />
              </Field>
              <Field label="单位">
                <input
                  className="stats-input"
                  value={s.unit}
                  maxLength={40}
                  onChange={(e) => update("unit", e.target.value)}
                />
              </Field>
              <NumberField
                label="测量精度（拖动步长）"
                value={s.precision}
                min={0}
                max={1e6}
                step={0.1}
                onChange={(v) => update("precision", v)}
              />
            </div>
            {s.mode === "raw" && (
              <Field
                label="原始数列"
                hint="支持空格、逗号、换行；最多 2000 项，空白不作零。"
              >
                <textarea
                  className="stats-textarea"
                  rows={4}
                  maxLength={20000}
                  value={s.raw}
                  onChange={(e) => importRaw(e.target.value)}
                />
              </Field>
            )}
            {s.mode === "frequency" && (
              <Field label="每行：数值 频数">
                <textarea
                  className="stats-textarea"
                  rows={7}
                  maxLength={20000}
                  value={s.frequency}
                  onChange={(e) => update("frequency", e.target.value)}
                />
              </Field>
            )}
            {s.mode === "grouped" && (
              <>
                <Field label="每行：下界 上界 频数">
                  <textarea
                    className="stats-textarea"
                    rows={7}
                    maxLength={20000}
                    value={s.grouped}
                    onChange={(e) => update("grouped", e.target.value)}
                  />
                </Field>
                <button className="stats-button" onClick={equalizeGroupWidths}>
                  保留各行频数，将组界改为等组距
                </button>
              </>
            )}
            {s.mode === "summary" && (
              <>
                <NumberField
                  label="n"
                  value={s.n}
                  min={1}
                  max={1e8}
                  step={1}
                  onChange={(v) => update("n", v)}
                />
                <NumberField
                  label="Σx（编码时为 Σy）"
                  value={s.sum}
                  min={-1e40}
                  max={1e40}
                  onChange={(v) => update("sum", v)}
                />
                <NumberField
                  label="Σx²（编码时为 Σy²）"
                  value={s.sumSquares}
                  min={0}
                  max={1e80}
                  onChange={(v) => update("sumSquares", v)}
                />
              </>
            )}
          </div>
          <div className="stats-stack">
            {observationPlot}
            {d && (
              <HiddenResults hidden={resultsHidden}>
                {d.groups ? (
                  <Histogram
                    groups={d.groups}
                    probability={s.density === "probability"}
                    unit={s.unit}
                    onMerge={mergeGroups}
                  />
                ) : (
                  boxes.length > 0 && (
                    <BoxPlots boxes={boxes.slice(0, 1)} unit={s.unit} />
                  )
                )}
                <div className="stats-results">
                  <Result label="均值" value={fmt(d.moments.mean)} />
                  <Result label="描述标准差" value={fmt(d.moments.sd)} />
                </div>
              </HiddenResults>
            )}
          </div>
        </div>
      </Panel>
      <details className="data-advanced">
        <summary>编码、分位数约定与比较组（点击展开）</summary>{" "}
        <div className="stats-stack">
          <Select
            label="原始/频数数据四分位数约定"
            value={s.quartiles}
            onChange={(v) => update("quartiles", v)}
            options={[
              ["position", "位置 p(n+1)，相邻秩线性插值"],
              ["halves", "上下半组中位数，奇数 n 排除总中位数"],
            ]}
          />
          <Notice>
            两种约定均明确展示；请按当前试题要求选择。位置法端点截至最小/最大值。半组法仅用于
            Q₁、中位数和 Q₃，其他百分位仍用位置法。
          </Notice>
          <label className="data-check">
            <input
              type="checkbox"
              checked={s.coded}
              onChange={(e) => update("coded", e.target.checked)}
            />
            输入是编码后的 y，按 x = a + by 还原
          </label>
          {s.coded && (
            <>
              <div className="data-controls-row">
                <NumberField
                  label="a"
                  value={s.codeA}
                  min={-1e6}
                  max={1e6}
                  onChange={(v) => update("codeA", v)}
                />
                <NumberField
                  label="b（不能为 0）"
                  value={s.codeB}
                  min={-1e6}
                  max={1e6}
                  onChange={(v) => {
                    if (v === 0) setOperationError("编码斜率 b 不能为 0。");
                    else {
                      setOperationError("");
                      update("codeB", v);
                    }
                  }}
                />
              </div>
              <Notice>
                Σx = na + bΣy；Σx² = na² + 2abΣy + b²Σy²；Var(x) =
                b²Var(y)。以下统计与图显示还原后的 x。
              </Notice>
            </>
          )}
          <Field label="比较组原始数据（同一单位，可留空）">
            <textarea
              className="stats-textarea"
              rows={4}
              maxLength={20000}
              value={s.second}
              onChange={(e) => update("second", e.target.value)}
            />
          </Field>
        </div>
      </details>
      {computed.error && <Notice tone="warning">{computed.error}</Notice>}
      {d && (
        <>
          <HiddenResults hidden={resultsHidden}>
            <Panel title={d.groups ? "中点估计与分组插值" : "统计摘要"}>
              {d.groups && (
                <Notice>
                  均值和方差以组中点估计，分位数以组内均匀假设插值。没有生成伪原始样本。
                </Notice>
              )}
              <div className="stats-results">
                <Result label="n" value={fmt(d.moments.n)} />
                <Result label="Σx" value={fmt(d.moments.sum)} />
                <Result label="Σx²" value={fmt(d.moments.sumSquares)} />
                <Result label="均值" value={fmt(d.moments.mean)} />
                <Result
                  label="描述方差（除以 n）"
                  value={fmt(d.moments.variance)}
                  note="S1 的描述离散程度"
                />
                <Result label="描述标准差" value={fmt(d.moments.sd)} />
                <Result
                  label="总体方差的无偏估计（除以 n−1）"
                  value={fmt(d.moments.unbiased)}
                  note="S2；要求随机样本且 n > 1"
                />
                {d.table && (
                  <>
                    <Result label="中位数" value={fmt(d.quantile(0.5))} />
                    <Result
                      label="Q₁、Q₃"
                      value={`${fmt(d.quantile(0.25))}，${fmt(d.quantile(0.75))}`}
                    />
                    <Result
                      label="IQR"
                      value={fmt(d.quantile(0.75)! - d.quantile(0.25)!)}
                    />
                  </>
                )}
              </div>
              {s.history && <Notice>{s.history}</Notice>}
            </Panel>
          </HiddenResults>
          <HiddenResults hidden={resultsHidden}>
            {histogram && (
              <Panel title="直方图：高度、组宽和面积">
                {!d.groups && (
                  <NumberField
                    label="自动等宽分组数（联动原始/频数数据）"
                    value={s.histogramBins}
                    min={1}
                    max={30}
                    step={1}
                    onChange={(v) => update("histogramBins", v)}
                  />
                )}
                <Select
                  label="纵轴归一化"
                  value={s.density}
                  onChange={(v) => update("density", v)}
                  options={[
                    ["frequency", "频数密度"],
                    ["probability", "概率密度"],
                  ]}
                />
                <Histogram
                  groups={histogram}
                  probability={s.density === "probability"}
                  unit={s.unit}
                  onMerge={d.groups ? mergeGroups : undefined}
                />
                {!d.groups && (
                  <Notice>
                    图按当前原始/频数数据重新分组，内部区间左闭右开，最末组包含最大值。原始数据统计仍用真实值，不用组中点替代。
                  </Notice>
                )}
              </Panel>
            )}
            {d.table && (
              <div className="stats-grid">
                <Panel title="频数表与累计频数">
                  <div className="data-scroll">
                    <table className="stats-table">
                      <thead>
                        <tr>
                          <th>{d.groups ? "组中点（估计）" : s.name}</th>
                          <th>频数</th>
                          <th>累计频数</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.table.map((r, i) => (
                          <tr key={i}>
                            <td>{fmt(r.x)}</td>
                            <td>{r.f}</td>
                            <td>
                              {d
                                .table!.slice(0, i + 1)
                                .reduce((a, b) => a + b.f, 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
                <Panel title="累计频数与百分位">
                  <CumulativePlot
                    points={cumulative}
                    n={d.moments.n}
                    percentile={s.percentile}
                    quantile={d.quantile(s.percentile / 100)!}
                    unit={s.unit || s.name}
                    onChange={(v) => update("percentile", v)}
                  />
                  <Field label={`百分位 p = ${s.percentile}%`}>
                    <input
                      aria-label="百分位滑块"
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={s.percentile}
                      onChange={(e) =>
                        update("percentile", Number(e.target.value))
                      }
                    />
                  </Field>
                  <Result
                    label={
                      d.groups ? "分组线性插值（估计）" : "依所选秩约定的分位数"
                    }
                    value={fmt(d.quantile(s.percentile / 100))}
                    note={`目标累计频数 ${fmt((d.moments.n * s.percentile) / 100)}；原始样本分位数不等同于经验分布逆函数。`}
                  />
                </Panel>
              </div>
            )}
            {boxes.length > 0 && (
              <Panel title="箱线图与比较（共同坐标尺度）">
                <BoxPlots boxes={boxes} unit={s.unit} />
                <p className="data-viz-caption">
                  箱体为 Q₁ 至 Q₃，中线为中位数；须取最小/最大值，未采用 Tukey
                  的 1.5 IQR 截须规则。分组图的端点为非空首末组界。
                </p>
                {second.value && (
                  <div className="stats-results">
                    <Result label="比较组均值" value={fmt(second.value.mean)} />
                    <Result
                      label="比较组描述标准差"
                      value={fmt(second.value.sd)}
                    />
                    <Result
                      label="两组合并后的均值"
                      value={fmt(mergeMoments(d.moments, second.value).mean)}
                    />
                    <Result
                      label="两组合并后的描述标准差"
                      value={fmt(mergeMoments(d.moments, second.value).sd)}
                    />
                  </div>
                )}
                {second.value && (
                  <button
                    className="stats-button"
                    onClick={() => {
                      const combined = mergeMoments(d.moments, second.value!);
                      try {
                        set((old) => ({
                          ...old,
                          mode: "summary",
                          coded: false,
                          n: combined.n,
                          sum: combined.sum,
                          sumSquares: combined.sumSquares,
                          history: `合并比较组：Δn=${second.value!.n}，ΔΣx=${fmt(second.value!.sum)}，ΔΣx²=${fmt(second.value!.sumSquares)}。当前保留合并汇总量。`,
                        }));
                      } catch (e) {
                        setOperationError(
                          e instanceof Error ? e.message : String(e),
                        );
                      }
                    }}
                  >
                    将比较组合并为本组汇总量
                  </button>
                )}
                <Notice>
                  合并先合计
                  n、Σx、Σx²，或加上组间均值差的变异；不能直接平均两个标准差。分组数据参与时合并结果也只是中点估计。
                </Notice>
              </Panel>
            )}
            {d.values && (
              <Panel title="茎叶图">
                {stem.error ? (
                  <Notice>{stem.error}</Notice>
                ) : (
                  <>
                    <pre className="data-stem">{stem.value}</pre>
                    <p>
                      读图键：1 | 2 表示 {fmt(12 * s.precision)} {s.unit}。
                    </p>
                  </>
                )}
              </Panel>
            )}
          </HiddenResults>
          <Panel title="新增、删除、订正与缺项反求">
            {s.mode === "grouped" || s.mode === "frequency" ? (
              <Notice>
                汇总操作按当前统计矩执行，并切换到“仅汇总量”；不会反造原始观测。分组数据优先直接编辑组界和频数。
              </Notice>
            ) : null}
            <div className="data-controls-row">
              {d.values ? (
                <NumberField
                  label="选中观测序号（从 1 起）"
                  value={Math.min(s.selected + 1, d.values.length)}
                  min={1}
                  max={d.values.length}
                  step={1}
                  onChange={(v) =>
                    update(
                      "selected",
                      Math.max(
                        0,
                        Math.min(d.values!.length - 1, Math.floor(v) - 1),
                      ),
                    )
                  }
                />
              ) : (
                <NumberField
                  label="删除或订正前的值 x"
                  value={summaryOld}
                  onChange={setSummaryOld}
                />
              )}
              <NumberField
                label="新增/订正后的值 x"
                value={s.editValue}
                onChange={(v) => update("editValue", v)}
              />
            </div>
            <div className="stats-toolbar">
              <button className="stats-button" onClick={() => operate("add")}>
                新增一项
              </button>
              <button
                className="stats-button"
                disabled={d.moments.n <= 1}
                onClick={() => operate("delete")}
              >
                删除一项
              </button>
              <button
                className="stats-button"
                onClick={() => operate("correct")}
              >
                订正一项
              </button>
            </div>
            {operationError && <Notice tone="warning">{operationError}</Notice>}
            <NumberField
              label="新增一项后希望达到的平均数"
              value={s.targetMean}
              onChange={(v) => update("targetMean", v)}
            />
            <HiddenResults hidden={resultsHidden}>
              <Result
                label="所缺的一个观测值"
                value={fmt((d.moments.n + 1) * s.targetMean - d.moments.sum)}
                note="设新增项为 z，则 (Σx+z)/(n+1)=目标平均数。"
              />
            </HiddenResults>
          </Panel>
          <Panel title="图面积与频数反求">
            <div className="data-controls-row">
              <NumberField
                label="图上柱高"
                value={areaHeight}
                min={0}
                onChange={setAreaHeight}
              />
              <NumberField
                label="图上柱宽"
                value={areaWidth}
                min={0}
                onChange={setAreaWidth}
              />
              <NumberField
                label="每单位图面积代表的频数"
                value={areaScale}
                min={0}
                onChange={setAreaScale}
              />
            </div>
            <HiddenResults hidden={resultsHidden}>
              <Result
                label="该组频数"
                value={fmt(areaHeight * areaWidth * areaScale)}
                note="频数 = 柱高 × 柱宽 × 面积比例尺；所得值须符合整数频数。"
              />
            </HiddenResults>
          </Panel>
          <Panel title="继续使用这份数据">
            <div className="stats-toolbar">
              <button
                className="stats-button"
                disabled={!d.values}
                onClick={() => {
                  if (d.values) {
                    share({
                      sample: d.values,
                      label: s.name + (s.unit ? ` (${s.unit})` : ""),
                      ...(secondValues
                        ? {
                            secondSample: secondValues,
                            design: "independent" as const,
                          }
                        : {}),
                    });
                    navigate("intervals");
                  }
                }}
              >
                将原始样本送往置信区间
              </button>
              <button
                className="stats-button"
                disabled={!d.table || !!d.groups || d.table.length > 2000}
                onClick={() => {
                  if (d.table && !d.groups) {
                    share({
                      distribution: {
                        kind: "finite",
                        values: d.table.map((x) => x.x),
                        probabilities: d.table.map((x) => x.f / d.moments.n),
                      },
                      label: s.name,
                    });
                    navigate("sampling");
                  }
                }}
              >
                将经验频数模型送往抽样
              </button>
            </div>
            <p className="data-tiny">
              原始样本可直接推断；离散频数模型可用于抽样探究。分组数据和汇总量不会被伪装成原始样本。
            </p>
          </Panel>
        </>
      )}
      {s.second.trim() && second.error && (
        <Notice tone="warning">比较组：{second.error}</Notice>
      )}
    </div>
  );
}
