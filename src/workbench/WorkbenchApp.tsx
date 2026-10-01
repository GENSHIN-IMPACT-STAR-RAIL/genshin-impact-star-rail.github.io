import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  Copy,
  Download,
  Grid2X2,
  Hand,
  Layers,
  Minus,
  MousePointer2,
  Plus,
  Redo2,
  RotateCcw,
  Search,
  Settings2,
  Sun,
  Moon,
  Trash2,
  Undo2,
  X,
  CheckCircle2,
  Maximize2,
  Link2,
} from "lucide-react";
import { objectCatalog, glyphCSS } from "../mechanics-objects/art";
import { StaticMath } from "../StaticMath";
import { useColorTheme } from "../useColorTheme";
import { WorkspaceBrand } from "../WorkspaceBrand";
import { WorkbenchCanvas, type CanvasHandle } from "./WorkbenchCanvas";
import { Miniature } from "./graphics";
import {
  EMPTY_SCENE,
  DEFAULT_CAMERA,
  STORAGE_KEY,
  cloneScene,
  makeObject,
  specFor,
  switchVariant,
  restoreScene,
  loadStoredScene,
  validateScene,
  fitCamera,
  zoomAt,
  placement,
  type Scene,
  type SceneObject,
  type Camera,
  type ObjectProps,
  type SceneIssue,
} from "./model";
import { PlaneEditor, ConnectionEditor } from "./ConnectionEditor";
import {
  syncConnections,
  isConnector,
  bindEndpoint,
  anchorPosition,
  anchorLabel,
  patchSceneObject,
  removeSceneObjects,
  resolvedEndpoints,
  type AnchorRef,
  type ConnectionIntent,
} from "./relations";
import "./workbench.css";

