import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Minus,
  RotateCcw,
  Eye,
  EyeOff,
  Trash2,
  SlidersHorizontal,
  X,
  Download,
  Check,
  ArrowUpRight,
  Grid2X2,
  FunctionSquare,
  CircleHelp,
  Moon,
  Sun,
} from "lucide-react";
import { curveSegments, DEFAULT_VIEW, type View } from "./plot";
import type { Parameters } from "./math";
import { MathInput, StaticMath, KeyboardManager } from "./MathInput";
import { angleRange, polarSegments, drawPolarGrid, POLAR_VIEW } from "./polar";
import {
  convertAngleInput,
  formatAngleInput,
  type AngleInputUnit,
} from "./polar";
import "./polar.css";
import { ParameterControl } from "./ParameterControl";
import { compilePolarEquation } from "./polarEquation";
import { SidebarDivider } from "./SidebarDivider";
import { useColorTheme } from "./useColorTheme";
import { WorkspaceBrand } from "./WorkspaceBrand";
import { curveColor, plotThemes } from "./theme";
import { excludedParameters, finiteOpenPoints } from "./domainMarkers";
import { samplePolarPoints, drawPolarSamples } from "./polarPoints";
import { PolarPointControls, PolarPointTable } from "./PolarPointTools";
import {
  compileCartesianEntry,
  implicitSegments,
  parametricSegments,
  type CompiledPlot,
  type CartesianKind,
} from "./cartesian";
import "./cartesian.css";
import { AnalysisTools, type AnalysisHandle } from "./AnalysisTools";
import { OdeExpression } from "./OdeExpression";
import {
  DEFAULT_ODE_LATEX,
  DEFAULT_SECOND_ORDER_LATEX,
  EMPTY_ODE_STATE,
  type OdeEntryState,
} from "./odeLatex";
import type { Point as OdePoint } from "./ode";
import { buildOdeField } from "./odeField";
type CoordinateMode = "cartesian" | "polar";
type ExpressionKind = CartesianKind | "ode" | "ode2";
const isOdeKind = (kind?: ExpressionKind) => kind === "ode" || kind === "ode2";
type Expression = {
  id: number;
  value: string;
  left?: string;
  color: string;
  visible: boolean;
  kind?: ExpressionKind;
  ode?: OdeEntryState;
  tStart?: string;
  tEnd?: string;
};
const palette = [
  "#4d657a",
  "#b08442",
  "#337462",
  "#a65f65",
  "#7b7294",
  "#98705b",
];
const initialOdeKind =
  new URLSearchParams(window.location.search).get("expression") === "ode2"
    ? "ode2"
    : "ode";
const openOdeAtStart = ["ode", "ode2"].includes(
  new URLSearchParams(window.location.search).get("expression") ?? "",
);
const initial: Expression[] = openOdeAtStart
  ? [
      {
        id: 1,
        value:
          initialOdeKind === "ode2"
            ? DEFAULT_SECOND_ORDER_LATEX
            : DEFAULT_ODE_LATEX,
        color: palette[0],
        visible: true,
        kind: initialOdeKind,
      },
    ]
  : [
      {
        id: 1,
        value: "a\\sin\\left(bx+c\\right)",
        color: palette[0],
        visible: true,
      },
      { id: 2, value: "0.25x^{2}-2", color: palette[1], visible: true },
    ];
