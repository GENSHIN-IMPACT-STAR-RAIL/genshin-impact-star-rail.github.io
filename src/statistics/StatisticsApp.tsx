import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  Lightbulb,
  Moon,
  RotateCcw,
  Sun,
} from "lucide-react";
import { useColorTheme } from "../useColorTheme";
import { StaticMath } from "../StaticMath";
import { DistributionChart, plotColors } from "./DistributionChart";
import {
  DEFAULT_LAB,
  STORAGE_KEY,
  binomialMasses,
  binomialProbability,
  eventText,
  formatProbability,
  integerBounds,
  normalBounds,
  normalEventText,
  normalInterval,
  restoreLab,
  type CountEvent,
  type EventKind,
  type LabState,
} from "./model";

const PRESETS: {
  title: string;
  label: string;
  note: string;
  state: LabState;
}[] = [
  {
    title: "中央区域",
    label: "01",
    note: "看概率柱如何对应一片面积",
    state: DEFAULT_LAB,
  },
  {
    title: "单侧尾部",
    label: "02",
    note: "“少于 8 次”应怎样移动边界？",
    state: {
      ...DEFAULT_LAB,
      n: 30,
      p: 0.4,
      event: {
        ...DEFAULT_LAB.event,
        kind: "left",
        a: 8,
        b: 18,
        includeUpper: false,
      },
    },
  },
  {
    title: "偏态挑战",
    label: "03",
    note: "有了修正，近似就一定好吗？",
    state: {
      ...DEFAULT_LAB,
      n: 20,
      p: 0.08,
      event: { ...DEFAULT_LAB.event, kind: "point", a: 0, b: 18 },
    },
  },
];

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const numeric = Number(draft);
  const valid =
    draft.trim() !== "" &&
    Number.isFinite(numeric) &&
    numeric >= min &&
    numeric <= max &&
    (step !== 1 || Number.isInteger(numeric));
  return (
    <input
      className="stat-number"
      type="number"
      inputMode={step === 1 ? "numeric" : "decimal"}
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={draft}
      aria-invalid={!valid}
      onChange={(e) => {
        const text = e.target.value,
          next = Number(text);
        setDraft(text);
        if (
          text.trim() !== "" &&
          Number.isFinite(next) &&
          next >= min &&
          next <= max &&
          (step !== 1 || Number.isInteger(next))
        )
          onChange(next);
      }}
      onBlur={() => {
        if (!valid) setDraft(String(value));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

const simpleNumber = (value: number) => Number(value.toFixed(5)).toString();
export function StatisticsApp() {
  const { theme, toggleTheme } = useColorTheme();
  const [state, setState] = useState<LabState>(() => {
    try {
      return (
        restoreLab(localStorage.getItem(STORAGE_KEY)) ??
        structuredClone(DEFAULT_LAB)
      );
    } catch {
      return structuredClone(DEFAULT_LAB);
    }
  });
  const [hidden, setHidden] = useState(false);
  const [saved, setSaved] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }, [state]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const { n, p, event, correction, showNormal } = state;
  const masses = useMemo(() => binomialMasses(n, p), [n, p]);
  const mean = n * p,
    variance = n * p * (1 - p),
    sd = Math.sqrt(variance);
  const exact = useMemo(
    () => binomialProbability(masses, event),
    [masses, event],
  );
  const normal = useMemo(() => {
    const [a, b] = normalBounds(event, correction);
    return normalInterval(a, b, mean, sd);
  }, [event, correction, mean, sd]);
  const gap = normal === null ? null : Math.abs(normal - exact);
  const [first, last] = integerBounds(event);
  const selectedFirst = Math.max(0, first),
    selectedLast = Math.min(n, last);
  const selected =
    selectedFirst <= selectedLast ? selectedLast - selectedFirst + 1 : 0;
  const selectedText =
    selected === 0
      ? "没有选中的整数"
      : selected === 1
        ? `只选中 k = ${selectedFirst}`
        : `选中 k = ${selectedFirst}, …, ${selectedLast}`;
  const approxWeak = Math.min(n * p, n * (1 - p)) < 5;
  const update = (patch: Partial<LabState>) =>
    setState((old) => ({ ...old, ...patch }));
  const updateEvent = (patch: Partial<CountEvent>) =>
    setState((old) => ({ ...old, event: { ...old.event, ...patch } }));
  const boundary = (key: "a" | "b", value: number) =>
    setState((old) => {
      const e = { ...old.event, [key]: value };
      if (key === "a" && e.a > e.b) e.b = e.a;
      if (key === "b" && e.b < e.a) e.a = e.b;
      return { ...old, event: e };
    });
  const changeN = (next: number) =>
    setState((old) => ({
      ...old,
      n: next,
      event: {
        ...old.event,
        a: Math.min(next, old.event.a),
        b: Math.min(next, old.event.b),
      },
    }));
  const applyPreset = (preset: LabState) => {
    setState(structuredClone(preset));
    setHidden(false);
  };
  const exportPng = async () => {
    if (!svgRef.current || exporting) return;
    setExporting(true);
    let imageUrl: string | undefined;
    try {
      const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
      const box = svgRef.current.viewBox.baseVal;
      const width = Math.max(720, box.width),
        scale = width / box.width;
      const chartHeight = box.height * scale,
        height = chartHeight + 152;
      const colors = plotColors(theme === "dark");
      const outer = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      outer.setAttribute("width", String(width));
      outer.setAttribute("height", String(height));
      outer.setAttribute("viewBox", `0 0 ${width} ${height}`);
      const rect = document.createElementNS(outer.namespaceURI, "rect");
      rect.setAttribute("width", "100%");
      rect.setAttribute("height", "100%");
      rect.setAttribute("fill", colors.background);
      outer.append(rect);
      const addText = (
        text: string,
        y: number,
        size: number,
        color = colors.ink,
      ) => {
        const node = document.createElementNS(outer.namespaceURI, "text");
        node.textContent = text;
        node.setAttribute("x", "30");
        node.setAttribute("y", String(y));
        node.setAttribute("font-size", String(size));
        node.setAttribute(
          "font-family",
          "Segoe UI, Microsoft YaHei, sans-serif",
        );
        node.setAttribute("fill", color);
        outer.append(node);
      };
      addText("Mathroom · 二项分布与正态近似", 32, 18);
      addText(
        `X ~ B(${n}, ${p})  ·  ${eventText(event)}  ·  ${correction ? "含连续性修正" : "未作连续性修正"}`,
        59,
        14,
      );
      clone.setAttribute("x", "0");
      clone.setAttribute("y", "76");
      clone.setAttribute("width", String(width));
      clone.setAttribute("height", String(chartHeight));
      outer.append(clone);
      addText(
        `正态事件：${normalEventText(event, correction)}；Y ~ N(${simpleNumber(mean)}, ${simpleNumber(variance)})`,
        chartHeight + 104,
        13,
        colors.muted,
      );
      addText(
        hidden
          ? "数值结果已隐藏 · 先预测，再比较"
          : `二项概率 ≈ ${formatProbability(exact)}    正态近似 ${normal === null ? "不适用" : "≈ " + formatProbability(normal)}    绝对误差 ${gap === null ? "—" : "≈ " + formatProbability(gap)}`,
        chartHeight + 132,
        13,
      );
      imageUrl = URL.createObjectURL(
        new Blob([new XMLSerializer().serializeToString(outer)], {
          type: "image/svg+xml;charset=utf-8",
        }),
      );
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("图像生成失败"));
        img.src = imageUrl!;
      });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(width * 2);
      canvas.height = Math.ceil(height * 2);
      canvas
        .getContext("2d")!
        .drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value ? resolve(value) : reject(new Error("图片导出失败")),
          "image/png",
        ),
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Mathroom-binomial-n${n}-p${p}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      setNotice("图像已导出");
    } catch {
      setNotice("导出未完成，请重试");
    } finally {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      setExporting(false);
    }
  };

  return (
    <div className="stat-app">
      <header className="stat-header">
        <a className="stat-back" href="/" aria-label="返回 Mathroom 首页">
          <ArrowLeft size={16} />
          <span className="stat-wordmark">
            mathroom<span>·</span>
          </span>
        </a>
        <span className="stat-header-divider" />
        <span className="stat-section-name">概率与统计</span>
        <span className="stat-header-spacer" />
        <span className="stat-save-status">
          {saved ? (
            <>
              <Check size={13} /> 本机已保存
            </>
          ) : (
            "当前未保存"
          )}
        </span>
        <button
          className="stat-icon-button"
          onClick={toggleTheme}
          aria-label={theme === "light" ? "切换深色模式" : "切换浅色模式"}
        >
          {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
        </button>
      </header>
      <div className="stat-layout">
        <aside className="stat-sidebar" aria-label="统计参数与事件">
          <div className="stat-sidebar-title">
            <span className="stat-eyebrow">分布实验室</span>
            <span className="stat-course">S1 · 正态近似</span>
            <h1>
              二项分布
              <br />
              <span>与正态近似</span>
            </h1>
            <p>把离散的概率，放进连续的面积。</p>
          </div>
          <section className="stat-control-section">
            <h2>
              <span>01</span> 定义随机变量{" "}
              <span className="stat-variable-symbol">X</span>
            </h2>
            <div className="stat-formula">
              <StaticMath value={`X\\sim \\operatorname{B}(${n},${p})`} />
            </div>
            <div className="stat-parameter">
              <div className="stat-field-heading">
                <label htmlFor="stat-n">
                  试验次数 <i>n</i>
                </label>
                <NumberField
                  label="试验次数 n"
                  value={n}
                  min={1}
                  max={200}
                  onChange={changeN}
                />
              </div>
              <input
                id="stat-n"
                aria-label="调整试验次数"
                type="range"
                min={1}
                max={200}
                step={1}
                value={n}
                onChange={(e) => changeN(Number(e.target.value))}
              />
              <div className="stat-range-labels">
                <span>1</span>
                <span>200</span>
              </div>
            </div>
            <div className="stat-parameter">
              <div className="stat-field-heading">
                <label htmlFor="stat-p">
                  成功概率 <i>p</i>
                </label>
                <NumberField
                  label="成功概率 p"
                  value={p}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(next) => update({ p: next })}
                />
              </div>
              <input
                id="stat-p"
                aria-label="调整成功概率"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={p}
                onChange={(e) => update({ p: Number(e.target.value) })}
              />
              <div className="stat-range-labels">
                <span>0</span>
                <span>1</span>
              </div>
            </div>
            <p className="stat-condition">
              固定次数 · 相互独立 · 每次成功概率相同
            </p>
          </section>
          <section className="stat-control-section">
            <h2>
              <span>02</span> 选择事件
            </h2>
            <div className="stat-event-tabs" aria-label="事件类型">
              {(
                [
                  ["interval", "区间"],
                  ["left", "左尾"],
                  ["right", "右尾"],
                  ["point", "单点"],
                ] as [EventKind, string][]
              ).map(([kind, label]) => (
                <button
                  key={kind}
                  aria-pressed={event.kind === kind}
                  className={event.kind === kind ? "active" : ""}
                  onClick={() => updateEvent({ kind })}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="stat-event-editor">
              {event.kind === "interval" ? (
                <>
                  <NumberField
                    label="事件下界"
                    value={event.a}
                    min={0}
                    max={n}
                    onChange={(v) => boundary("a", v)}
                  />
                  <button
                    className="stat-relation"
                    aria-label="切换下界是否包含"
                    title="切换严格或非严格不等式"
                    onClick={() =>
                      updateEvent({ includeLower: !event.includeLower })
                    }
                  >
                    {event.includeLower ? "≤" : "<"}
                  </button>
                  <i>X</i>
                  <button
                    className="stat-relation"
                    aria-label="切换上界是否包含"
                    title="切换严格或非严格不等式"
                    onClick={() =>
                      updateEvent({ includeUpper: !event.includeUpper })
                    }
                  >
                    {event.includeUpper ? "≤" : "<"}
                  </button>
                  <NumberField
                    label="事件上界"
                    value={event.b}
                    min={0}
                    max={n}
                    onChange={(v) => boundary("b", v)}
                  />
                </>
              ) : (
                <>
                  <i>X</i>
                  {event.kind === "point" ? (
                    <span>=</span>
                  ) : (
                    <button
                      className="stat-relation"
                      aria-label="切换边界是否包含"
                      title="切换严格或非严格不等式"
                      onClick={() =>
                        updateEvent(
                          event.kind === "left"
                            ? { includeUpper: !event.includeUpper }
                            : { includeLower: !event.includeLower },
                        )
                      }
                    >
                      {event.kind === "left"
                        ? event.includeUpper
                          ? "≤"
                          : "<"
                        : event.includeLower
                          ? "≥"
                          : ">"}
                    </button>
                  )}
                  <NumberField
                    label="事件边界"
                    value={event.a}
                    min={0}
                    max={n}
                    onChange={(v) => boundary("a", v)}
                  />
                </>
              )}
            </div>
            <p className="stat-event-hint">
              {selectedText}
              <br />
              可点击不等号，或拖动图下方的边界。
            </p>
          </section>
          <section className="stat-control-section stat-approx-settings">
            <h2>
              <span>03</span> 对照正态近似
            </h2>
            <label className="stat-toggle-row">
              <span>显示正态曲线</span>
              <input
                type="checkbox"
                checked={showNormal}
                onChange={(e) => update({ showNormal: e.target.checked })}
              />
              <span className="stat-switch" aria-hidden="true" />
            </label>
            <label className="stat-toggle-row">
              <span>
                连续性修正 <small>± 0.5</small>
              </span>
              <input
                type="checkbox"
                checked={correction}
                onChange={(e) => update({ correction: e.target.checked })}
              />
              <span className="stat-switch" aria-hidden="true" />
            </label>
            <div className="stat-moments">
              <div>
                <small>均值 μ = np</small>
                <strong>{simpleNumber(mean)}</strong>
              </div>
              <div>
                <small>方差 σ² = np(1−p)</small>
                <strong>{simpleNumber(variance)}</strong>
              </div>
            </div>
          </section>
          <button
            className="stat-reset"
            onClick={() => applyPreset(DEFAULT_LAB)}
          >
            <RotateCcw size={14} />
            恢复初始示例
          </button>
        </aside>
        <main className="stat-main">
          <div className="stat-workspace-heading">
            <div>
              <div className="stat-eyebrow">EXPLORE / 01</div>
              <h2>从一根概率柱，到一片面积。</h2>
            </div>
            <div className="stat-actions">
              <button
                onClick={() => setHidden(!hidden)}
                aria-label={hidden ? "显示结果" : "隐藏结果"}
                aria-pressed={hidden}
              >
                {hidden ? <Eye size={15} /> : <EyeOff size={15} />}
                <span>{hidden ? "显示结果" : "隐藏结果"}</span>
              </button>
              <button
                onClick={exportPng}
                aria-label="导出图片"
                disabled={exporting}
              >
                <Download size={15} />
                <span>{exporting ? "导出中" : "导出图片"}</span>
              </button>
            </div>
          </div>
          <section className="stat-figure" aria-label="分布对照">
            <div className="stat-figure-top">
              <div className="stat-legend">
                <span>
                  <b className="stat-key-bars" />
                  二项分布
                </span>
                <span>
                  <b className="stat-key-selected" />
                  选中事件
                </span>
                {showNormal && (
                  <span>
                    <b className="stat-key-line" />
                    正态近似
                  </span>
                )}
              </div>
              <span className="stat-drag-hint">拖动边界 · 观察面积</span>
            </div>
            <DistributionChart
              state={state}
              masses={masses}
              dark={theme === "dark"}
              hidden={hidden}
              svgRef={svgRef}
              onBoundary={boundary}
            />
            <div className="stat-event-bridge">
              <span className="stat-bridge-label">事件转换</span>
              <strong>{eventText(event)}</strong>
              <ArrowRight size={18} />
              <strong className="stat-normal-event">
                {normalEventText(event, correction)}
              </strong>
              <span
                className={`stat-correction-badge ${correction ? "" : "off"}`}
              >
                {correction ? "已修正" : "未修正"}
              </span>
            </div>
            <div className="stat-results" aria-live="polite">
              <div className="stat-result">
                <div>
                  <span className="stat-dot" />
                  二项概率<small>按分布直接求和</small>
                </div>
                <strong data-testid="binomial-result">
                  {hidden ? "— —" : formatProbability(exact)}
                </strong>
                <span>
                  {hidden ? "先做预测，再揭示结果" : `P(${eventText(event)})`}
                </span>
              </div>
              <div className="stat-result stat-result-normal">
                <div>
                  <span className="stat-dot" />
                  正态近似
                  <small>
                    {correction ? "含连续性修正" : "未作连续性修正"}
                  </small>
                </div>
                <strong data-testid="normal-result">
                  {hidden
                    ? "— —"
                    : normal === null
                      ? "不适用"
                      : formatProbability(normal)}
                </strong>
                <span>
                  {normal === null
                    ? "σ = 0，无法使用正态近似"
                    : `Y ∼ N(${simpleNumber(mean)}, ${simpleNumber(variance)})`}
                </span>
              </div>
              <div className="stat-result stat-result-error">
                <div>
                  绝对误差<small>两种概率之差的绝对值</small>
                </div>
                <strong data-testid="error-result">
                  {hidden ? "— —" : gap === null ? "—" : formatProbability(gap)}
                </strong>
                <span>
                  {hidden
                    ? "比较前，先判断哪一个更大"
                    : gap === null
                      ? "当前二项分布退化为单点"
                      : `约 ${Number((gap * 100).toPrecision(3))} 个百分点`}
                </span>
              </div>
            </div>
          </section>
          <div
            className={`stat-insight ${approxWeak ? "stat-insight-caution" : ""}`}
          >
            <Lightbulb size={18} />
            <div>
              <strong>
                {sd === 0
                  ? "所有概率都集中在一个取值上。"
                  : approxWeak
                    ? "分布偏斜时，连续性修正也不能保证近似良好。"
                    : event.kind === "point"
                      ? "一个整数取值，对应一段宽度为 1 的区间。"
                      : "修正的方向，由选中的整数决定。"}
              </strong>
              <p>
                {sd === 0
                  ? "p 为 0 或 1 时方差为 0。二项概率仍可直接求得，正态近似暂停。"
                  : approxWeak
                    ? `当前 np = ${simpleNumber(mean)}，n(1−p) = ${simpleNumber(n * (1 - p))}。观察精确计算与近似的差别；样本条件和事件位置都会影响误差。`
                    : event.kind === "point"
                      ? `正态变量的单点概率为 0。打开修正后，用 ${event.a - 0.5} 到 ${event.a + 0.5} 的面积近似 P(X = ${event.a})。`
                      : "每根概率柱覆盖 k−0.5 到 k+0.5。先确定保留哪些整数，再沿最外侧柱的边缘取连续区域。"}
              </p>
            </div>
          </div>
          <section className="stat-experiments" aria-label="试一试不同情景">
            <div className="stat-experiment-heading">
              <h2>换一个角度，再看一次</h2>
              <span>三个小实验</span>
            </div>
            <div className="stat-presets">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => applyPreset(preset.state)}
                >
                  <span className="stat-preset-index">{preset.label}</span>
                  <div>
                    <strong>{preset.title}</strong>
                    <span>{preset.note}</span>
                  </div>
                  <ArrowRight size={16} />
                </button>
              ))}
            </div>
          </section>
          <details className="stat-details">
            <summary>
              计算依据与当前范围 <ChevronDown size={14} />
            </summary>
            <p>
              本样板支持 1–200
              次二项试验，以及区间、单尾和单点事件。二项概率按原分布求和，以浮点数显示；正态参数为
              μ=np、σ²=np(1−p)。图中柱宽为
              1，柱高与面积均对应单点概率。正态曲线纵轴为密度。
            </p>
            <p>
              图形展示有限视窗，正态尾部概率按完整事件计算。开关“显示正态曲线”只影响图形；开关“连续性修正”同时改变正态事件和计算。较小的
              np 或 n(1−p) 是近似可能不佳的提示，不是普适的合格阈值。
            </p>
            <p>
              输入超出范围或未完成时保留最近有效模型，离开输入框后恢复有效数值。参数在当前浏览器本机保存；本样板尚不包含抽样模拟、置信区间或假设检验。
            </p>
          </details>
        </main>
      </div>
      {notice && (
        <div className="stat-toast" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