const compact = () => window.matchMedia("(max-width:900px)").matches;
function Numeric({
  label,
  symbol,
  value,
  onChange,
  unit = "",
  min,
  max,
  step = 0.1,
}: {
  label: string;
  symbol?: string;
  value: number;
  onChange: (n: number) => void;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="wb-field">
      <span>
        {label}
        {symbol && (
          <>
            {" "}
            <StaticMath value={symbol} />
          </>
        )}
      </span>
      <div>
        <input
          aria-label={label}
          type="number"
          value={Number.isFinite(value) ? value : ""}
          min={min}
          max={max}
          step={step}
          onChange={(e) =>
            onChange(e.target.value === "" ? NaN : Number(e.target.value))
          }
        />
        <small>{unit}</small>
      </div>
    </label>
  );
}
export default function WorkbenchApp() {
  const { theme, toggleTheme } = useColorTheme();
  const [scene, setScene] = useState<Scene>(() => {
    try {
      return loadStoredScene(localStorage) ?? cloneScene(EMPTY_SCENE);
    } catch {
      return cloneScene(EMPTY_SCENE);
    }
  });
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const [selected, setSelected] = useState<string | null>(null),
    [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA),
    [showCoordinates, setShowCoordinates] = useState(true);
  const [drawer, setDrawer] = useState(() => !compact()),
    [inspector, setInspector] = useState(() => !compact()),
    [category, setCategory] = useState<"particle" | "rigid" | "constraint">(
      "particle",
    ),
    [query, setQuery] = useState("");
  const [mode, setMode] = useState<"select" | "pan">("select"),
    [placing, setPlacing] = useState<string | null>(null),
    [ghost, setGhost] = useState<{ id: string; x: number; y: number } | null>(
      null,
    );
  const [intent, setIntent] = useState<ConnectionIntent | null>(null),
    [connectionType, setConnectionType] = useState("C05");
  const [past, setPast] = useState<Scene[]>([]),
    [future, setFuture] = useState<Scene[]>([]),
    [issues, setIssues] = useState<SceneIssue[] | null>(null),
    [saveState, setSaveState] = useState("本机自动保存");
  const handle = useRef<CanvasHandle | null>(null),
    drawerGesture = useRef<{
      id: string;
      x: number;
      y: number;
      moved: boolean;
    } | null>(null);
  const object = scene.objects.find((o) => o.id === selected) ?? null;
  const spec = object ? specFor(object.catalogId) : null;
  const shown = objectCatalog.filter(
    (o) =>
      o.category === category &&
      `${o.name} ${o.english} ${o.variants.map((v) => v.name).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  function preview(next: Scene) {
    next = syncConnections(next);
    sceneRef.current = next;
    setScene(next);
    setIssues(null);
  }
  function commit(next: Scene, before = sceneRef.current) {
    try {
      next = syncConnections(next);
    } catch (e) {
      notice((e as Error).message);
      return;
    }
    if (JSON.stringify(next) === JSON.stringify(before)) return;
    setPast((p) => [...p, before].slice(-60));
    setFuture([]);
    preview(next);
  }
  function select(id: string | null) {
    setSelected(id);
    setInspector(true);
  }
  function undo() {
    setIntent(null);
    if (!past.length) return;
    const current = sceneRef.current,
      previous = past[past.length - 1];
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [current, ...f]);
    preview(previous);
    setSelected(null);
  }
  function redo() {
    setIntent(null);
    if (!future.length) return;
    const current = sceneRef.current,
      next = future[0];
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, current].slice(-60));
    preview(next);
    setSelected(null);
  }
  function notice(message: string) {
    setIssues([{ objectId: selected ?? undefined, message }]);
  }
  function updateObject(patch: Partial<SceneObject>) {
    if (!object) return;
    try {
      commit(patchSceneObject(sceneRef.current, object.id, patch));
    } catch (e) {
      notice((e as Error).message);
    }
  }
  function pickConnection(next: ConnectionIntent) {
    setIntent(next);
    setPlacing(null);
    setMode("select");
    if (compact()) setInspector(false);
  }
  function pickAnchor(target: AnchorRef) {
    if (!intent) return;
    try {
      if ("connectorId" in intent) {
        const next = bindEndpoint(
          sceneRef.current,
          intent.connectorId,
          intent.endpoint,
          target,
        );
        commit(next);
        select(intent.connectorId);
        setIntent(null);
        return;
      }
      if (!intent.first) {
        setIntent({ ...intent, first: target });
        return;
      }
      if (sceneRef.current.objects.length >= 200)
        throw Error("本版最多200个物体。");
      const a = anchorPosition(sceneRef.current, intent.first),
        b = anchorPosition(sceneRef.current, target),
        length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length < 0.05) throw Error("请选择两个不同位置的连接点。");
      const connector = makeObject(sceneRef.current, intent.createType, {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
      });
      connector.terminals = { a, b };
      connector.width = length;
      if (connector.catalogId === "C05")
        connector.properties.naturalLength = length;
      if (connector.catalogId === "C11")
        connector.properties.constraintLength = length;
      let next = syncConnections({
        ...sceneRef.current,
        objects: [...sceneRef.current.objects, connector],
      });
      next = bindEndpoint(next, connector.id, "a", intent.first);
      next = bindEndpoint(next, connector.id, "b", target);
      commit(next);
      select(connector.id);
      setIntent(null);
    } catch (e) {
      notice((e as Error).message);
    }
  }
  function property(key: keyof ObjectProps, value: number) {
    if (object)
      updateObject({
        properties: { ...object.properties, [key]: value },
        ...(object.catalogId === "C01" &&
        key === "friction" &&
        Number.isFinite(value) &&
        value >= 0
          ? { variant: value > 0 ? "plane-rough" : "plane-smooth" }
          : {}),
      });
  }
  function environment(patch: Partial<Scene["environment"]>) {
    commit({
      ...sceneRef.current,
      environment: { ...sceneRef.current.environment, ...patch },
    });
  }
  function place(id: string, point: { x: number; y: number }) {
    if (sceneRef.current.objects.length >= 200) {
      setIssues([{ message: "本版搭建最多200个物体，请先删除一些物体。" }]);
      return;
    }
    setIntent(null);
    const next = makeObject(sceneRef.current, id, point);
    commit({
      ...sceneRef.current,
      objects: [...sceneRef.current.objects, next],
    });
    select(next.id);
    setPlacing(null);
    if (compact()) setDrawer(false);
  }
  function remove() {
    if (!selected) return;
    commit(removeSceneObjects(sceneRef.current, new Set([selected])));
    setIntent(null);
    setSelected(null);
  }
  function duplicate() {
    if (!object) return;
    if (scene.objects.length >= 200) {
      setIssues([{ message: "本版最多200个物体。" }]);
      return;
    }
    const clone = {
      ...structuredClone(object),
      id: crypto.randomUUID(),
      name: object.name + " 副本",
      nameSource: "user" as const,
    };
    if (isConnector(clone)) {
      const e = resolvedEndpoints(scene, object);
      clone.terminals = {
        a: { x: e.a.x + 0.4, y: e.a.y + 0.4 },
        b: { x: e.b.x + 0.4, y: e.b.y + 0.4 },
      };
    } else
      Object.assign(
        clone,
        placement(scene, clone, { x: object.x + 0.4, y: object.y + 0.4 }),
      );
    commit({ ...scene, objects: [...scene.objects, clone] });
    select(clone.id);
  }
  function exportScene() {
    const errors = validateScene(scene);
    if (errors.length) {
      setIssues(errors);
      return;
    }
    const blob = new Blob([JSON.stringify(scene, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "力学装置.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const encoded = JSON.stringify(scene);
        if (!restoreScene(encoded)) {
          setSaveState("有无效输入，暂未保存");
          return;
        }
        localStorage.setItem(STORAGE_KEY, encoded);
        setSaveState("已保存到本机");
      } catch {
        setSaveState("本机保存不可用，可导出场景");
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [scene]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        (e.target as HTMLElement)?.closest(
          "input,textarea,select,[contenteditable=true]",
        )
      )
        return;
      if (e.key === "Escape") {
        setIntent(null);
        setPlacing(null);
        setGhost(null);
        setSelected(null);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selected) {
          e.preventDefault();
          remove();
        }
        return;
      }
      if (
        object &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
      ) {
        e.preventDefault();
        const delta = e.shiftKey ? 1 : 0.1;
        const x =
            object.x +
            (e.key === "ArrowRight"
              ? delta
              : e.key === "ArrowLeft"
                ? -delta
                : 0),
          y =
            object.y +
            (e.key === "ArrowUp" ? delta : e.key === "ArrowDown" ? -delta : 0);
        updateObject(placement(scene, object, { x, y }));
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  function drawerDown(e: React.PointerEvent<HTMLButtonElement>, id: string) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawerGesture.current = { id, x: e.clientX, y: e.clientY, moved: false };
    setPlacing(null);
    setIntent(null);
  }
  function drawerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drawerGesture.current;
    if (!d) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) d.moved = true;
    if (d.moved) setGhost({ id: d.id, x: e.clientX, y: e.clientY });
  }
  function drawerUp(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drawerGesture.current;
    if (!d) return;
    if (d.moved) {
      const p = handle.current?.clientWorld({ x: e.clientX, y: e.clientY });
      if (p) place(d.id, p);
    } else {
      setPlacing(d.id);
      setMode("select");
      if (compact()) setDrawer(false);
    }
    drawerGesture.current = null;
    setGhost(null);
  }
  function zoom(factor: number) {
    if (handle.current)
      setCamera(
        zoomAt(
          camera,
          handle.current.size,
          {
            x: handle.current.size.width / 2,
            y: handle.current.size.height / 2,
          },
          factor,
        ),
      );
  }
  const numeric = (
    label: string,
    key: keyof ObjectProps,
    unit: string,
    min?: number,
    max?: number,
    step = 0.1,
    symbol?: string,
  ) =>
    object?.properties[key] === undefined ? null : (
      <Numeric
        label={label}
        symbol={symbol}
        value={object.properties[key]!}
        onChange={(v) => property(key, v)}
        unit={unit}
        min={min}
        max={max}
        step={step}
      />
    );
  return (
    <div className="wb-app">
      <style>{glyphCSS}</style>
      <header className="wb-header">
        <WorkspaceBrand label="力学实验" />
        <div className="wb-header-links">
          <a href="mechanics-objects.html">物体图鉴</a>
          <a href="mechanics-demo.html">演化示例</a>
        </div>
        <button
          className="theme-toggle"
          aria-label={theme === "light" ? "切换深色模式" : "切换浅色模式"}
          onClick={toggleTheme}
        >
          {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
        </button>
      </header>
      <div
        className={`wb-layout ${drawer ? "" : "drawer-closed"} ${inspector ? "" : "inspector-closed"}`}
      >
        {drawer && (
          <aside className={`wb-drawer ${ghost ? "is-dragging" : ""}`}>
            <div className="wb-panel-heading">
              <h2>物体抽屉</h2>
              <button
                className="wb-icon"
                onClick={() => setDrawer(false)}
                aria-label="收起物体抽屉"
              >
                <ChevronLeft size={17} />
              </button>
            </div>
            <p className="wb-subtitle">拖到画布，或先选取再点击放置</p>
            <label className="wb-search">
              <Search size={14} />
              <input
                aria-label="搜索物体"
                placeholder="搜索物体"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="wb-categories" role="group" aria-label="物体类别">
              {(["particle", "rigid", "constraint"] as const).map((c, i) => (
                <button
                  key={c}
                  aria-pressed={category === c}
                  onClick={() => setCategory(c)}
                >
                  {["质点", "刚体", "约束"][i]}
                </button>
              ))}
            </div>
            <div className="wb-drawer-scroll">
              <div className="wb-tiles">
                {shown.map((o) => (
                  <button
                    key={o.id}
                    className={placing === o.id ? "active" : ""}
                    aria-label={`选取${o.name}`}
                    onPointerDown={(e) => drawerDown(e, o.id)}
                    onPointerMove={drawerMove}
                    onPointerUp={drawerUp}
                    onPointerCancel={() => {
                      drawerGesture.current = null;
                      setGhost(null);
                    }}
                    onClick={(e) => {
                      if (e.detail === 0) {
                        setPlacing(o.id);
                        setMode("select");
                        if (compact()) setDrawer(false);
                      }
                    }}
                  >
                    <Miniature spec={o} />
                    <span>{o.id === "C01" ? "有限平面" : o.name}</span>
                  </button>
                ))}
              </div>
              {!shown.length && <p className="wb-help">未找到匹配的物体。</p>}
              <details className="wb-object-list" open>
                <summary>
                  已放置 <span>{scene.objects.length}</span>
                </summary>
                {scene.objects.length === 0 ? (
                  <p className="wb-help">地面和天花板属于环境。</p>
                ) : (
                  <ul>
                    {scene.objects.map((o) => (
                      <li key={o.id}>
                        <button
                          className={selected === o.id ? "selected" : ""}
                          onClick={() => {
                            select(o.id);
                            setCamera((c) => ({ ...c, x: o.x, y: o.y }));
                            if (compact()) setDrawer(false);
                          }}
                        >
                          <span
                            className={`wb-object-dot ${specFor(o.catalogId)?.category}`}
                          />
                          {o.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            </div>
          </aside>
        )}
        <section className="wb-stage">
          <div className="wb-toolbar">
            <button
              className={`wb-tool ${drawer ? "active" : ""}`}
              onClick={() => setDrawer(!drawer)}
              aria-pressed={drawer}
            >
              <Layers size={16} />
              <span>物体</span>
            </button>
            <span className="wb-divider" />
            <button
              className={`wb-icon ${mode === "select" ? "active" : ""}`}
              aria-label="选择与移动物体"
              aria-pressed={mode === "select"}
              onClick={() => {
                setMode("select");
                setIntent(null);
              }}
            >
              <MousePointer2 size={16} />
            </button>
            <button
              className={`wb-icon ${mode === "pan" ? "active" : ""}`}
              aria-label="平移画布"
              aria-pressed={mode === "pan"}
              onClick={() => {
                setMode("pan");
                setPlacing(null);
                setIntent(null);
              }}
            >
              <Hand size={16} />
            </button>
            <button
              className={`wb-tool ${intent ? "active" : ""}`}
              aria-pressed={!!intent}
              onClick={() =>
                intent
                  ? setIntent(null)
                  : pickConnection({ createType: connectionType, first: null })
              }
            >
              <Link2 size={16} />
              <span>连接</span>
            </button>
            <span className="wb-divider" />
            <button
              className="wb-icon"
              aria-label="撤销"
              disabled={!past.length}
              onClick={undo}
            >
              <Undo2 size={16} />
            </button>
            <button
              className="wb-icon"
              aria-label="重做"
              disabled={!future.length}
              onClick={redo}
            >
              <Redo2 size={16} />
            </button>
            <div className="wb-toolbar-end">
              <button
                className={`wb-tool ${showCoordinates ? "active" : ""}`}
                aria-label="显示或隐藏坐标系"
                aria-pressed={showCoordinates}
                onClick={() => setShowCoordinates(!showCoordinates)}
              >
                <Grid2X2 size={16} />
                <span>坐标</span>
              </button>
              <button
                className={`wb-tool ${inspector && !selected ? "active" : ""}`}
                onClick={() => {
                  setSelected(null);
                  setInspector(true);
                }}
              >
                <Settings2 size={16} />
                <span>环境</span>
              </button>
            </div>
          </div>
          {intent && (
            <div className="wb-connection-toolbar">
              {"createType" in intent ? (
                <>
                  <label>
                    连接类型{" "}
                    <select
                      aria-label="新建连接类型"
                      value={connectionType}
                      onChange={(e) => {
                        setConnectionType(e.target.value);
                        setIntent({
                          createType: e.target.value,
                          first: intent.first,
                        });
                      }}
                    >
                      <option value="C05">不可伸长绳</option>
                      <option value="C06">弹性绳</option>
                      <option value="C07">弹簧</option>
                      <option value="C11">轻刚杆</option>
                    </select>
                  </label>
                  <span>
                    {intent.first
                      ? `起点：${anchorLabel(scene, intent.first)}`
                      : "依次选择两个连接点"}
                  </span>
                </>
              ) : (
                <span>为端点 {intent.endpoint.toUpperCase()} 选择目标</span>
              )}
              <button
                className="wb-icon"
                onClick={() => setIntent(null)}
                aria-label="取消连接"
              >
                <X size={14} />
              </button>
            </div>
          )}
          <WorkbenchCanvas
            scene={scene}
            intent={intent}
            onAnchor={pickAnchor}
            onEditError={notice}
            camera={camera}
            setCamera={setCamera}
            selected={selected}
            setSelected={select}
            showCoordinates={showCoordinates}
            mode={mode}
            placing={placing}
            onPlace={place}
            onPreview={preview}
            onDragComplete={(before) => commit(sceneRef.current, before)}
            handleRef={handle}
          />
          <div className="wb-view-tools">
            <button
              className="wb-icon"
              aria-label="放大"
              onClick={() => zoom(1.2)}
            >
              <Plus size={17} />
            </button>
            <button
              className="wb-icon"
              aria-label="缩小"
              onClick={() => zoom(1 / 1.2)}
            >
              <Minus size={17} />
            </button>
            <button
              className="wb-icon"
              aria-label="适合全部物体"
              onClick={() => {
                if (handle.current)
                  setCamera(fitCamera(scene, handle.current.size));
              }}
            >
              <Maximize2 size={16} />
            </button>
            <button
              className="wb-icon"
              aria-label="复位视图"
              onClick={() => setCamera({ ...DEFAULT_CAMERA })}
            >
              <RotateCcw size={16} />
            </button>
          </div>
          <footer className="wb-stage-footer">
            <span>{saveState}</span>
            <div>
              <button onClick={() => setIssues(validateScene(scene))}>
                <CheckCircle2 size={14} />
                检查搭建
              </button>
              <button onClick={exportScene}>
                <Download size={14} />
                导出装置
              </button>
            </div>
          </footer>
          {issues && (
            <div
              className={`wb-validation ${issues.length ? "has-issues" : ""}`}
              role="status"
            >
              <div>
                <strong>
                  {issues.length ? "请调整以下设置" : "搭建参数检查通过"}
                </strong>
                <button
                  className="wb-icon"
                  aria-label="关闭检查结果"
                  onClick={() => setIssues(null)}
                >
                  <X size={15} />
                </button>
              </div>
              {issues.length ? (
                <ul>
                  {issues.map((issue, i) => (
                    <li key={i}>
                      <button onClick={() => select(issue.objectId ?? null)}>
                        {issue.message}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  坐标、属性、环境边界与端点连接可用。本检查不等同于受力求解。
                </p>
              )}
            </div>
          )}
        </section>
        {inspector && (
          <aside className="wb-inspector">
            <div className="wb-panel-heading">
              <h2>{object ? "物体属性" : "实验环境"}</h2>
              <button
                className="wb-icon"
                aria-label="收起属性面板"
                onClick={() => setInspector(false)}
              >
                <X size={17} />
              </button>
            </div>
            <div className="wb-inspector-scroll">
              {object && spec ? (
                <>
                  <div className="wb-selected-summary">
                    <Miniature spec={spec} variant={object.variant} />
                    <div>
                      <strong>{object.name}</strong>
                      <span>
                        {spec.category === "particle"
                          ? "质点外观"
                          : spec.category === "rigid"
                            ? "刚体"
                            : "约束物件"}
                      </span>
                    </div>
                  </div>
                  <label className="wb-field">
                    <span>名称</span>
                    <div>
                      <input
                        aria-label="物体名称"
                        value={object.name}
                        maxLength={30}
                        onChange={(e) =>
                          updateObject({
                            name: e.target.value,
                            nameSource: "user",
                          })
                        }
                      />
                    </div>
                  </label>
                  {numeric("质量", "mass", "kg", 0.001, 100000, 0.1, "m")}
                  {object.catalogId === "C01" && (
                    <PlaneEditor
                      object={object}
                      scene={scene}
                      onChange={commit}
                      onError={notice}
                    />
                  )}
                  {isConnector(object) && (
                    <ConnectionEditor
                      object={object}
                      scene={scene}
                      onChange={commit}
                      onError={notice}
                      onPick={pickConnection}
                      intent={intent}
                    />
                  )}
                  {!isConnector(object) && object.catalogId !== "C01" && (
                    <>
                      <div className="wb-position-fields">
                        <Numeric
                          label="水平位置"
                          symbol="x"
                          value={object.x}
                          onChange={(x) => updateObject({ x })}
                          unit="m"
                        />
                        <Numeric
                          label="竖直位置"
                          symbol="y"
                          value={object.y}
                          onChange={(y) => updateObject({ y })}
                          unit="m"
                        />
                      </div>
                      <p className="wb-help">
                        坐标对应图形中心参考点。拖动也可改变位置。
                      </p>
                    </>
                  )}
                  {!isConnector(object) && (
                    <details className="wb-property-section">
                      <summary>外形与尺寸</summary>
                      <label className="wb-field">
                        <span>外形变体</span>
                        <select
                          aria-label="外形变体"
                          value={object.variant}
                          onChange={(e) =>
                            updateObject(switchVariant(object, e.target.value))
                          }
                        >
                          {spec.variants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {object.catalogId !== "C01" && (
                        <Numeric
                          label="方向角"
                          symbol={String.raw`\theta`}
                          value={object.angle}
                          onChange={(angle) => updateObject({ angle })}
                          unit="°"
                          step={5}
                        />
                      )}
                      <div className="wb-position-fields">
                        {object.catalogId !== "C01" && (
                          <Numeric
                            label="显示宽度"
                            value={object.width}
                            onChange={(width) => updateObject({ width })}
                            min={0.01}
                            max={200}
                            unit="m"
                          />
                        )}
                        <Numeric
                          label="显示高度"
                          value={object.height}
                          onChange={(height) => updateObject({ height })}
                          min={0.01}
                          max={200}
                          unit="m"
                        />
                      </div>
                      <p className="wb-help">
                        逆时针为正。外形尺寸用于搭建，不自动决定质心或惯量。
                      </p>
                    </details>
                  )}
                  {object.properties.vx !== undefined && (
                    <details className="wb-property-section">
                      <summary>初始运动</summary>
                      {numeric(
                        "水平初速度",
                        "vx",
                        "m/s",
                        undefined,
                        undefined,
                        0.1,
                        "u_x",
                      )}
                      {numeric(
                        "竖直初速度",
                        "vy",
                        "m/s",
                        undefined,
                        undefined,
                        0.1,
                        "u_y",
                      )}
                      <label className="wb-switch">
                        <span>固定物体</span>
                        <input
                          type="checkbox"
                          checked={object.fixed}
                          onChange={(e) =>
                            updateObject({ fixed: e.target.checked })
                          }
                        />
                      </label>
                    </details>
                  )}
                  {[
                    "friction",
                    "restitution",
                    "naturalLength",
                    "modulus",
                    "inertia",
                    "constraintLength",
                  ].some(
                    (k) =>
                      object.properties[k as keyof ObjectProps] !== undefined,
                  ) && (
                    <details
                      className="wb-property-section"
                      open={spec.category === "constraint"}
                    >
                      <summary>模型属性</summary>
                      {numeric(
                        "摩擦因数",
                        "friction",
                        "",
                        0,
                        5,
                        0.05,
                        String.raw`\mu`,
                      )}
                      {numeric("恢复系数", "restitution", "", 0, 1, 0.05, "e")}
                      {numeric(
                        object.catalogId === "C05" ? "绳长" : "自然长度",
                        "naturalLength",
                        "m",
                        0.01,
                        200,
                        0.1,
                        "l_0",
                      )}
                      {numeric(
                        "弹性模量",
                        "modulus",
                        "N",
                        0.01,
                        undefined,
                        1,
                        String.raw`\lambda`,
                      )}
                      {numeric(
                        "杆长",
                        "constraintLength",
                        "m",
                        0.05,
                        200,
                        0.1,
                        "L",
                      )}
                      {numeric(
                        "转动惯量",
                        "inertia",
                        "kg·m²",
                        0.001,
                        undefined,
                        0.1,
                        "I",
                      )}
                    </details>
                  )}
                  <details className="wb-property-section">
                    <summary>模型说明</summary>
                    <p className="wb-help">{spec.note}</p>
                  </details>
                  <div className="wb-object-actions">
                    <button onClick={duplicate}>
                      <Copy size={14} />
                      复制
                    </button>
                    <button onClick={remove}>
                      <Trash2 size={14} />
                      删除
                    </button>
                  </div>
                  <button
                    className="wb-back-environment"
                    onClick={() => select(null)}
                  >
                    查看实验环境
                  </button>
                </>
              ) : (
                <>
                  <p className="wb-panel-intro">
                    先决定实验空间，再从抽屉添加物体。
                  </p>
                  <div className="wb-environment-group">
                    <label className="wb-switch">
                      <span>
                        地面 <small>y = 0</small>
                      </span>
                      <input
                        aria-label="启用地面"
                        type="checkbox"
                        checked={scene.environment.ground}
                        onChange={(e) =>
                          environment({ ground: e.target.checked })
                        }
                      />
                    </label>
                    <p className="wb-help">固定在坐标原点的水平线，可关闭。</p>
                    {scene.environment.ground && (
                      <details className="wb-property-section">
                        <summary>地面接触属性</summary>
                        <Numeric
                          label="地面摩擦因数"
                          symbol={String.raw`\mu`}
                          value={scene.environment.groundFriction}
                          onChange={(groundFriction) =>
                            environment({ groundFriction })
                          }
                          min={0}
                          max={5}
                          step={0.05}
                        />
                        <Numeric
                          label="地面恢复系数"
                          symbol="e"
                          value={scene.environment.groundRestitution}
                          onChange={(groundRestitution) =>
                            environment({ groundRestitution })
                          }
                          min={0}
                          max={1}
                          step={0.05}
                        />
                      </details>
                    )}
                  </div>
                  <div className="wb-environment-group">
                    <label className="wb-switch">
                      <span>天花板</span>
                      <input
                        aria-label="启用天花板"
                        type="checkbox"
                        checked={scene.environment.ceiling}
                        onChange={(e) =>
                          environment({ ceiling: e.target.checked })
                        }
                      />
                    </label>
                    {scene.environment.ceiling && (
                      <>
                        <Numeric
                          label="天花板高度"
                          symbol="y"
                          value={scene.environment.ceilingY}
                          onChange={(ceilingY) => environment({ ceilingY })}
                          unit="m"
                          step={0.5}
                        />
                        <details className="wb-property-section">
                          <summary>天花板碰撞属性</summary>
                          <Numeric
                            label="天花板恢复系数"
                            symbol="e"
                            value={scene.environment.ceilingRestitution}
                            onChange={(ceilingRestitution) =>
                              environment({ ceilingRestitution })
                            }
                            min={0}
                            max={1}
                            step={0.05}
                          />
                        </details>
                      </>
                    )}
                    <p className="wb-help">
                      地面与天花板属于环境，不占物体数量。
                    </p>
                  </div>
                  <Numeric
                    label="重力加速度"
                    symbol="g"
                    value={scene.environment.g}
                    onChange={(g) => environment({ g })}
                    unit="m/s²"
                    min={9.8}
                    max={10}
                    step={0.01}
                  />
                  <label className="wb-switch">
                    <span>显示坐标系</span>
                    <input
                      type="checkbox"
                      checked={showCoordinates}
                      onChange={(e) => setShowCoordinates(e.target.checked)}
                    />
                  </label>
                  <p className="wb-help">
                    隐藏坐标只改变显示，所有物体仍保存 x、y。
                  </p>
                  <details className="wb-property-section">
                    <summary>使用提示</summary>
                    <p className="wb-help">
                      拖动物体改变位置，点击物体编辑属性。滚轮缩放，拖动空白处平移。方向键微调选中物体；Shift
                      加大步长。Delete 删除，Ctrl / ⌘ + Z 撤销。
                    </p>
                    <p className="wb-help">
                      后续演化结果按需查看，画布只保留装置与操作。
                    </p>
                  </details>
                  <button
                    className="wb-clear"
                    disabled={!scene.objects.length}
                    onClick={() => {
                      commit({ ...scene, objects: [], connections: [] });
                      setSelected(null);
                    }}
                  >
                    清空物体（可撤销）
                  </button>
                </>
              )}
            </div>
          </aside>
        )}
      </div>
      {ghost && (
        <div
          className="wb-drag-ghost"
          style={{ left: ghost.x + 14, top: ghost.y + 12 }}
        >
          <Miniature spec={specFor(ghost.id)!} />
          <span>{specFor(ghost.id)?.name}</span>
        </div>
      )}
    </div>
  );
}
