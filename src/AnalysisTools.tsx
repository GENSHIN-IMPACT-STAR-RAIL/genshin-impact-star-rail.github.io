import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Crosshair, Trash2 } from "lucide-react";
import { createPortal } from "react-dom";
import { StaticMath } from "./MathInput";
import {
  analysisCurves,
  curveMesh,
  snapPoint,
  nearestOnCurve,
  tangent,
  integrateCurve,
  formatNumber,
  type AnalysisEntry,
  type Pick,
  type XY,
  type Hit,
} from "./analysis";
import type { Parameters } from "./math";
import type { View } from "./plot";
import type { ParameterRange } from "./cartesian";
import { curveColor, plotThemes, type Theme } from "./theme";
import "./analysis.css";
import { useCutAnalysis } from "./CutAnalysisTools";
import {
  exactInput,
  enrichExact,
  exactAt,
  exactTangent,
  exactIntegral,
  exactRadius,
} from "./exact";

export type AnalysisHandle = {
  hover: (x: number, y: number) => void;
  pick: (x: number, y: number) => void;
  leave: () => void;
  exportTo: (ctx: CanvasRenderingContext2D) => void;
};
type PointRecord = Pick & { id: number; name: string };
type Props = {
  entries: AnalysisEntry[];
  params: Parameters;
  polar: boolean;
  angular: ParameterRange | null;
  showNegative: boolean;
  view: View;
  size: { w: number; h: number };
  theme: Theme;
  open: boolean;
  panelHost: HTMLElement | null;
  onToggle: () => void;
};

