import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  ArrowUpRight,
  Moon,
  Sun,
  Search,
  Circle,
  Box,
  Link2,
} from "lucide-react";
import {
  objectCatalog,
  glyphMarkup,
  glyphCSS,
  compositionMarkup,
  type ObjectSpec,
  type ObjectCategory,
} from "./mechanics-objects/art";
import { useColorTheme } from "./useColorTheme";
import "./object-gallery.css";

const groups: {
  id: ObjectCategory;
  name: string;
  description: string;
  icon: typeof Circle;
}[] = [
  {
    id: "particle",
    name: "质点外观",
    description: "保留辨识度，共用平移模型",
    icon: Circle,
  },
  {
    id: "rigid",
    name: "刚体形状",
    description: "让轮廓表达质量分布",
    icon: Box,
  },
  {
    id: "constraint",
    name: "约束与环境",
    description: "清楚表达支承和连接",
    icon: Link2,
  },
];
function Art({
  spec,
  variant,
  anchors = false,
  center = false,
  selected = false,
  contact = false,
}: {
  spec: ObjectSpec;
  variant?: string;
  anchors?: boolean;
  center?: boolean;
  selected?: boolean;
  contact?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 220 140"
      role="img"
      aria-label={`${spec.name}外形`}
      dangerouslySetInnerHTML={{
        __html: glyphMarkup(spec, variant ?? spec.variants[0].id, {
          anchors,
          center,
          selected,
          contact,
        }),
      }}
    />
  );
}
function Composition({ kind }: { kind: "slope" | "pulley" | "rod" }) {
  return (
    <svg
      viewBox="0 0 280 230"
      role="img"
      aria-label={
        kind === "slope"
          ? "物块与斜面组合"
          : kind === "pulley"
            ? "双悬重与滑轮组合"
            : "铰接杆与弹性连接组合"
      }
      dangerouslySetInnerHTML={{ __html: compositionMarkup(kind) }}
    />
  );
}
function Gallery() {
  const { theme, toggleTheme } = useColorTheme();
  const [category, setCategory] = useState<ObjectCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("P02");
  const [variant, setVariant] = useState("block");
  const [anchors, setAnchors] = useState(false),
    [center, setCenter] = useState(false),
    [selection, setSelection] = useState(false);
  const active = objectCatalog.find((o) => o.id === selected)!;
  const items = objectCatalog.filter(
    (o) =>
      (category === "all" || o.category === category) &&
      `${o.name} ${o.english} ${o.variants.map((v) => v.name).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  function choose(o: ObjectSpec) {
    setSelected(o.id);
    setVariant(o.variants[0].id);
    if (window.matchMedia("(max-width:720px)").matches)
      document.getElementById("object-detail")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion:reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
  }
  return (
    <div className="object-page">
      <style>{glyphCSS}</style>
      <header className="object-header">
        <a href="/mechanics.html" className="object-back">
          <ArrowLeft size={17} />
          力学实验台
        </a>
        <a href="/" className="object-brand">
          mathroom<span>数学探索室</span>
        </a>
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={theme === "light" ? "切换深色模式" : "切换浅色模式"}
        >
          {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
        </button>
      </header>
      <main className="object-main">
        <section className="object-intro">
          <div>
            <span className="object-eyebrow">MECHANICS / OBJECT LIBRARY</span>
            <h1>物体与连接</h1>
            <p>用清晰的轮廓，搭建可以理解的力学情境。</p>
          </div>
          <div className="object-count">
            <strong>28</strong>
            <span>
              基础外形
              <br />M · FM · 历史 M2
            </span>
          </div>
        </section>
        <div className="object-palette">
          <span>
            <i className="palette-body" />
            物体
          </span>
          <span>
            <i className="palette-environment" />
            支承与环境
          </span>
          <span>
            <i className="palette-connector" />
            柔性连接
          </span>
          <span>
            <i className="palette-contact" />
            接触提示
          </span>
          <p>扁平轮廓 · 无渐变 · 按需显示连接点</p>
        </div>
        <div className="object-layout">
          <section className="object-library" aria-label="物体外形库">
            <div className="object-toolbar">
              <div className="object-tabs" role="group" aria-label="物体分类">
                <button
                  aria-pressed={category === "all"}
                  onClick={() => setCategory("all")}
                >
                  全部 <small>28</small>
                </button>
                {groups.map((g) => (
                  <button
                    key={g.id}
                    aria-pressed={category === g.id}
                    onClick={() => setCategory(g.id)}
                  >
                    {g.name}{" "}
                    <small>
                      {objectCatalog.filter((o) => o.category === g.id).length}
                    </small>
                  </button>
                ))}
              </div>
              <label className="object-search">
                <Search size={15} />
                <input
                  aria-label="查找物体"
                  placeholder="查找物体"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            </div>
            {items.length === 0 && (
              <p className="object-empty">
                没有匹配的物体。可以试试“绳”“板”或“球”。
              </p>
            )}
            {groups.map((group) => {
              const inGroup = items.filter((o) => o.category === group.id);
              if (!inGroup.length) return null;
              return (
                <section className="object-group" key={group.id}>
                  <div className="object-group-heading">
                    <group.icon size={15} />
                    <h2>{group.name}</h2>
                    <span>{group.description}</span>
                  </div>
                  <div className="object-grid">
                    {inGroup.map((o) => (
                      <button
                        className={`object-tile ${selected === o.id ? "is-active" : ""}`}
                        aria-pressed={selected === o.id}
                        key={o.id}
                        onClick={() => choose(o)}
                      >
                        <div className="object-tile-art">
                          <Art spec={o} />
                        </div>
                        <div className="object-tile-caption">
                          <strong>{o.name}</strong>
                          <span>
                            {o.variants.length > 1
                              ? `${o.variants.length} 种变体`
                              : "基础形态"}
                          </span>
                        </div>
                        <small>{o.english}</small>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </section>
          <aside
            id="object-detail"
            className="object-inspector"
            aria-label="外形详情"
          >
            <div className="object-inspector-top">
              <span>外形预览</span>
              <small>
                {groups.find((g) => g.id === active.category)?.name}
              </small>
            </div>
            <div className="object-preview">
              <Art
                spec={active}
                variant={variant}
                anchors={anchors}
                center={center}
                selected={selection}
                contact={selection && active.id === "P02"}
              />
            </div>
            <h2>{active.name}</h2>
            <p className="object-visual-note">{active.visual}</p>
            <div className="object-variants" role="group" aria-label="外形变体">
              {active.variants.map((v) => (
                <button
                  key={v.id}
                  aria-pressed={variant === v.id}
                  onClick={() => setVariant(v.id)}
                >
                  {v.name}
                </button>
              ))}
            </div>
            <div className="object-switches">
              <label>
                <input
                  type="checkbox"
                  checked={anchors}
                  onChange={(e) => setAnchors(e.target.checked)}
                />
                显示连接点
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={center}
                  onChange={(e) => setCenter(e.target.checked)}
                  disabled={!active.center}
                />
                显示参考点
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={selection}
                  onChange={(e) => setSelection(e.target.checked)}
                />
                查看选中状态
              </label>
            </div>
            <p className="object-anchor-note">
              参考点用于图形定位，质心由题目或模型确定。
            </p>
            <div className="object-model-note">
              <span>在力学中</span>
              <p>{active.note}</p>
            </div>
            <a className="object-lab-link" href="/mechanics.html">
              返回实验台
              <ArrowUpRight size={16} />
            </a>
          </aside>
        </div>
        <section className="object-compositions">
          <div className="object-section-heading">
            <h2>放在一起，也保持清楚</h2>
            <p>组合外观示意 · 不代表已接入这些运动模型</p>
          </div>
          <div className="object-composition-grid">
            {(
              [
                {
                  kind: "slope",
                  title: "物块与平面",
                  note: "接触边清楚，选中时再显示接触提示。",
                },
                {
                  kind: "pulley",
                  title: "滑轮与连接体",
                  note: "绳与轮缘衔接，独立物体保持同一视觉尺度。",
                },
                {
                  kind: "rod",
                  title: "支点与刚体",
                  note: "质量杆、弹性连接与固定支座可以直接区分。",
                },
              ] as const
            ).map((c) => (
              <article key={c.kind}>
                <Composition kind={c.kind} />
                <h3>{c.title}</h3>
                <p>{c.note}</p>
              </article>
            ))}
          </div>
        </section>
        <footer className="object-footer">
          <span>外形设计 v1 · 依据题库物体画像</span>
          <span>外观、物理模型与约束分别定义</span>
        </footer>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Gallery />);
