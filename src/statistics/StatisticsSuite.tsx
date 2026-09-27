import { Component, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  Menu,
  Moon,
  Redo2,
  RotateCcw,
  Save,
  Sun,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { useColorTheme } from "../useColorTheme";
import { WorkspaceBrand } from "../WorkspaceBrand";
import { dataTools } from "./data";
import { distributionTools } from "./distributions";
import { inferenceTools } from "./inference";
import { samplingTools } from "./SamplingTool";
import { activityTools, ActivityRibbon } from "./ActivitiesTool";
import { legacyTools } from "./LegacyTool";
import { StatisticsProvider, useStatisticsWorkspace } from "./workspace";
import { Notice } from "./shared";
import type { Course, ToolGroup, ToolSpec } from "./workspace-types";

const toolOrder = [
  "data",
  "counting",
  "probability",
  "discrete",
  "normal",
  "poisson",
  "combinations",
  "continuous",
  "pgf",
  "sampling",
  "intervals",
  "tests",
  "means",
  "chi-square",
  "ranks",
  "activities",
  "legacy",
];
const TOOLS: ToolSpec[] = [
  ...dataTools,
  ...distributionTools,
  ...samplingTools,
  ...inferenceTools,
  ...activityTools,
  ...legacyTools,
].sort((a, b) => toolOrder.indexOf(a.id) - toolOrder.indexOf(b.id));
const GROUPS: ToolGroup[] = [
  "数据与图表",
  "随机试验",
  "分布与变量",
  "抽样与估计",
  "假设检验",
  "课堂探究",
];

class ToolErrorBoundary extends Component<
  { children: ReactNode; resetKey: unknown },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  componentDidUpdate(previous: { children: ReactNode; resetKey: unknown }) {
    if (this.state.error && previous.resetKey !== this.props.resetKey)
      this.setState({ error: "" });
  }
  render() {
    return this.state.error ? (
      <Notice tone="warning">
        当前输入无法继续计算：{this.state.error}
        。可以撤销或恢复此工具示例；原始输入仍保留在作品中。
      </Notice>
    ) : (
      this.props.children
    );
  }
}
function downloadFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.append(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 30000);
}
function WorkspaceShell() {
  const workspace = useStatisticsWorkspace(),
    { theme, toggleTheme } = useColorTheme();
  const [filter, setFilter] = useState<Course | "全部">("全部"),
    [menu, setMenu] = useState(false),
    [worksOpen, setWorksOpen] = useState(false),
    [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null),
    content = useRef<HTMLElement>(null);
  const tool =
    TOOLS.find((t) => t.id === workspace.document.activeTool) ?? TOOLS[0];
  const Active = tool.component;
  const navigate = (id: string) => {
    workspace.navigate(id);
    setMenu(false);
    content.current?.scrollTo({ top: 0 });
  };
  const exportPlots = () => {
    const plots = Array.from(
      content.current?.querySelectorAll<SVGSVGElement>(
        'svg[role="img"],svg[role="group"]',
      ) ?? [],
    ).filter((svg) => svg.viewBox.baseVal.width > 100);
    if (!plots.length) {
      setMessage("当前工具没有可导出的图形；可以导出 JSON 保留输入与结果。");
      return;
    }
    const ns = "http://www.w3.org/2000/svg",
      outer = document.createElementNS(ns, "svg");
    let offset = 65;
    const width = 960;
    const background = document.createElementNS(ns, "rect");
    background.setAttribute("width", "100%");
    background.setAttribute("height", "100%");
    background.setAttribute(
      "fill",
      getComputedStyle(document.documentElement).getPropertyValue(
        "--canvas-bg",
      ),
    );
    outer.append(background);
    const title = document.createElementNS(ns, "text");
    title.setAttribute("x", "25");
    title.setAttribute("y", "32");
    title.setAttribute("font-size", "20");
    title.setAttribute(
      "fill",
      getComputedStyle(document.documentElement).getPropertyValue("--ink"),
    );
    title.textContent = `Mathroom · ${tool.title}`;
    outer.append(title);
    for (const svg of plots) {
      const clone = svg.cloneNode(true) as SVGSVGElement;
      const from = [svg, ...svg.querySelectorAll("*")],
        to = [clone, ...clone.querySelectorAll("*")];
      from.forEach((node, i) => {
        const computed = getComputedStyle(node);
        for (const key of [
          "fill",
          "stroke",
          "stroke-width",
          "font-size",
          "font-family",
          "font-weight",
          "opacity",
        ])
          to[i].setAttribute(key, computed.getPropertyValue(key));
      });
      const h =
        (svg.viewBox.baseVal.height / Math.max(1, svg.viewBox.baseVal.width)) *
        width;
      clone.setAttribute("x", "0");
      clone.setAttribute("y", String(offset));
      clone.setAttribute("width", String(width));
      clone.setAttribute("height", String(h));
      outer.append(clone);
      offset += h + 20;
    }
    outer.setAttribute("width", String(width));
    outer.setAttribute("height", String(offset));
    outer.setAttribute("viewBox", `0 0 ${width} ${offset}`);
    downloadFile(
      new Blob([new XMLSerializer().serializeToString(outer)], {
        type: "image/svg+xml",
      }),
      `Mathroom-${tool.id}.svg`,
    );
    setMessage("已导出本工具的图形。JSON 作品保留完整输入与计算条件。");
  };
  if (!workspace.ready)
    return <div className="stats-loading">正在打开统计工作台…</div>;
  return (
    <div className="stats-suite">
      <header className="stats-suite-header">
        <WorkspaceBrand label="概率与统计" />
        <div className="stats-header-space" />
        <small>{workspace.storageStatus}</small>
        <button
          className="stats-icon"
          onClick={() => setWorksOpen(!worksOpen)}
          aria-label="作品与保存"
        >
          <FolderOpen size={18} />
        </button>
        <button
          className="stats-icon"
          onClick={toggleTheme}
          aria-label={theme === "light" ? "切换深色模式" : "切换浅色模式"}
        >
          {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
        </button>
        <button
          className="stats-icon stats-mobile-menu"
          onClick={() => setMenu(!menu)}
          aria-label="选择统计工具"
        >
          {menu ? <X size={18} /> : <Menu size={18} />}
        </button>
      </header>
      <div className="stats-suite-layout">
        <aside
          className={`stats-suite-nav ${menu ? "open" : ""}`}
          aria-label="统计工具导航"
        >
          <div className="stats-nav-intro">
            <small>STATISTICS WORKSPACE</small>
            <h1>从数据，走向推断。</h1>
          </div>
          <div className="stats-course-tabs" aria-label="课程筛选">
            {(["全部", "S1", "S2", "FS"] as const).map((c) => (
              <button
                key={c}
                aria-pressed={c === filter}
                onClick={() => setFilter(c)}
              >
                {c}
              </button>
            ))}
          </div>
          {GROUPS.map((group) => {
            const list = TOOLS.filter(
              (t) =>
                t.group === group &&
                (filter === "全部" || t.courses.includes(filter)),
            );
            return list.length ? (
              <section key={group}>
                <h2>{group}</h2>
                {list.map((t) => (
                  <button
                    key={t.id}
                    className={`stats-nav-item ${tool.id === t.id ? "active" : ""}`}
                    onClick={() => navigate(t.id)}
                    aria-current={tool.id === t.id ? "page" : undefined}
                  >
                    <span>{t.title}</span>
                    <small>
                      {t.courses.filter((c) => c !== "拓展").join(" · ")}
                    </small>
                  </button>
                ))}
              </section>
            ) : null;
          })}
          <a className="stats-demo-link" href="/statistics-demo.html">
            二项近似 · 原样板 <ArrowRight size={14} />
          </a>
          <div className="stats-nav-footer">
            选择对象，提出问题，观察变化。
            <br />
            课程标签包含所需的前置与衔接知识。
          </div>
        </aside>
        {menu && (
          <button
            className="stats-menu-scrim"
            aria-label="关闭工具导航"
            onClick={() => setMenu(false)}
          />
        )}
        <main className="stats-suite-main" ref={content}>
          <div className="stats-tool-heading">
            <div>
              <small>
                {tool.group} / {tool.courses.join(" · ")}
              </small>
              <h1>{tool.title}</h1>
              <p>{tool.description}</p>
            </div>
            <div className="stats-tool-actions">
              <button
                className="stats-icon"
                onClick={workspace.undo}
                disabled={!workspace.canUndo}
                aria-label="撤销"
              >
                <Undo2 size={17} />
              </button>
              <button
                className="stats-icon"
                onClick={workspace.redo}
                disabled={!workspace.canRedo}
                aria-label="重做"
              >
                <Redo2 size={17} />
              </button>
              <button
                className="stats-icon"
                onClick={() =>
                  workspace.setResultsHidden(!workspace.resultsHidden)
                }
                aria-label={workspace.resultsHidden ? "显示结果" : "隐藏结果"}
                aria-pressed={workspace.resultsHidden}
              >
                {workspace.resultsHidden ? (
                  <Eye size={18} />
                ) : (
                  <EyeOff size={18} />
                )}
              </button>
              <button
                className="stats-icon"
                onClick={() => workspace.resetTool(tool.id)}
                aria-label="恢复此工具示例"
              >
                <RotateCcw size={17} />
              </button>
              <button
                className="stats-icon"
                onClick={exportPlots}
                aria-label="导出本工具图形"
              >
                <Download size={17} />
              </button>
            </div>
          </div>
          {workspace.resultsHidden && (
            <Notice>结果暂时隐藏。先作预测，再用右上角的眼睛按钮揭示。</Notice>
          )}
          <ActivityRibbon />
          <ToolErrorBoundary
            key={tool.id}
            resetKey={workspace.document.states[tool.id]}
          >
            <Active />
          </ToolErrorBoundary>
          {message && (
            <div className="stats-message" role="status">
              {message}
              <button aria-label="关闭提示" onClick={() => setMessage("")}>
                ×
              </button>
            </div>
          )}
        </main>
      </div>
      {worksOpen && (
        <div
          className="stats-modal-overlay"
          onClick={() => setWorksOpen(false)}
        >
          <section
            className="stats-works"
            role="dialog"
            aria-modal="true"
            aria-label="作品与保存"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h2>我的统计作品</h2>
              <button
                className="stats-icon"
                aria-label="关闭作品面板"
                onClick={() => setWorksOpen(false)}
              >
                <X size={18} />
              </button>
            </header>
            <label className="stats-field">
              <span>作品名称</span>
              <input
                className="stats-input"
                aria-label="作品名称"
                maxLength={80}
                value={workspace.document.title}
                onChange={(e) => workspace.rename(e.target.value)}
              />
            </label>
            <p>
              当前输入自动保存在本机。另存快照可保留一次探究，JSON
              文件可在另一台设备恢复。
            </p>
            <div className="stats-toolbar">
              <button
                className="stats-button primary"
                onClick={async () => {
                  try {
                    await workspace.saveNamed();
                    setMessage("已保存一份作品快照");
                  } catch {
                    setMessage("本机快照保存失败，请使用 JSON 导出");
                  }
                }}
              >
                <Save size={15} />
                另存快照
              </button>
              <button
                className="stats-button"
                onClick={() =>
                  downloadFile(
                    new Blob([JSON.stringify(workspace.document, null, 2)], {
                      type: "application/octet-stream",
                    }),
                    `${workspace.document.title || "统计作品"}.json`,
                  )
                }
              >
                <Download size={15} />
                导出 JSON
              </button>
              <button
                className="stats-button"
                onClick={() => fileInput.current?.click()}
              >
                <Upload size={15} />
                导入 JSON
              </button>
              <input
                hidden
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    if (file.size > 2000000)
                      throw new Error("作品文件超过 2 MB");
                    workspace.importDocument(await file.text());
                    setWorksOpen(false);
                    setMessage("作品已导入，可以撤销恢复导入前状态");
                  } catch (error) {
                    setMessage(
                      error instanceof Error ? error.message : "文件无法读取",
                    );
                  }
                  e.target.value = "";
                }}
              />
            </div>
            <div className="stats-saved-list">
              {workspace.savedWorks.length ? (
                workspace.savedWorks.map((work) => (
                  <div key={work.id} className="stats-saved-row">
                    <button
                      onClick={() => {
                        try {
                          workspace.openWork(work.id);
                          setWorksOpen(false);
                        } catch (e) {
                          setMessage(
                            e instanceof Error ? e.message : "作品无效",
                          );
                        }
                      }}
                    >
                      <span>{work.title || "未命名作品"}</span>
                      <small>{new Date(work.updatedAt).toLocaleString()}</small>
                      <ArrowRight size={16} />
                    </button>
                    <button
                      className="stats-icon"
                      aria-label={`导出快照 ${work.title}`}
                      onClick={() =>
                        downloadFile(
                          new Blob([JSON.stringify(work.document, null, 2)], {
                            type: "application/octet-stream",
                          }),
                          `${work.title || "统计作品"}.json`,
                        )
                      }
                    >
                      <Download size={16} />
                    </button>
                  </div>
                ))
              ) : (
                <p>尚未另存作品快照。</p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
export function StatisticsSuite() {
  return (
    <StatisticsProvider tools={TOOLS}>
      <WorkspaceShell />
    </StatisticsProvider>
  );
}
