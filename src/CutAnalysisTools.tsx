import { useEffect, useMemo, useState } from "react";
import { StaticMath } from "./MathInput";
import {
  formatNumber,
  integrateCurve,
  nearestOnCurve,
  type AnalysisCurve,
  type CurveMesh,
  type XY,
} from "./analysis";
import {
  cutIntervals,
  lineIntegral,
  regionArea,
  type CutInterval,
} from "./cutAnalysis";
import { compileExpression } from "./math";
import { curveColor, type Theme } from "./theme";

type Selection = CutInterval & { curveKey: string };
type Props = {
  curves: AnalysisCurve[];
  meshes: CurveMesh[];
  mode: "segment" | "region" | null;
  scale: number;
  theme: Theme;
  modelKey: string;
};
export function useCutAnalysis({
  curves,
  meshes,
  mode,
  scale,
  theme,
  modelKey,
}: Props) {
  const [target, setTarget] = useState("");
  const explicit = curves.filter((c) => c.kind === "explicit");
  const first = explicit.find((c) => c.key === target) ?? explicit[0];
  const [other, setOther] = useState("");
  const second =
    explicit.find((c) => c.key === other && c.key !== first?.key) ??
    explicit.find((c) => c.key !== first?.key);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [density, setDensity] = useState("1");
  const [error, setError] = useState("");
  const intervals = useMemo(
    () => (mode && first && second ? cutIntervals(first, second) : []),
    [mode, first, second],
  );
  useEffect(() => {
    setSelection(null);
    setError("");
  }, [modelKey, first?.key, second?.key]);
  const selectedCurve = curves.find((c) => c.key === selection?.curveKey);
  const result = useMemo(() => {
    if (!mode || !selection || !first || !second || !selectedCurve) return null;
    try {
      const { a, b } = selection;
      if (mode === "region") return { area: regionArea(first, second, a, b) };
      const compiled = compileExpression(density);
      if (
        compiled.params.some(
          (p) => p !== "y" && !(p in (selectedCurve.parameters ?? {})),
        )
      )
        throw new Error("密度仅支持 x、y 和已有参数");
      return {
        integral: integrateCurve(selectedCurve, a, b),
        length: lineIntegral(selectedCurve, a, b),
        weighted: lineIntegral(selectedCurve, a, b, (x, y) =>
          compiled.evaluate(x, { ...selectedCurve.parameters, y }),
        ),
      };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [mode, selection, first, second, selectedCurve, density]);
  const choose = (interval: CutInterval, curveKey: string) => {
    setSelection({ ...interval, curveKey });
    setError("");
  };
  const pick = (p: XY) => {
    if (!mode) return false;
    if (!first || !second) {
      setError("请先添加两条可见的显函数 y=f(x)");
      return true;
    }
    if (mode === "region") {
      const interval = intervals.find(
        ({ a, b }) =>
          p[0] > a &&
          p[0] < b &&
          p[1] >= Math.min(first.at(p[0])[1], second.at(p[0])[1]) &&
          p[1] <= Math.max(first.at(p[0])[1], second.at(p[0])[1]),
      );
      if (interval) choose(interval, first.key);
      else setError("请点击所选两条曲线之间的封闭区域；让左右交点都进入视窗");
    } else {
      const near = meshes
        .filter((m) => m.curve.key === first.key || m.curve.key === second.key)
        .map((m) => ({ c: m.curve, h: nearestOnCurve(m, p) }))
        .filter(
          (v) =>
            v.h && Math.hypot(v.h.xy[0] - p[0], v.h.xy[1] - p[1]) * scale < 16,
        )
        .sort(
          (a, b) =>
            Math.hypot(a.h!.xy[0] - p[0], a.h!.xy[1] - p[1]) -
            Math.hypot(b.h!.xy[0] - p[0], b.h!.xy[1] - p[1]),
        )[0];
      const interval =
        near && intervals.find((v) => near.h!.u! >= v.a && near.h!.u! <= v.b);
      if (near && interval) choose(interval, near.c.key);
      else setError("请点击两个相邻交点之间的曲线段；也可用下面的按钮选择");
    }
    return true;
  };
  const paint = (ctx: CanvasRenderingContext2D, pixel: (p: XY) => XY) => {
    if (!mode || !selection || !first || !second || !selectedCurve) return;
    const { a, b } = selection;
    const path = (c: AnalysisCurve) =>
      Array.from({ length: 401 }, (_, i) => c.at(a + ((b - a) * i) / 400));
    const points =
      mode === "region"
        ? [...path(first), ...path(second).reverse()]
        : path(selectedCurve);
    if (!points.every((p) => p.every(Number.isFinite))) return;
    ctx.save();
    ctx.strokeStyle = curveColor(selectedCurve.color, theme);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 4;
    ctx.beginPath();
    points
      .map(pixel)
      .forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (mode === "region") {
      ctx.closePath();
      ctx.globalAlpha = 0.2;
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 2;
    }
    ctx.stroke();
    for (const x of [a, b]) {
      const p = pixel(selectedCurve.at(x));
      ctx.beginPath();
      ctx.arc(...p, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };
  const bounds = selection
    ? `${formatNumber(selection.a)}}^{${formatNumber(selection.b)}`
    : "";
  const panel = mode && (
    <div className="analysis-result cut-analysis">
      <label className="analysis-field">
        边界曲线
        <select
          aria-label="第一条边界曲线"
          value={first?.key ?? ""}
          onChange={(e) => setTarget(e.target.value)}
        >
          {explicit.map((c) => (
            <option key={c.key} value={c.key}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="analysis-field">
        另一条曲线
        <select
          aria-label="另一条边界曲线"
          value={second?.key ?? ""}
          onChange={(e) => setOther(e.target.value)}
        >
          {explicit
            .filter((c) => c.key !== first?.key)
            .map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
        </select>
      </label>
      <p className="analysis-hint">
        {mode === "segment"
          ? "点击相邻交点之间的曲线段，或从下方选择。"
          : "点击两条曲线之间的封闭区域，或从下方选择。"}{" "}
        当前边界：{first?.name ?? "未选择"} 与 {second?.name ?? "未选择"}。
      </p>
      <p className="analysis-hint">
        目前支持两条显函数。仅在当前视窗内数值搜索交点；请让两个端点都可见。极窄或高频分段可能漏检。
      </p>
      {!intervals.length && (
        <p className="analysis-hint">
          未找到可选的封闭分段。可试用 y=x² 与 y=1，并显示 x=−1、1 两个交点。
        </p>
      )}
      <div className="cut-options" aria-label="可选分段">
        {intervals.map((v, i) => (
          <div key={`${v.a}:${v.b}`}>
            <span>
              {i + 1} · x≈{formatNumber(v.a)} 至 {formatNumber(v.b)}
            </span>
            {(mode === "region" ? [first!] : [first!, second!]).map((c) => (
              <button
                key={c.key}
                aria-pressed={
                  !!selection &&
                  Math.abs(selection.a - v.a) < 1e-7 &&
                  Math.abs(selection.b - v.b) < 1e-7 &&
                  (mode === "region" || selection.curveKey === c.key)
                }
                onClick={() => choose(v, c.key)}
              >
                {mode === "region" ? `取区域 ${i + 1}` : c.name + " 曲线段"}
              </button>
            ))}
          </div>
        ))}
      </div>
      {selection && (
        <>
          <p>
            {mode === "region" ? "区域边界" : selectedCurve?.name} · x≈
            {formatNumber(selection.a)} 至 {formatNumber(selection.b)}
          </p>
          <p className="analysis-hint">
            端点约为 ({formatNumber(first!.at(selection.a)[0])},{" "}
            {formatNumber(first!.at(selection.a)[1])}) 与 (
            {formatNumber(first!.at(selection.b)[0])},{" "}
            {formatNumber(first!.at(selection.b)[1])})
          </p>
          {mode === "segment" && (
            <label>
              密度 h(x,y)
              <input
                aria-label="曲线积分密度"
                value={density}
                placeholder="如 1 或 x^2+y^2"
                onChange={(e) => setDensity(e.target.value)}
              />
            </label>
          )}
          {result && !result.error && (
            <>
              {mode === "region" ? (
                <>
                  <p>区域面积（始终非负）</p>
                  <StaticMath
                    value={`A=\\int_{${bounds}}|f(x)-g(x)|\\,dx\\approx ${formatNumber(result.area!)}`}
                  />
                  <small>
                    f：{first?.name}；g：{second?.name}
                  </small>
                </>
              ) : (
                <>
                  <p>定积分（相对 x 轴，有正负）</p>
                  <StaticMath
                    value={`\\int_{${bounds}}f(x)\\,dx\\approx ${formatNumber(result.integral!)}`}
                  />
                  <p>弧长</p>
                  <StaticMath
                    value={`L=\\int_C 1\\,ds\\approx ${formatNumber(result.length!)}`}
                  />
                  <p>第一类曲线积分</p>
                  <StaticMath
                    value={`\\int_C h(x,y)\\,ds\\approx ${formatNumber(result.weighted!)}`}
                  />
                  <small>ds=√(1+f′(x)²) dx；h=1 时等于弧长。</small>
                </>
              )}
              <small>数值近似；区域和曲线段端点来自数值交点。</small>
            </>
          )}
          <button
            className="analysis-clear"
            onClick={() => {
              setSelection(null);
              setError("");
            }}
          >
            清除{mode === "region" ? "区域" : "曲线段"}选择
          </button>
        </>
      )}
      {(error || result?.error) && (
        <p className="analysis-error" role="status">
          {error || result?.error}
        </p>
      )}
    </div>
  );
  return { pick, paint, panel };
}