export const AnalysisTools = forwardRef<AnalysisHandle, Props>(
  function AnalysisTools(props, ref) {
    const {
      entries,
      params,
      polar,
      angular,
      showNegative,
      view,
      size,
      theme,
      open,
      panelHost,
      onToggle,
    } = props;
    const [points, setPoints] = useState<PointRecord[]>([]);
    const [hover, setHover] = useState<Pick | null>(null);
    const [selectedId, setSelectedId] = useState(0);
    const [target, setTarget] = useState("");
    const [action, setAction] = useState<"pick" | "segment" | "region">("pick");
    const [xInput, setXInput] = useState("");
    const [yInput, setYInput] = useState("");
    const [uInput, setUInput] = useState("");
    const [error, setError] = useState("");
    const [tangentKeys, setTangentKeys] = useState<string[]>([]);
    const [segmentSource, setSegmentSource] = useState<
      "intersections" | "points"
    >("intersections");
    const [candidates, setCandidates] = useState<Pick[]>([]);
    const [showIntegral, setShowIntegral] = useState(false);
    const [lowerId, setLowerId] = useState("");
    const [upperId, setUpperId] = useState("");
    const nextId = useRef(1);
    const lastHover = useRef(0);
    const layer = useRef<HTMLCanvasElement>(null);
    const curves = useMemo(
      () =>
        analysisCurves(
          entries,
          params,
          polar,
          angular,
          showNegative,
          view,
          size.w,
        ),
      [entries, params, polar, angular, showNegative, view, size.w],
    );
    const meshes = useMemo(
      () => (open ? curves.map((c) => curveMesh(c, view, size.w, size.h)) : []),
      [curves, view, size, open],
    );
    const cuts = useCutAnalysis({
      curves,
      meshes,
      scale: view.scale,
      theme,
      mode:
        open &&
        (action === "region" ||
          (action === "segment" && segmentSource === "intersections"))
          ? action
          : null,
      modelKey: JSON.stringify([
        entries.map((e) => [
          e.id,
          e.value,
          e.left,
          e.visible,
          e.parameterInterval,
        ]),
        params,
        polar,
        angular,
        showNegative,
      ]),
    });
    const selected = points.find((p) => p.id === selectedId) ?? points.at(-1);
    const curve =
      (action === "segment" && segmentSource === "points"
        ? curves.find((c) => c.key === target)
        : undefined) ??
      curves.find((c) => selected?.hits.some((h) => h.key === c.key)) ??
      curves[0];
    const hit = selected?.hits.find((h) => h.key === curve?.key);
    const radiusExact = useMemo(
      () => (curve ? exactRadius(curve, hit?.exactU) : null),
      [curve, hit],
    );
    const pointText = (p: Pick, i: 0 | 1) =>
      p.exactXY?.[i]?.text ?? `≈${formatNumber(p.xy[i])}`;
    const pointLatex = (p: Pick, i: 0 | 1) =>
      p.exactXY?.[i]?.latex ?? `\\approx ${formatNumber(p.xy[i])}`;
    const tangentResults = useMemo(
      () =>
        (selected?.hits ?? []).flatMap((h) => {
          const c = curves.find((c) => c.key === h.key);
          if (!c) return [];
          const result = tangent(c, h);
          const latex = result ? exactTangent(c, h, selected?.exactXY) : null;
          return {
            curve: c,
            result: result
              ? { ...result, latex: latex ?? result.latex, exact: !!latex }
              : null,
          };
        }),
      [curves, selected],
    );
    useEffect(() => {
      setTangentKeys([]);
    }, [selected?.id]);
    useEffect(() => {
      setCandidates([]);
    }, [xInput, yInput, uInput]);
    const boundPoints = points.filter((p) =>
      p.hits.some((h) => h.key === curve?.key && h.u !== undefined),
    );
    const lower =
      boundPoints.find((p) => String(p.id) === lowerId) ?? boundPoints[0];
    const upper =
      boundPoints.find((p) => String(p.id) === upperId) ??
      boundPoints.find((p) => p.id !== lower?.id);
    const lowerU = lower?.hits.find((h) => h.key === curve?.key)?.u;
    const upperU = upper?.hits.find((h) => h.key === curve?.key)?.u;
    const lowerExact = lower?.hits.find((h) => h.key === curve?.key)?.exactU;
    const upperExact = upper?.hits.find((h) => h.key === curve?.key)?.exactU;
    const integral = useMemo(() => {
      if (
        action !== "segment" ||
        segmentSource !== "points" ||
        !curve ||
        lowerU === undefined ||
        upperU === undefined
      )
        return null;
      try {
        const value = integrateCurve(curve, lowerU, upperU);
        return {
          value,
          exact: exactIntegral(curve, lowerExact, upperExact, value),
          error: "",
        };
      } catch (e) {
        return { value: NaN, exact: null, error: (e as Error).message };
      }
    }, [curve, lowerU, upperU, lowerExact, upperExact, action, segmentSource]);
    const world = (x: number, y: number): XY => [
      view.x + (x - size.w / 2) / view.scale,
      view.y - (y - size.h / 2) / view.scale,
    ];
    const pixel = (p: XY): XY => [
      size.w / 2 + (p[0] - view.x) * view.scale,
      size.h / 2 - (p[1] - view.y) * view.scale,
    ];
    // A change to the mathematical model invalidates captured coordinates, not a pan or zoom.
    useEffect(() => {
      setPoints([]);
      setCandidates([]);
      setHover(null);
      setTangentKeys([]);
      setShowIntegral(false);
      setLowerId("");
      setUpperId("");
      setTarget("");
      setError(points.length ? "曲线或参数已更新，已清空旧取点。" : "");
    }, [entries, params, polar, angular?.start, angular?.end, showNegative]);
    useEffect(() => {
      if (!open) setHover(null);
    }, [open]);
    const selectPoint = (id: number) => {
      setSelectedId(id);
      if (action === "segment" && segmentSource === "points") {
        if (!lower) setLowerId(String(id));
        else if (lower.id !== id) setUpperId(String(id));
        if (curve) setTarget(curve.key);
      }
    };
    const add = (candidate: Pick) => {
      const p = enrichExact(candidate, curves);
      setCandidates([]);
      if (points.length >= 12) {
        setError("最多保留 12 个点，请先删除不需要的点");
        return;
      }
      const duplicate = points.find(
        (q) =>
          Math.hypot(q.xy[0] - p.xy[0], q.xy[1] - p.xy[1]) < 1e-8 &&
          q.hits.length === p.hits.length &&
          q.hits.every((h) =>
            p.hits.some(
              (k) =>
                k.key === h.key && Math.abs((k.u ?? 0) - (h.u ?? 0)) < 1e-8,
            ),
          ),
      );
      if (duplicate) {
        if (
          p.kind !== "曲线上的点" ||
          p.exactXY ||
          p.hits.some((h) => h.exactU)
        )
          setPoints((ps) =>
            ps.map((q) => (q.id === duplicate.id ? { ...q, ...p } : q)),
          );
        selectPoint(duplicate.id);
        setError("");
        return;
      }
      const id = nextId.current++;
      setPoints((ps) => [...ps, { ...p, id, name: `P_{${id}}` }]);
      selectPoint(id);
      setError("");
    };
    useImperativeHandle(ref, () => ({
      hover: (x, y) => {
        if (
          action === "region" ||
          (action === "segment" && segmentSource === "intersections")
        )
          return;
        if (open && performance.now() - lastHover.current > 30) {
          lastHover.current = performance.now();
          const p = snapPoint(
            meshes,
            world(x, y),
            view.scale,
            action === "segment" && segmentSource === "points"
              ? curve?.key
              : undefined,
          );
          setHover(p && p.kind !== "曲线上的点" ? enrichExact(p, curves) : p);
        }
      },
      pick: (x, y) => {
        if (!open) return;
        if (cuts.pick(world(x, y))) return;
        const p = snapPoint(
          meshes,
          world(x, y),
          view.scale,
          action === "segment" && segmentSource === "points"
            ? curve?.key
            : undefined,
        );
        if (p) add(p);
        else setError("请靠近曲线取点，或直接输入坐标");
      },
      leave: () => setHover(null),
      exportTo: (ctx) => {
        if (layer.current)
          ctx.drawImage(
            layer.current,
            0,
            0,
            ctx.canvas.width,
            ctx.canvas.height,
          );
      },
    }));
    const manual = (parameter = false) => {
      try {
        if (parameter || !yInput.trim()) {
          const exactU = exactInput(parameter ? uInput : xInput),
            u = exactU.value;
          const matches: Pick[] = [];
          for (const c of curves) {
            if (
              parameter
                ? c.kind !== "parametric" && c.kind !== "polar"
                : c.kind !== "explicit"
            )
              continue;
            if (parameter && (u < c.range.start || u > c.range.end)) continue;
            const xy = c.at(u);
            if (!xy.every(Number.isFinite)) continue;
            const h = { key: c.key, xy, u, exactU };
            const same = matches.find(
              (p) => Math.hypot(p.xy[0] - xy[0], p.xy[1] - xy[1]) < 1e-9,
            );
            if (same) {
              same.hits.push(h);
              same.kind = "交点";
            } else
              matches.push({
                xy,
                exactXY: exactAt(c, exactU) ?? undefined,
                hits: [h],
                kind: "曲线上的点",
              });
          }
          if (!matches.length)
            throw new Error(
              parameter
                ? "此参数范围内没有已定义的曲线点"
                : "没有可用的显函数点，请填写完整坐标",
            );
          if (matches.length === 1) add(matches[0]);
          else {
            setCandidates(matches.map((p) => enrichExact(p, curves)));
            setError("");
          }
        } else {
          const exactXY = [exactInput(xInput), exactInput(yInput)] as const;
          const xy: XY = [exactXY[0].value, exactXY[1].value],
            hits: Hit[] = [];
          for (const mesh of meshes) {
            const c = mesh.curve;
            let h: Hit | null = null;
            if (c.kind === "explicit")
              h = { key: c.key, xy: c.at(xy[0]), u: xy[0], exactU: exactXY[0] };
            else if (c.field && Math.abs(c.field(...xy)) < 1e-9)
              h = { key: c.key, xy };
            else h = nearestOnCurve(mesh, xy);
            if (
              h &&
              Math.hypot(h.xy[0] - xy[0], h.xy[1] - xy[1]) <
                1e-7 * Math.max(1, Math.hypot(...xy))
            )
              hits.push(h);
          }
          add({
            xy,
            exactXY: [...exactXY],
            hits,
            kind:
              hits.length > 1 ? "交点" : hits.length ? "曲线上的点" : "自由点",
          });
        }
      } catch (e) {
        setError((e as Error).message);
      }
    };

    useEffect(() => {
      const canvas = layer.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(size.w * dpr);
      canvas.height = Math.round(size.h * dpr);
      const ctx = canvas.getContext("2d")!;
      ctx.scale(dpr, dpr);
      const paint = plotThemes[theme],
        color = curveColor(curve?.color ?? "#4d657a", theme);
      if (
        open &&
        action === "segment" &&
        segmentSource === "points" &&
        showIntegral &&
        integral &&
        !integral.error &&
        curve &&
        lowerU !== undefined &&
        upperU !== undefined
      ) {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.18;
        const path = Array.from({ length: 801 }, (_, i) =>
          curve.at(lowerU + ((upperU - lowerU) * i) / 800),
        );
        const poly: XY[] =
          curve.kind === "polar"
            ? [[0, 0], ...path]
            : [[path[0][0], 0], ...path, [path.at(-1)![0], 0]];
        ctx.beginPath();
        poly
          .map(pixel)
          .forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        for (const u of [lowerU, upperU]) {
          const p = curve.at(u),
            from = pixel(curve.kind === "polar" ? [0, 0] : [p[0], 0]),
            to = pixel(p);
          ctx.beginPath();
          ctx.moveTo(...from);
          ctx.lineTo(...to);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      if (
        open &&
        action === "segment" &&
        segmentSource === "points" &&
        curve &&
        integral &&
        !integral.error &&
        lowerU !== undefined &&
        upperU !== undefined
      ) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        for (let i = 0; i <= 600; i++) {
          const [x, y] = pixel(
            curve.at(lowerU + ((upperU - lowerU) * i) / 600),
          );
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      cuts.paint(ctx, pixel);
      if (open && action === "pick" && selected)
        for (const { curve: c, result } of tangentResults) {
          if (!result || !tangentKeys.includes(c.key)) continue;
          const p = pixel(selected.xy),
            d = result.direction,
            length = Math.hypot(size.w, size.h) * 2;
          ctx.strokeStyle = curveColor(c.color, theme);
          ctx.lineWidth = 1.6;
          ctx.setLineDash([7, 5]);
          ctx.beginPath();
          ctx.moveTo(p[0] - d[0] * length, p[1] + d[1] * length);
          ctx.lineTo(p[0] + d[0] * length, p[1] - d[1] * length);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      const draw = (p: Pick, text: string, active: boolean) => {
        const [x, y] = pixel(p.xy);
        if (x < -10 || y < -10 || x > size.w + 10 || y > size.h + 10) return;
        const c = curves.find((c) => c.key === p.hits[0]?.key);
        ctx.fillStyle = curveColor(c?.color ?? "#4d657a", theme);
        ctx.strokeStyle = paint.background;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, active ? 5.5 : 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.font = '12px "Segoe UI", sans-serif';
        const width = ctx.measureText(text).width + 10;
        const lx = Math.max(4, Math.min(size.w - width - 4, x + 10)),
          ly = Math.max(18, Math.min(size.h - 8, y - 9));
        ctx.fillStyle = paint.labelBackground;
        ctx.fillRect(lx - 3, ly - 13, width, 18);
        ctx.fillStyle = paint.axisText;
        ctx.fillText(text, lx + 2, ly);
      };
      points.forEach((p) =>
        draw(
          p,
          `P${p.id}${p.id === selected?.id ? ` (${pointText(p, 0)}, ${pointText(p, 1)})` : ""}`,
          p.id === selected?.id,
        ),
      );
      if (hover && open)
        draw(
          hover,
          `${hover.kind} (${pointText(hover, 0)}, ${pointText(hover, 1)})`,
          true,
        );
    }, [
      size,
      view,
      theme,
      curves,
      points,
      selected,
      hover,
      open,
      tangentKeys,
      tangentResults,
      action,
      segmentSource,
      showIntegral,
      integral,
      lowerU,
      upperU,
      curve,
      cuts,
    ]);

    const coordinateText = (p: PointRecord) =>
      `${p.name}\\left(${pointLatex(p, 0)},\\;${pointLatex(p, 1)}\\right)`;
    const boundVariable =
      curve?.kind === "polar"
        ? "\\theta"
        : curve?.kind === "parametric"
          ? "t"
          : "x";
    const integrand =
      curve?.kind === "polar"
        ? "\\frac12 r(\\theta)^2"
        : curve?.kind === "parametric"
          ? `\\left(${curve.value}\\right)\\frac{d}{dt}\\left(${curve.left}\\right)`
          : `\\left(${curve?.value ?? "f(x)"}\\right)`;
    return (
      <>
        <canvas className="analysis-overlay" ref={layer} aria-hidden="true" />
        {panelHost &&
          createPortal(
            <section className="analysis-panel" aria-label="图像分析">
              <header>
                <label className="analysis-toggle">
                  <Crosshair size={15} aria-hidden="true" />
                  <strong>图像分析</strong>
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label="启用图像分析"
                    checked={open}
                    onChange={onToggle}
                  />
                </label>
              </header>
              {open && (
                <>
                  <div
                    className="analysis-tabs"
                    role="group"
                    aria-label="图像分析操作"
                  >
                    <button
                      aria-pressed={action === "pick"}
                      onClick={() => {
                        setAction("pick");
                        setHover(null);
                        setError("");
                      }}
                    >
                      取点
                    </button>
                    {(["segment", "region"] as const).map((mode) => (
                      <button
                        key={mode}
                        aria-pressed={action === mode}
                        onClick={() => {
                          setAction(mode);
                          setShowIntegral(false);
                          setTangentKeys([]);
                          setHover(null);
                          setError("");
                        }}
                      >
                        {mode === "segment" ? "取曲线段" : "取区域"}
                      </button>
                    ))}
                  </div>
                  <div className="analysis-content">
                    {action === "segment" && (
                      <label className="analysis-field">
                        截取方式
                        <select
                          aria-label="曲线段截取方式"
                          value={segmentSource}
                          onChange={(e) => {
                            setSegmentSource(
                              e.target.value as "intersections" | "points",
                            );
                            setHover(null);
                            setError("");
                          }}
                        >
                          <option value="intersections">按交点截取</option>
                          <option value="points">用两点截取</option>
                        </select>
                      </label>
                    )}
                    {cuts.panel}
                    {action === "pick" && (
                      <>
                        <p className="analysis-hint">
                          点击曲线自动识别并取点，优先吸附交点、驻点和轴交点。取点后可查看坐标与切线。
                        </p>
                        <form
                          className="analysis-coordinates"
                          onSubmit={(e) => {
                            e.preventDefault();
                            manual();
                          }}
                        >
                          <label>
                            x
                            <input
                              aria-label="取点 x 坐标"
                              value={xInput}
                              placeholder="如 1/2"
                              onChange={(e) => setXInput(e.target.value)}
                            />
                          </label>
                          <label>
                            y
                            <input
                              aria-label="取点 y 坐标"
                              value={yInput}
                              placeholder={
                                curves.some((c) => c.kind === "explicit")
                                  ? "可留空"
                                  : "坐标"
                              }
                              onChange={(e) => setYInput(e.target.value)}
                            />
                          </label>
                          <button type="submit">取点</button>
                        </form>
                        {curves.some((c) => c.kind === "explicit") && (
                          <p className="analysis-hint">
                            y
                            留空时自动寻找各曲线上的点；若有多个位置，再选择要保留的点。
                          </p>
                        )}
                        {curves.some(
                          (c) => c.kind === "parametric" || c.kind === "polar",
                        ) && (
                          <form
                            className="analysis-parameter"
                            onSubmit={(e) => {
                              e.preventDefault();
                              manual(true);
                            }}
                          >
                            <label>
                              {polar ? "θ（弧度）" : "t"}
                              <input
                                aria-label="取点参数"
                                placeholder="如 pi/4"
                                value={uInput}
                                onChange={(e) => setUInput(e.target.value)}
                              />
                            </label>
                            <button type="submit">按参数取点</button>
                          </form>
                        )}
                      </>
                    )}
                    {action === "pick" && !!candidates.length && (
                      <div className="analysis-candidates" aria-label="候选点">
                        <p className="analysis-hint">
                          找到多个位置，选择一个点：
                        </p>
                        {candidates.map((p, i) => (
                          <button key={i} onClick={() => add(p)}>
                            <StaticMath
                              value={`(${pointLatex(p, 0)},\\;${pointLatex(p, 1)})`}
                            />
                            <small>
                              {p.hits
                                .map(
                                  (h) =>
                                    curves.find((c) => c.key === h.key)?.name,
                                )
                                .join("、")}
                            </small>
                          </button>
                        ))}
                      </div>
                    )}
                    {action === "pick" && !!points.length && (
                      <div className="analysis-points" aria-label="已取点">
                        {points.map((p) => (
                          <div key={p.id}>
                            <button
                              className="analysis-point"
                              aria-label={`选择点 P${p.id}`}
                              aria-pressed={selected?.id === p.id}
                              onClick={() => {
                                setSelectedId(p.id);
                                if (
                                  target &&
                                  !p.hits.some((h) => h.key === target)
                                )
                                  setTarget("");
                              }}
                            >
                              <StaticMath value={coordinateText(p)} />
                              <small>{p.kind}</small>
                            </button>
                            <button
                              aria-label={`删除点 P${p.id}`}
                              title="删除点"
                              onClick={() =>
                                setPoints((ps) =>
                                  ps.filter((q) => q.id !== p.id),
                                )
                              }
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {action === "pick" &&
                      selected &&
                      hit?.u !== undefined &&
                      (curve?.kind === "polar" ||
                        curve?.kind === "parametric") && (
                        <p className="analysis-hint">
                          P{selected.id} · {curve.name} ·{" "}
                          {curve.kind === "polar"
                            ? `θ ${hit.exactU ? "= " + hit.exactU.text : "≈ " + formatNumber(hit.u)} rad，r ${radiusExact ? "= " + radiusExact.text : "≈ " + formatNumber(curve.radius!(hit.u))}`
                            : `t ${hit.exactU ? "= " + hit.exactU.text : "≈ " + formatNumber(hit.u)}`}
                        </p>
                      )}
                    {action === "pick" && selected && (
                      <section
                        className="analysis-result point-analysis"
                        aria-label="所选点分析"
                      >
                        <strong>P{selected.id} · 点分析</strong>
                        {!tangentResults.length && (
                          <p className="analysis-hint">
                            此点为自由点，不在当前曲线上。
                          </p>
                        )}
                        {tangentResults.map(({ curve: c, result }) => (
                          <div className="point-tangent" key={c.key}>
                            <p>{c.name} · 此点处的切线</p>
                            {result ? (
                              <>
                                <StaticMath
                                  value={
                                    result.exact
                                      ? result.latex
                                      : result.latex.replace("=", "\\approx ")
                                  }
                                />
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={tangentKeys.includes(c.key)}
                                    onChange={(e) =>
                                      setTangentKeys((keys) =>
                                        e.target.checked
                                          ? [...keys, c.key]
                                          : keys.filter((k) => k !== c.key),
                                      )
                                    }
                                  />
                                  显示{c.name}的切线
                                </label>
                                <small>
                                  {result.exact ? "精确值" : "数值近似"}
                                </small>
                              </>
                            ) : (
                              <p className="analysis-hint">
                                此处没有唯一的切线，可能是尖点或奇点。
                              </p>
                            )}
                          </div>
                        ))}
                        {selected.hits.some((h) => h.u !== undefined) && (
                          <button
                            className="analysis-next"
                            onClick={() => {
                              setTarget(
                                selected.hits.find((h) => h.u !== undefined)!
                                  .key,
                              );
                              setLowerId(String(selected.id));
                              setUpperId("");
                              setSegmentSource("points");
                              setAction("segment");
                              setHover(null);
                              setError("");
                            }}
                          >
                            以此点为起点截取曲线段
                          </button>
                        )}
                      </section>
                    )}
                    {action === "segment" && segmentSource === "points" && (
                      <div className="analysis-result">
                        <p className="analysis-hint">
                          在画布上点取同一曲线的两个点，或使用已有点。选定端点后显示定积分。
                        </p>
                        <label className="analysis-field">
                          截取曲线
                          <select
                            aria-label="两点截取曲线"
                            value={curve?.key ?? ""}
                            onChange={(e) => {
                              setTarget(e.target.value);
                              setLowerId("");
                              setUpperId("");
                              setError("");
                            }}
                          >
                            {curves
                              .filter((c) => c.kind !== "implicit")
                              .map((c) => (
                                <option key={c.key} value={c.key}>
                                  {c.name}
                                </option>
                              ))}
                          </select>
                        </label>
                        {curve?.kind === "implicit" ? (
                          <p className="analysis-hint">
                            隐函数需先改写为显函数或参数方程，再选取积分区间。
                          </p>
                        ) : (
                          <>
                            <div className="analysis-bounds">
                              <label>
                                起点（下限）
                                <select
                                  aria-label="积分下限点"
                                  value={lower?.id ?? ""}
                                  onChange={(e) => setLowerId(e.target.value)}
                                >
                                  <option value="" disabled>
                                    选择点
                                  </option>
                                  {boundPoints.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      P{p.id} ·{" "}
                                      {p.hits.find((h) => h.key === curve?.key)
                                        ?.exactU?.text ??
                                        `≈${formatNumber(p.hits.find((h) => h.key === curve?.key)!.u!)}`}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                终点（上限）
                                <select
                                  aria-label="积分上限点"
                                  value={upper?.id ?? ""}
                                  onChange={(e) => setUpperId(e.target.value)}
                                >
                                  <option value="" disabled>
                                    选择点
                                  </option>
                                  {boundPoints.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      P{p.id} ·{" "}
                                      {p.hits.find((h) => h.key === curve?.key)
                                        ?.exactU?.text ??
                                        `≈${formatNumber(p.hits.find((h) => h.key === curve?.key)!.u!)}`}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                            <label>
                              <input
                                type="checkbox"
                                checked={showIntegral}
                                onChange={(e) =>
                                  setShowIntegral(e.target.checked)
                                }
                              />{" "}
                              显示积分阴影
                            </label>
                            {boundPoints.length < 2 && (
                              <p className="analysis-hint">
                                在同一曲线上取两个点，作为积分上下限。
                              </p>
                            )}
                            {integral?.error && (
                              <p className="analysis-error" role="status">
                                {integral.error}
                              </p>
                            )}
                            {integral &&
                              !integral.error &&
                              lowerU !== undefined &&
                              upperU !== undefined && (
                                <>
                                  <p>
                                    {curve?.kind === "polar"
                                      ? "极坐标扫过面积 · θ 用弧度"
                                      : curve?.kind === "parametric"
                                        ? "沿参数方向的有向积分 ∫y dx"
                                        : "相对 x 轴的有向积分"}
                                  </p>
                                  <StaticMath
                                    value={`\\int_{${lowerExact?.latex ?? formatNumber(lowerU)}}^{${upperExact?.latex ?? formatNumber(upperU)}} ${integrand}\\,d${boundVariable}${integral.exact ? "=" + integral.exact.latex : "\\approx " + formatNumber(integral.value)}`}
                                  />
                                  <small>
                                    {integral.exact ? "精确值" : "数值近似"}
                                  </small>
                                  {curve?.kind === "polar" && (
                                    <small>
                                      按所选 r
                                      分支积分；重复扫过的区域重复计入。
                                    </small>
                                  )}
                                </>
                              )}
                          </>
                        )}
                      </div>
                    )}
                    {error && (
                      <p className="analysis-error" role="status">
                        {error}
                      </p>
                    )}
                    {!points.length && action === "pick" && (
                      <p className="analysis-hint">
                        已取点会列在这里。选中一个点查看分析，或用它作为曲线段端点。
                      </p>
                    )}
                    {action === "pick" && !!points.length && (
                      <button
                        className="analysis-clear"
                        onClick={() => {
                          setPoints([]);
                          setError("");
                        }}
                      >
                        清空取点
                      </button>
                    )}
                  </div>
                </>
              )}
            </section>,
            panelHost,
          )}
      </>
    );
  },
);