export default function App() {
  const { theme, toggleTheme } = useColorTheme();
  const paint = plotThemes[theme];
  const displayColor = (color: string) => curveColor(color, theme);
  const [mode, setMode] = useState<CoordinateMode>("cartesian");
  const [mobilePanel, setMobilePanel] = useState<
    "expressions" | "parameters" | "range" | "analysis"
  >("expressions");
  const polar = mode === "polar";
  const [newExpressionKind, setNewExpressionKind] = useState<ExpressionKind>(
    openOdeAtStart ? initialOdeKind : "explicit",
  );
  const [activeInputKind, setActiveInputKind] = useState<ExpressionKind>(
    openOdeAtStart ? initialOdeKind : "explicit",
  );
  const implicit = newExpressionKind === "implicit",
    parametric = newExpressionKind === "parametric";
  const chooseMobilePanel = (
    panel: "expressions" | "parameters" | "range" | "analysis",
  ) => {
    window.mathVirtualKeyboard.hide();
    setMobilePanel(panel);
    if (panel === "analysis") setAnalysisOpen(true);
  };
  const [expressions, setExpressions] = useState<Expression[]>(initial);
  const [params, setParams] = useState<Parameters>({ a: 2, b: 1, c: 0 });
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [grid, setGrid] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisHost, setAnalysisHost] = useState<HTMLDivElement | null>(null);
  const [keyboardHost, setKeyboardHost] = useState<HTMLDivElement | null>(null);
  const analysis = useRef<AnalysisHandle>(null);
  const pickStart = useRef<{ x: number; y: number; moved: boolean } | null>(
    null,
  );
  const [showNegativeRadius, setShowNegativeRadius] = useState(false);
  const [negativeRadiusDashed, setNegativeRadiusDashed] = useState(false);
  const [pointsEnabled, setPointsEnabled] = useState(false);
  const [pointDivisions, setPointDivisions] = useState("8");
  const [pointTableExpanded, setPointTableExpanded] = useState(false);
  const [pointValues, setPointValues] = useState(true);
  const [pointRays, setPointRays] = useState(false);
  const [pointExpressionId, setPointExpressionId] = useState<number | null>(
    null,
  );
  const [selectedPoint, setSelectedPoint] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [saved, setSaved] = useState(false);
  const [size, setSize] = useState({ w: 900, h: 650 });
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const nextId = useRef(4);
  const [angleStart, setAngleStart] = useState("0");
  const [angleEnd, setAngleEnd] = useState("2");
  const [angleUnit, setAngleUnit] = useState<AngleInputUnit>("pi");
  const lastRadianUnit = useRef<"pi" | "rad">("pi");
  const changeAngleUnit = (next: AngleInputUnit) => {
    if (next === angleUnit) return;
    const convert = (text: string) => {
      try {
        return convertAngleInput(text, angleUnit, next);
      } catch {
        return text;
      }
    };
    setAngleStart(convert(angleStart));
    setAngleEnd(convert(angleEnd));
    if (next !== "deg") lastRadianUnit.current = next;
    setAngleUnit(next);
  };
  const angleSuffix =
    angleUnit === "pi" ? "π" : angleUnit === "deg" ? "°" : "rad";
  const angleInputLabel =
    angleUnit === "pi" ? "π 的倍数" : angleUnit === "deg" ? "度" : "弧度数值";
  const angular = useMemo(() => {
    try {
      return { range: angleRange(angleStart, angleEnd, angleUnit), error: "" };
    } catch (error) {
      return { range: null, error: (error as Error).message };
    }
  }, [angleStart, angleEnd, angleUnit]);
  const workspaces = useRef<
    Record<
      CoordinateMode,
      { expressions: Expression[]; params: Parameters; view: View }
    >
  >({
    cartesian: {
      expressions: initial,
      params: { a: 2, b: 1, c: 0 },
      view: DEFAULT_VIEW,
    },
    polar: {
      expressions: [
        { id: 3, value: "a\\cos(k\\theta)", color: palette[0], visible: true },
      ],
      params: { a: 3, k: 4 },
      view: POLAR_VIEW,
    },
  });
  const switchMode = (next: CoordinateMode) => {
    if (next === mode) return;
    workspaces.current[mode] = { expressions, params, view };
    const target = workspaces.current[next];
    setExpressions(target.expressions);
    setParams(target.params);
    setView(target.view);
    setMode(next);
    if (next === "cartesian" && mobilePanel === "range")
      setMobilePanel("expressions");
    window.mathVirtualKeyboard.hide();
  };
  const parsed = useMemo(
    () =>
      expressions.map((e) => {
        if (!polar && isOdeKind(e.kind))
          return { ...e, fn: null, parameterInterval: null, error: "" };
        try {
          const built = polar
            ? {
                fn: compilePolarEquation(
                  e.left ?? "r",
                  e.value,
                ) as CompiledPlot,
                parameterInterval: null,
              }
            : compileCartesianEntry({ ...e, kind: e.kind as CartesianKind });
          return {
            ...e,
            ...built,
            error: "",
          };
        } catch (error) {
          return {
            ...e,
            fn: null,
            parameterInterval: null,
            error: error instanceof Error ? error.message : "请检查表达式",
          };
        }
      }),
    [expressions, polar],
  );
  const activeParams = new Set(parsed.flatMap((e) => e.fn?.params ?? []));
  const odePlots = useMemo(
    () =>
      polar
        ? []
        : expressions.flatMap((entry) => {
            if (
              !isOdeKind(entry.kind) ||
              !entry.visible ||
              !entry.ode?.solution
            )
              return [];
            return [
              {
                id: entry.id,
                color: entry.color,
                ...buildOdeField(entry.ode, view, size.w, size.h),
              },
            ];
          }),
    [expressions, polar, view, size],
  );
  const pointExpression =
    parsed.find((e) => e.visible && e.id === pointExpressionId) ??
    parsed.find((e) => e.visible);
  const pointData = useMemo(() => {
    if (!polar || !pointsEnabled) return { rows: [], error: "" };
    if (!angular.range) return { rows: [], error: angular.error };
    if (!pointExpression?.fn)
      return { rows: [], error: "请选择一条有效且可见的曲线" };
    try {
      return {
        rows: samplePolarPoints(
          pointExpression.fn,
          angular.range,
          Number(pointDivisions),
          params,
          showNegativeRadius,
        ),
        error: "",
      };
    } catch (error) {
      return { rows: [], error: (error as Error).message };
    }
  }, [
    polar,
    pointsEnabled,
    angular,
    pointExpression,
    pointDivisions,
    params,
    showNegativeRadius,
  ]);
  useEffect(() => {
    if (!frame.current) return;
    const ob = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height }),
    );
    ob.observe(frame.current);
    return () => ob.disconnect();
  }, []);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const { w, h } = size;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = paint.background;
    ctx.fillRect(0, 0, w, h);
    const ox = w / 2 - view.x * view.scale,
      oy = h / 2 + view.y * view.scale;
    const ideal = 75 / view.scale;
    const power = 10 ** Math.floor(Math.log10(ideal));
    const step = [1, 2, 5, 10].find((v) => v * power >= ideal)! * power;
    const drawLine = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      color: string,
      width = 1,
    ) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    if (polar) {
      drawPolarGrid(ctx, view, w, h, grid, angleUnit === "deg", paint);
    } else {
      if (grid) {
        const minor = (step * view.scale) / 5;
        for (let x = ((ox % minor) + minor) % minor; x < w; x += minor)
          drawLine(x, 0, x, h, paint.minor);
        for (let y = ((oy % minor) + minor) % minor; y < h; y += minor)
          drawLine(0, y, w, y, paint.minor);
      }
      ctx.font = '11px "Segoe UI", sans-serif';
      ctx.fillStyle = paint.text;
      const format = (n: number) =>
        Math.abs(n) < 1e-9 ? "0" : Number(n.toPrecision(5)).toString();
      for (
        let n = Math.ceil((view.x - w / 2 / view.scale) / step) * step;
        n < view.x + w / 2 / view.scale;
        n += step
      ) {
        const px = ox + n * view.scale;
        if (grid) drawLine(px, 0, px, h, paint.major);
        if (Math.abs(n) > step * 0.01) {
          ctx.textAlign = "center";
          ctx.fillText(format(n), px, Math.max(17, Math.min(h - 12, oy + 19)));
        }
      }
      for (
        let n = Math.ceil((view.y - h / 2 / view.scale) / step) * step;
        n < view.y + h / 2 / view.scale;
        n += step
      ) {
        const py = oy - n * view.scale;
        if (grid) drawLine(0, py, w, py, paint.major);
        if (Math.abs(n) > step * 0.01) {
          ctx.textAlign = "right";
          ctx.fillText(
            format(n),
            Math.max(30, Math.min(w - 12, ox - 10)),
            py + 4,
          );
        }
      }
      drawLine(ox, 0, ox, h, paint.axis, 1.2);
      drawLine(0, oy, w, oy, paint.axis, 1.2);
      ctx.fillStyle = paint.axisText;
      ctx.textAlign = "left";
      if (ox >= 0 && ox < w && oy >= 0 && oy < h)
        ctx.fillText("0", ox + 8, oy + 18);
      ctx.font = "italic 14px Georgia";
      if (oy >= 0 && oy < h) ctx.fillText("x", w - 20, oy - 10);
      if (ox >= 0 && ox < w) ctx.fillText("y", ox + 10, 20);
    }
    const drawOdeLine = (
      line: OdePoint[],
      color: string,
      width: number,
      alpha: number,
      dash: number[] = [],
    ) => {
      if (line.length < 2) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.setLineDash(dash);
      ctx.beginPath();
      line.forEach(([x, y], index) =>
        index
          ? ctx.lineTo(ox + x * view.scale, oy - y * view.scale)
          : ctx.moveTo(ox + x * view.scale, oy - y * view.scale),
      );
      ctx.stroke();
      ctx.restore();
    };
    for (const ode of odePlots) {
      for (const line of ode.family)
        drawOdeLine(
          line,
          displayColor(ode.color),
          1.15,
          ode.selection.point ? 0.28 : 0.42,
        );
      for (const line of ode.nearby)
        drawOdeLine(line, displayColor(ode.color), 1.45, 0.56);
      for (const asymptote of ode.asymptotes) {
        const x0 = view.x - w / (2 * view.scale),
          x1 = view.x + w / (2 * view.scale);
        const line: OdePoint[] =
          asymptote.axis === "x"
            ? [
                [asymptote.value, view.y - h / (2 * view.scale)],
                [asymptote.value, view.y + h / (2 * view.scale)],
              ]
            : [
                [x0, (asymptote.slope ?? 0) * x0 + asymptote.value],
                [x1, (asymptote.slope ?? 0) * x1 + asymptote.value],
              ];
        drawOdeLine(line, displayColor(ode.color), 2.6, 0.88, [10, 7]);
      }
    }
    for (const e of parsed) {
      if (!e.visible || !e.fn) continue;
      ctx.strokeStyle = displayColor(e.color);
      ctx.lineWidth = 2.6;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      if (e.fn.implicit || e.fn.parametric) {
        ctx.setLineDash([]);
        const lines = e.fn.implicit
          ? implicitSegments(
              (x, y) => e.fn!.implicit!(x, y, params),
              view,
              w,
              h,
            )
          : e.parameterInterval
            ? parametricSegments(
                (t) => e.fn!.parametric!(t, params),
                e.parameterInterval,
                view,
                w,
                h,
              )
            : [];
        for (const line of lines) {
          ctx.beginPath();
          line.forEach(([x, y], i) =>
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y),
          );
          ctx.stroke();
        }
        continue;
      }
      const splitNegative = polar && showNegativeRadius && negativeRadiusDashed;
      if (splitNegative && angular.range) {
        ctx.setLineDash([7, 5]);
        for (const line of e.fn.branches.flatMap((evaluate) =>
          polarSegments(
            (t) => evaluate(t, params),
            angular.range,
            view,
            w,
            h,
            true,
            true,
          ),
        )) {
          ctx.beginPath();
          line.forEach(([x, y], i) =>
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y),
          );
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
      const lines = polar
        ? angular.range
          ? e.fn.branches.flatMap((evaluate) =>
              polarSegments(
                (t) => evaluate(t, params),
                angular.range!,
                view,
                w,
                h,
                showNegativeRadius && !splitNegative,
              ),
            )
          : []
        : curveSegments((x) => e.fn!.evaluate(x, params), view, w, h);
      for (const line of lines) {
        ctx.beginPath();
        line.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
      const markerRange = polar
        ? angular.range
        : {
            start: view.x - w / (2 * view.scale),
            end: view.x + w / (2 * view.scale),
          };
      if (markerRange && e.fn.domainGuards.length) {
        const roots = excludedParameters(
          e.fn.domainGuards,
          markerRange,
          params,
        );
        const holes = finiteOpenPoints(
          roots,
          e.fn.branches,
          markerRange,
          params,
          view,
          w,
          h,
          polar,
          showNegativeRadius,
        );
        ctx.setLineDash([]);
        ctx.lineWidth = 2;
        ctx.fillStyle = paint.background;
        for (const [x, y] of holes) {
          ctx.beginPath();
          ctx.arc(x, y, 4.5, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();
        }
      }
    }
    for (const ode of odePlots) {
      for (const line of ode.particular) {
        drawOdeLine(line, paint.background, 6, 0.9);
        drawOdeLine(line, displayColor(ode.color), 3.2, 1);
      }
      if (ode.selection.point) {
        const [x, y] = ode.selection.point;
        ctx.save();
        ctx.beginPath();
        ctx.arc(ox + x * view.scale, oy - y * view.scale, 4.5, 0, 2 * Math.PI);
        ctx.fillStyle = displayColor(ode.color);
        ctx.fill();
        ctx.strokeStyle = paint.background;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
      for (const [x, y] of ode.singularities) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(ox + x * view.scale, oy - y * view.scale, 4.6, 0, 2 * Math.PI);
        ctx.fillStyle = "#000000";
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = "#eef0eb";
        ctx.stroke();
        ctx.restore();
      }
    }
    if (polar && pointsEnabled && pointExpression)
      drawPolarSamples(
        ctx,
        pointData.rows,
        view,
        w,
        h,
        displayColor(pointExpression.color),
        pointValues,
        pointRays,
        selectedPoint,
        pointTableExpanded
          ? {
              x:
                w - Math.min(window.innerWidth <= 640 ? 300 : 330, w - 28) - 14,
              y: h - (window.innerWidth <= 640 ? 33 + 144 : 42 + 270),
              w: Math.min(window.innerWidth <= 640 ? 300 : 330, w - 28) + 8,
              h: window.innerWidth <= 640 ? 144 : 270,
            }
          : undefined,
        angleUnit === "deg",
        paint,
      );
  }, [
    parsed,
    params,
    view,
    size,
    grid,
    polar,
    angular,
    showNegativeRadius,
    negativeRadiusDashed,
    pointsEnabled,
    pointExpression,
    pointData,
    pointValues,
    pointRays,
    selectedPoint,
    pointTableExpanded,
    angleUnit,
    theme,
    odePlots,
  ]);
  const zoom = (factor: number, px = size.w / 2, py = size.h / 2) =>
    setView((v) => {
      const scale = Math.max(8, Math.min(1200, v.scale * factor));
      return {
        scale,
        x: v.x + (px - size.w / 2) * (1 / v.scale - 1 / scale),
        y: v.y - (py - size.h / 2) * (1 / v.scale - 1 / scale),
      };
    });
  const fitPoints = () => {
    const points = pointData.rows.flatMap((row) =>
      row.point ? [row.point] : [],
    );
    if (!points.length) return;
    const xs = points.map((p) => p[0]),
      ys = points.map((p) => p[1]);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minY = Math.min(...ys),
      maxY = Math.max(...ys);
    const narrow = size.w < 600;
    const availableW = Math.max(
      100,
      size.w - 90 - (pointTableExpanded && !narrow ? 340 : 0),
    );
    const availableH = Math.max(
      90,
      size.h - 100 - (pointTableExpanded && narrow ? 150 : 0),
    );
    const scale = Math.max(
      8,
      Math.min(
        1200,
        availableW / Math.max(0.1, maxX - minX),
        availableH / Math.max(0.1, maxY - minY),
      ),
    );
    const centerPx = 45 + availableW / 2,
      centerPy = 50 + availableH / 2;
    setView({
      scale,
      x: (minX + maxX) / 2 - (centerPx - size.w / 2) / scale,
      y: (minY + maxY) / 2 + (centerPy - size.h / 2) / scale,
    });
  };
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [size]);
  const update = (id: number, patch: Partial<Expression>) =>
    setExpressions((es) =>
      es.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    );
  const freeColor = (items: Expression[]) =>
    palette.find((color) => !items.some((e) => e.color === color)) ??
    palette[items.length % palette.length];
  const addExpression = () => {
    if (expressions.length >= 6) return;
    const id = nextId.current++;
    setExpressions((es) => [
      ...es,
      {
        id,
        value:
          !polar && isOdeKind(newExpressionKind)
            ? newExpressionKind === "ode2"
              ? DEFAULT_SECOND_ORDER_LATEX
              : DEFAULT_ODE_LATEX
            : "",
        kind: polar ? undefined : newExpressionKind,
        left: polar ? "r" : "",
        tStart: "0",
        tEnd: "2π",
        color: freeColor(es),
        visible: true,
      },
    ]);
    setActiveInputKind(newExpressionKind);
  };
  const pointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (
      pickStart.current &&
      Math.hypot(
        e.clientX - pickStart.current.x,
        e.clientY - pickStart.current.y,
      ) > 5
    )
      pickStart.current.moved = true;
    if (analysisOpen && !e.buttons) {
      const rect = e.currentTarget.getBoundingClientRect();
      analysis.current?.hover(e.clientX - rect.left, e.clientY - rect.top);
    }
    const before = [...pointers.current.values()];
    const old = pointers.current.get(e.pointerId);
    if (!old) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const after = [...pointers.current.values()];
    if (before.length === 1) {
      setView((v) => ({
        ...v,
        x: v.x - (e.clientX - old.x) / v.scale,
        y: v.y + (e.clientY - old.y) / v.scale,
      }));
    } else if (before.length === 2) {
      const dist = (p: typeof before) =>
        Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      const d = dist(before);
      if (d < 2) return;
      const r = e.currentTarget.getBoundingClientRect();
      const bx = (before[0].x + before[1].x) / 2 - r.left,
        by = (before[0].y + before[1].y) / 2 - r.top,
        ax = (after[0].x + after[1].x) / 2 - r.left,
        ay = (after[0].y + after[1].y) / 2 - r.top;
      setView((v) => {
        const scale = Math.max(8, Math.min(1200, (v.scale * dist(after)) / d));
        return {
          scale,
          x: v.x + (bx - size.w / 2) / v.scale - (ax - size.w / 2) / scale,
          y: v.y - (by - size.h / 2) / v.scale + (ay - size.h / 2) / scale,
        };
      });
    }
  };
  const download = () => {
    const source = canvas.current;
    if (!source) return;
    const out = document.createElement("canvas");
    out.width = source.width;
    out.height = source.height;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = paint.background;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(source, 0, 0);
    analysis.current?.exportTo(ctx);
    const a = document.createElement("a");
    a.download = "mathroom-graph.png";
    a.href = out.toDataURL();
    a.click();
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };
  return (
    <div
      className={`app${polar && (pointsEnabled || pointTableExpanded) ? " points-active" : ""}`}
    >
      <KeyboardManager
        desktopContainer={keyboardHost}
        polar={polar}
        parametric={!polar && activeInputKind === "parametric"}
        implicit={!polar && activeInputKind === "implicit"}
        ode={!polar && isOdeKind(activeInputKind)}
        odeOrder={activeInputKind === "ode2" ? 2 : 1}
      />
      <main>
        <aside className="sidebar" id="control-panel">
          <div className="sidebar-brand">
            <WorkspaceBrand label="纯数探索" />
            <div className="brand-actions">
              <button
                className="theme-toggle"
                aria-label={theme === "light" ? "切换深色模式" : "切换浅色模式"}
                title={theme === "light" ? "深色模式" : "浅色模式"}
                onPointerDown={(e) => e.preventDefault()}
                onClick={toggleTheme}
              >
                {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
              </button>
              <button
                className="help-button"
                aria-label="使用指南"
                title="使用指南"
                onClick={() => {
                  window.mathVirtualKeyboard.hide();
                  setHelp(!help);
                }}
              >
                <CircleHelp size={18} />
              </button>
            </div>
          </div>
          <nav className="mobile-control-tabs" aria-label="控制台栏目">
            <button
              aria-pressed={mobilePanel === "expressions"}
              onClick={() => chooseMobilePanel("expressions")}
            >
              公式
            </button>
            <button
              aria-pressed={mobilePanel === "parameters"}
              onClick={() => chooseMobilePanel("parameters")}
            >
              参数 <small>{activeParams.size}</small>
            </button>
            <button
              aria-pressed={mobilePanel === "analysis"}
              onClick={() => chooseMobilePanel("analysis")}
            >
              图像分析
            </button>
            {polar && (
              <button
                aria-pressed={mobilePanel === "range"}
                onClick={() => chooseMobilePanel("range")}
              >
                θ 范围
              </button>
            )}
          </nav>
          <div className="sidebar-content" data-panel={mobilePanel}>
            {polar && (
              <section className="polar-settings" aria-label="极坐标角度范围">
                <div className="section-title">
                  <span>θ 的绘制范围</span>
                  <select
                    className="angle-unit-select"
                    aria-label="θ 范围单位"
                    value={angleUnit === "deg" ? "deg" : "rad"}
                    onChange={(e) =>
                      changeAngleUnit(
                        e.target.value === "deg"
                          ? "deg"
                          : lastRadianUnit.current,
                      )
                    }
                  >
                    <option value="rad">弧度</option>
                    <option value="deg">角度</option>
                  </select>
                </div>
                {angleUnit !== "deg" && (
                  <div
                    className="radian-input-mode"
                    role="group"
                    aria-label="弧度输入方式"
                  >
                    <button
                      aria-pressed={angleUnit === "pi"}
                      onClick={() => changeAngleUnit("pi")}
                    >
                      π 的倍数
                    </button>
                    <button
                      aria-pressed={angleUnit === "rad"}
                      onClick={() => changeAngleUnit("rad")}
                    >
                      弧度数值
                    </button>
                  </div>
                )}
                <div className="angle-inputs">
                  <label>
                    <span>起点</span>
                    <div>
                      <input
                        aria-label={`角度起点（${angleInputLabel}）`}
                        type="text"
                        inputMode="text"
                        placeholder={angleUnit === "deg" ? "如 -90" : "如 -1/2"}
                        autoComplete="off"
                        spellCheck={false}
                        value={angleStart}
                        onChange={(e) => setAngleStart(e.target.value)}
                      />
                      <span>{angleSuffix}</span>
                    </div>
                  </label>
                  <span className="angle-arrow">→</span>
                  <label>
                    <span>终点</span>
                    <div>
                      <input
                        aria-label={`角度终点（${angleInputLabel}）`}
                        type="text"
                        inputMode="text"
                        placeholder={
                          angleUnit === "deg"
                            ? "如 45"
                            : angleUnit === "rad"
                              ? "如 1.5"
                              : "如 1/4"
                        }
                        autoComplete="off"
                        spellCheck={false}
                        value={angleEnd}
                        onChange={(e) => setAngleEnd(e.target.value)}
                      />
                      <span>{angleSuffix}</span>
                    </div>
                  </label>
                </div>
                <div className="angle-presets">
                  {["2", "4", "6"].map((end) => (
                    <button
                      key={end}
                      aria-pressed={
                        angular.range?.start === 0 &&
                        Math.abs(angular.range.end - Number(end) * Math.PI) <
                          1e-12
                      }
                      onClick={() => {
                        setAngleStart("0");
                        setAngleEnd(
                          formatAngleInput(Number(end) * Math.PI, angleUnit),
                        );
                      }}
                    >
                      0 →{" "}
                      {angleUnit === "deg"
                        ? `${Number(end) * 180}°`
                        : `${end}π`}
                    </button>
                  ))}
                </div>
                {angular.error ? (
                  <div className="error" role="status">
                    {angular.error}
                  </div>
                ) : (
                  <p className="formula-hint">
                    {angleUnit === "pi"
                      ? "输入 π 的倍数，例如 1/4 表示 π/4。"
                      : angleUnit === "deg"
                        ? "直接输入角度，如 45 或 45/2。"
                        : "直接输入弧度，如 1.5 或 1/4；1 表示 1 rad。"}
                  </p>
                )}
                <div className="negative-radius-option">
                  <label>
                    <input
                      type="checkbox"
                      checked={showNegativeRadius}
                      onChange={(e) => setShowNegativeRadius(e.target.checked)}
                    />
                    显示负 r 的图像
                  </label>
                  <label
                    style={{
                      marginTop: 10,
                      opacity: showNegativeRadius ? 1 : 0.5,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={negativeRadiusDashed}
                      disabled={!showNegativeRadius}
                      onChange={(e) =>
                        setNegativeRadiusDashed(e.target.checked)
                      }
                    />
                    负 r 使用虚线
                  </label>
                </div>
              </section>
            )}
            <section className="expression-section">
              <div className="section-title">
                <span>
                  <FunctionSquare size={17} /> 表达式
                </span>
                <div className="section-actions">
                  <span className="counter">{expressions.length} / 6</span>
                  {!polar && (
                    <select
                      className="expression-type-select"
                      aria-label="添加表达式类型"
                      value={newExpressionKind}
                      onChange={(e) =>
                        setNewExpressionKind(e.target.value as ExpressionKind)
                      }
                    >
                      <option value="explicit">显函数</option>
                      <option value="implicit">隐函数</option>
                      <option value="parametric">参数方程</option>
                      <option value="ode">一阶微分方程</option>
                      <option value="ode2" title="二阶常系数微分方程">
                        二阶常系数
                      </option>
                    </select>
                  )}
                  <button
                    className="add-expression"
                    aria-label="添加表达式"
                    title="添加表达式"
                    disabled={expressions.length >= 6}
                    onClick={addExpression}
                  >
                    <Plus size={15} />
                    <span>添加</span>
                  </button>
                </div>
              </div>
              <div className="expressions">
                {parsed.map((e, i) => {
                  const implicit = !polar && e.kind === "implicit",
                    parametric = !polar && e.kind === "parametric",
                    ode = !polar && isOdeKind(e.kind);
                  return (
                    <div
                      className={`expression ${!e.visible ? "muted" : ""} ${e.error ? "invalid" : ""}`}
                      key={e.id}
                      style={
                        {
                          "--curve-color": displayColor(e.color),
                        } as React.CSSProperties
                      }
                    >
                      <div className="expression-top">
                        <span className="function-label">
                          <i />
                          {ode ? (
                            <>
                              <StaticMath value={`\\mathcal{E}_{${i + 1}}`} />
                              <small>
                                {e.kind === "ode2"
                                  ? "二阶常系数微分方程"
                                  : "一阶微分方程"}
                              </small>
                            </>
                          ) : (
                            `${polar ? "r" : implicit ? "F" : parametric ? "Γ" : "f"}${["₁", "₂", "₃", "₄", "₅", "₆"][i]}(${polar ? "θ" : implicit ? "x,y" : parametric ? "t" : "x"})`
                          )}
                        </span>
                        <div className="row-actions">
                          <button
                            title={e.visible ? "隐藏曲线" : "显示曲线"}
                            aria-label={`${e.visible ? "隐藏" : "显示"}表达式 ${i + 1}`}
                            onClick={() =>
                              update(e.id, { visible: !e.visible })
                            }
                          >
                            {e.visible ? (
                              <Eye size={15} />
                            ) : (
                              <EyeOff size={15} />
                            )}
                          </button>
                          <button
                            title="删除表达式"
                            aria-label={`删除表达式 ${i + 1}`}
                            onClick={() =>
                              setExpressions((es) =>
                                es.filter((x) => x.id !== e.id),
                              )
                            }
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      {ode ? (
                        <OdeExpression
                          index={i + 1}
                          order={e.kind === "ode2" ? 2 : 1}
                          value={e.value}
                          state={e.ode ?? EMPTY_ODE_STATE}
                          onValue={(value) =>
                            update(e.id, {
                              value,
                              ode: {
                                ...(e.ode ?? EMPTY_ODE_STATE),
                                solution: null,
                                error: "",
                              },
                            })
                          }
                          onState={(patch) =>
                            update(e.id, {
                              ode: { ...(e.ode ?? EMPTY_ODE_STATE), ...patch },
                            })
                          }
                          onFocus={() => setActiveInputKind(e.kind ?? "ode")}
                        />
                      ) : (
                        <>
                          {parametric && (
                            <div className="formula-row parametric-formula">
                              <span>x(t) =</span>
                              <MathInput
                                label={`参数方程 x ${i + 1}`}
                                value={e.left ?? ""}
                                onChange={(left) => update(e.id, { left })}
                                onFocus={() => setActiveInputKind("parametric")}
                              />
                            </div>
                          )}
                          <div className="formula-row">
                            {polar ? (
                              <>
                                <div className="polar-equation-left">
                                  <span
                                    className="polar-left-sizer"
                                    aria-hidden="true"
                                  >
                                    <StaticMath value={e.left ?? "r"} />
                                  </span>
                                  <MathInput
                                    label={`极坐标左侧 ${i + 1}`}
                                    value={e.left ?? "r"}
                                    onChange={(left) => update(e.id, { left })}
                                  />
                                </div>
                                <span>=</span>
                              </>
                            ) : implicit ? null : (
                              <span>{parametric ? "y(t)" : "y"} =</span>
                            )}
                            <MathInput
                              label={
                                parametric
                                  ? `参数方程 y ${i + 1}`
                                  : `表达式 ${i + 1}`
                              }
                              value={e.value}
                              onChange={(value) => update(e.id, { value })}
                              onFocus={() =>
                                setActiveInputKind(e.kind ?? "explicit")
                              }
                            />
                          </div>
                          {parametric && (
                            <div className="expression-t-range">
                              <span>t</span>
                              <input
                                aria-label={`参数方程 ${i + 1} t 起点`}
                                value={e.tStart ?? "0"}
                                onChange={(event) =>
                                  update(e.id, { tStart: event.target.value })
                                }
                                placeholder="0"
                              />
                              <span>→</span>
                              <input
                                aria-label={`参数方程 ${i + 1} t 终点`}
                                value={e.tEnd ?? "2π"}
                                onChange={(event) =>
                                  update(e.id, { tEnd: event.target.value })
                                }
                                placeholder="2π"
                              />
                            </div>
                          )}
                        </>
                      )}
                      {e.error && (
                        <div className="error" role="status">
                          {e.error}
                        </div>
                      )}
                      {e.fn?.numerical && (
                        <div className="numerical-note">
                          数值近似 · 不收敛或超出计算限额的点不显示
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="parameters-section">
              <div className="section-title parameter-title">
                <span>
                  <SlidersHorizontal size={16} /> 参数控制
                </span>
                <span className="counter">{activeParams.size} 个</span>
              </div>
              <div className="parameters">
                {[...activeParams].map((p) => (
                  <ParameterControl
                    key={`${mode}:${p}`}
                    name={p}
                    value={params[p] ?? 1}
                    onChange={(value) =>
                      setParams((v) => ({ ...v, [p]: value }))
                    }
                  />
                ))}
                {activeParams.size === 0 && (
                  <p className="empty-params">
                    {!polar &&
                    expressions.length > 0 &&
                    expressions.every((entry) => isOdeKind(entry.kind)) ? (
                      "微分方程的系数请填写数值。"
                    ) : (
                      <>
                        写入
                        {polar || implicit || parametric
                          ? " a、k、b 等参数"
                          : "任意单字母参数，如 k、m、θ"}
                        ，
                        <br />
                        这里会自动出现参数滑块。
                      </>
                    )}
                  </p>
                )}
              </div>
            </section>
            <div className="analysis-section" ref={setAnalysisHost} />
          </div>
        </aside>
        <SidebarDivider />
        <section className="workspace">
          <div className="graph-frame" ref={frame}>
            <div className="desktop-math-keyboard" ref={setKeyboardHost} />
            <div className="workspace-bar">
              <div className="workspace-mode-controls">
                <div
                  className="coordinate-switch"
                  role="group"
                  aria-label="坐标模式"
                >
                  <button
                    aria-pressed={!polar}
                    onClick={() => switchMode("cartesian")}
                  >
                    直角坐标
                  </button>
                  <button
                    aria-pressed={polar}
                    onClick={() => switchMode("polar")}
                  >
                    极坐标
                  </button>
                </div>
              </div>
            </div>
            <canvas
              ref={canvas}
              aria-label={`${polar ? "极坐标" : "直角坐标"}交互图，可拖动平移或双指缩放`}
              onPointerDown={(e) => {
                pickStart.current = {
                  x: e.clientX,
                  y: e.clientY,
                  moved: pointers.current.size > 0,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
                pointers.current.set(e.pointerId, {
                  x: e.clientX,
                  y: e.clientY,
                });
              }}
              onPointerMove={pointerMove}
              onPointerUp={(e) => {
                if (
                  analysisOpen &&
                  pickStart.current &&
                  !pickStart.current.moved &&
                  pointers.current.size === 1
                ) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  analysis.current?.pick(
                    e.clientX - rect.left,
                    e.clientY - rect.top,
                  );
                }
                pickStart.current = null;
                pointers.current.delete(e.pointerId);
              }}
              onPointerLeave={() => analysis.current?.leave()}
              onPointerCancel={(e) => {
                pickStart.current = null;
                pointers.current.delete(e.pointerId);
              }}
              onLostPointerCapture={(e) => pointers.current.delete(e.pointerId)}
            />
            <AnalysisTools
              ref={analysis}
              entries={parsed}
              params={params}
              polar={polar}
              angular={angular.range}
              showNegative={showNegativeRadius}
              view={view}
              size={size}
              theme={theme}
              open={analysisOpen}
              panelHost={analysisHost}
              onToggle={() => {
                window.mathVirtualKeyboard.hide();
                setAnalysisOpen(!analysisOpen);
              }}
            />
            <div className="graph-legend">
              {parsed
                .filter(
                  (e) =>
                    e.visible &&
                    (e.fn || (!polar && isOdeKind(e.kind) && e.ode?.solution)),
                )
                .map((e) => (
                  <span key={e.id}>
                    <i style={{ background: displayColor(e.color) }} />
                    <StaticMath
                      value={
                        polar
                          ? `${e.left ?? "r"}=${e.value}`
                          : e.kind === "parametric"
                            ? `x=${e.left ?? ""}\\,;\\;y=${e.value}`
                            : e.value
                      }
                    />
                  </span>
                ))}
            </div>
            {polar && (
              <PolarPointTable
                rows={pointData.rows}
                expanded={pointTableExpanded}
                onExpand={setPointTableExpanded}
                selected={selectedPoint}
                onSelect={setSelectedPoint}
                color={displayColor(pointExpression?.color ?? palette[0])}
                error={pointData.error}
                enabled={pointsEnabled}
                controls={
                  <PolarPointControls
                    enabled={pointsEnabled}
                    onEnabled={setPointsEnabled}
                    divisions={pointDivisions}
                    onDivisions={setPointDivisions}
                    showValues={pointValues}
                    onShowValues={setPointValues}
                    showRays={pointRays}
                    onShowRays={setPointRays}
                    expressionId={pointExpression?.id}
                    onExpression={(id) => {
                      setPointExpressionId(id);
                      setSelectedPoint(null);
                    }}
                    expressions={parsed
                      .filter((e) => e.visible)
                      .map((e) => ({
                        id: e.id,
                        name: `表达式 ${parsed.indexOf(e) + 1}`,
                      }))}
                    error={pointData.error}
                    onFit={fitPoints}
                  />
                }
              />
            )}
            <div className="graph-controls" role="group" aria-label="画布工具">
              <button
                aria-label={saved ? "已导出" : "导出图片"}
                title={saved ? "已导出" : "导出图片"}
                onClick={download}
              >
                {saved ? <Check size={17} /> : <Download size={17} />}
              </button>
              <span aria-hidden="true" />
              <button aria-label="放大" title="放大" onClick={() => zoom(1.3)}>
                <Plus size={19} />
              </button>
              <button
                aria-label="缩小"
                title="缩小"
                onClick={() => zoom(1 / 1.3)}
              >
                <Minus size={19} />
              </button>
              <button
                aria-label="重置视图"
                title="重置视图"
                onClick={() => setView(polar ? POLAR_VIEW : DEFAULT_VIEW)}
              >
                <RotateCcw size={17} />
              </button>
              <button
                aria-label="切换网格"
                aria-pressed={grid}
                title="切换网格"
                onClick={() => setGrid(!grid)}
              >
                <Grid2X2 size={17} />
              </button>
            </div>
            <footer className="workspace-footer">
              <span>
                {polar && angleUnit === "deg"
                  ? "θ 显示：角度"
                  : "角度单位：弧度"}{" "}
                <span className="footer-divider">/</span>{" "}
                {polar && angleUnit === "deg" ? "DEG" : "RAD"}
              </span>
            </footer>
          </div>
        </section>
      </main>
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-label="使用指南"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="关闭指南"
              onClick={() => setHelp(false)}
            >
              <X />
            </button>
            <div className="eyebrow">QUICK START</div>
            <h2>你的第一幅函数图像</h2>
            <p>
              在左栏“添加”旁选择显函数、隐函数、参数方程、一阶微分方程或二阶常系数微分方程，再添加表达式。各类曲线可以叠加在同一张直角坐标画布。隐函数输入完整等式（如
              x²+y²=9）；参数方程分别输入 x(t)、y(t)，每条表达式下方独立设置 t
              范围。
            </p>
            <p>
              微分方程同样用公式键盘输入，填写完整等式后点击“求解”。细线显示通解的积分曲线族；在同一张表达式卡片中填写初值，会突出对应的特解，也可调节曲线密度。二阶常系数方程需要同时填写函数值与初始斜率；右端项支持多项式、指数、正弦、余弦及它们的和与积。
            </p>
            <p>
              画布上方可以切换直角坐标与极坐标。极坐标输入 r =
              f(θ)，范围右上角可选弧度或角度；弧度支持 π
              的倍数与直接数值两种输入方式，均可输入分数。切换单位会自动换算同一范围。键盘基础页会提供
              θ。勾选“显示负 r 的图像”时负半径按相反方向绘制，关闭时负 r
              区间留空。刷新后仍会恢复默认示例。
            </p>
            <p>
              点击公式打开键盘。123 页提供分式、幂、根式和括号；f(x)
              页提供函数、求和、积分与导数。ABC 和 αβ 页输入参数。
            </p>
            <p>
              点击空框填写内容，用“下一格”或 Tab
              跳到下一部分；左右箭头移动光标，退格删除，撤销可恢复修改。选中内容后点击分式或根式，可将它放入结构中。直接写
              ab、kx 即表示相乘。
            </p>
            <p>
              求和与连乘限整数范围、最多 100
              项。定积分与一阶导数采用数值近似；不定积分和不等式区域暂不求解或绘图。e、π
              为常数，三角函数使用弧度。隐函数为数值轮廓，极细小分支或孤立点可能漏检。
            </p>
            <p>
              单指拖动画布，双指缩放；电脑可使用鼠标拖动与滚轮。右侧复位按钮恢复默认视窗。
            </p>
            <p>
              左栏“图像分析”开关打开分析工具；手机在控制台选择“图像分析”。靠近曲线后点击，优先吸附交点、驻点和轴交点；也可输入坐标，显函数的
              y
              留空时自动求值。选中一个点即可查看各条经过它的曲线的切线；“取曲线段”中可按交点或用两点截取，再计算积分。参数曲线按
              ∫y dx、极坐标按 ½∫r² dθ 计算，隐函数需先改写后积分。坐标支持
              sqrt(2)、pi/4
              等输入；可确认时优先显示精确坐标、切线与积分结果，否则标注数值近似。奇点处不强行生成切线或反常积分。修改曲线或参数会清空旧取点。
            </p>
            <p>
              “按交点截取”和“取区域”支持两条显函数：选择边界曲线后，点击相邻交点之间的曲线段或封闭区域。
              曲线段可计算定积分、弧长与第一类曲线积分（密度 h(x,y)，如
              x^2+y^2）；区域按 ∫|f−g| dx 计算面积。
              请让左右交点都进入视窗；结果为数值近似。修改曲线或参数会清除旧选择。
            </p>
            <p className="notice">
              这是数值采样绘图原型，极窄或高频的变化可能未被完整显示。当前内容尚未自动保存，刷新页面会恢复示例。
            </p>
            <button className="primary" onClick={() => setHelp(false)}>
              开始探索 <ArrowUpRight size={16} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
