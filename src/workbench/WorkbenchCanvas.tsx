import { useEffect, useRef, useState } from "react";
import {
  toScreen,
  toWorld,
  zoomAt,
  placement,
  halfExtents,
  specFor,
  type Scene,
  type Vec,
  type Camera,
  type Viewport,
} from "./model";
import { ObjectGraphic } from "./graphics";
import {
  planeEndpoints,
  resolvedEndpoints,
  isConnector,
  changeEndpoint,
  bindEndpoint,
  nearestAnchor,
  objectPorts,
  anchorPosition,
  patchSceneObject,
  type AnchorRef,
  type Endpoint,
  type ConnectionIntent,
} from "./relations";
export type CanvasHandle = {
  clientWorld: (client: Vec) => Vec | null;
  size: Viewport;
};
export function WorkbenchCanvas({
  scene,
  camera,
  setCamera,
  selected,
  setSelected,
  showCoordinates,
  mode,
  placing,
  onPlace,
  onPreview,
  onDragComplete,
  handleRef,
  intent,
  onAnchor,
  onEditError,
}: {
  intent: ConnectionIntent | null;
  onAnchor: (target: AnchorRef) => void;
  onEditError: (message: string) => void;
  scene: Scene;
  camera: Camera;
  setCamera: (c: Camera) => void;
  selected: string | null;
  setSelected: (id: string | null) => void;
  showCoordinates: boolean;
  mode: "select" | "pan";
  placing: string | null;
  onPlace: (catalogId: string, p: Vec) => void;
  onPreview: (s: Scene) => void;
  onDragComplete: (before: Scene) => void;
  handleRef: React.MutableRefObject<CanvasHandle | null>;
}) {
  const host = useRef<HTMLDivElement>(null),
    svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<Viewport>({ width: 900, height: 650 });
  const [hover, setHover] = useState<Vec | null>(null),
    [dragging, setDragging] = useState(false);
  const gesture = useRef<{
    kind: "object" | "pan" | "endpoint";
    endpoint?: Endpoint;
    latest?: Scene;
    pointerWorld?: Vec;
    notified?: boolean;
    id?: string;
    before: Scene;
    start: Vec;
    origin: Vec;
    camera: Camera;
    moved: boolean;
  } | null>(null);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  useEffect(() => {
    const el = host.current!;
    const resize = new ResizeObserver(([entry]) =>
      setSize({
        width: Math.max(1, entry.contentRect.width),
        height: Math.max(1, entry.contentRect.height),
      }),
    );
    resize.observe(el);
    return () => resize.disconnect();
  }, []);
  const pixel = (client: Vec) => {
    const ctm = svg.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(client.x, client.y).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };
  const clientWorld = (client: Vec) => {
    const el = svg.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (
      client.x < r.left ||
      client.x > r.right ||
      client.y < r.top ||
      client.y > r.bottom
    )
      return null;
    const p = pixel(client);
    return p ? toWorld(p, camera, size) : null;
  };
  handleRef.current = { clientWorld, size };
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (gesture.current) return;
      const r = el.getBoundingClientRect(),
        p = { x: event.clientX - r.left, y: event.clientY - r.top };
      setCamera(zoomAt(camera, size, p, Math.exp(-event.deltaY * 0.0015)));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [camera, size, setCamera]);
  useEffect(() => {
    const cancel = (e: KeyboardEvent) => {
      if (e.key === "Escape" && gesture.current) {
        if (gesture.current.kind !== "pan") onPreview(gesture.current.before);
        gesture.current = null;
        setDragging(false);
      }
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [onPreview]);
  function start(e: React.PointerEvent<SVGElement>, id?: string) {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    const p = pixel({ x: e.clientX, y: e.clientY });
    if (!p) return;
    if (intent && e.button === 0) {
      const world = toWorld(p, camera, size),
        owner = "connectorId" in intent ? intent.connectorId : undefined;
      const o = scene.objects.find((v) => v.id === id);
      let ref: AnchorRef | null = null;
      if (o) {
        let closest = Infinity;
        for (const port of objectPorts(o)) {
          const target: AnchorRef = { kind: "object", objectId: o.id, ...port };
          try {
            const q = anchorPosition(scene, target),
              d = Math.hypot(world.x - q.x, world.y - q.y);
            if (d < closest) {
              closest = d;
              ref = target;
            }
          } catch {}
        }
      }
      onAnchor(
        ref ??
          nearestAnchor(scene, world, 12 / camera.scale, owner) ?? {
            kind: "world",
            ...world,
          },
      );
      return;
    }
    if (placing && e.button === 0) {
      onPlace(placing, toWorld(p, camera, size));
      return;
    }
    const object = scene.objects.find((o) => o.id === id);
    const kind = object && mode !== "pan" && e.button === 0 ? "object" : "pan";
    if (kind === "object") setSelected(id!);
    gesture.current = {
      kind,
      id,
      before: structuredClone(scene),
      start: p,
      origin: object
        ? { x: object.x, y: object.y }
        : { x: camera.x, y: camera.y },
      camera: { ...camera },
      moved: false,
    };
    svg.current!.setPointerCapture(e.pointerId);
    setDragging(true);
  }
  function move(e: React.PointerEvent<SVGSVGElement>) {
    const p = pixel({ x: e.clientX, y: e.clientY });
    if (!p) return;
    setHover(toWorld(p, camera, size));
    const g = gesture.current;
    if (!g) return;
    const dx = p.x - g.start.x,
      dy = p.y - g.start.y;
    if (Math.hypot(dx, dy) > 2) g.moved = true;
    if (g.kind === "pan") {
      setCamera({
        ...g.camera,
        x: g.camera.x - dx / g.camera.scale,
        y: g.camera.y + dy / g.camera.scale,
      });
      return;
    }
    const object = g.before.objects.find((o) => o.id === g.id)!;
    if (g.kind === "endpoint") {
      const world = toWorld(p, camera, size);
      g.pointerWorld = world;
      try {
        const next = changeEndpoint(g.before, g.id!, g.endpoint!, world);
        g.latest = next;
        onPreview(next);
        g.notified = false;
      } catch (e) {
        if (!g.notified) onEditError((e as Error).message);
        g.notified = true;
      }
      return;
    }
    try {
      if (
        isConnector(object) &&
        g.before.connections.some((c) => c.connectorId === object.id)
      ) {
        if (g.moved && !g.notified) {
          onEditError(
            "这条连接已有附着端点。请拖动 A / B 改连，或移动它连接的物体。",
          );
          g.notified = true;
        }
        return;
      }
      const next = placement(g.before, object, {
        x: g.origin.x + dx / g.camera.scale,
        y: g.origin.y - dy / g.camera.scale,
      });
      onPreview(patchSceneObject(g.before, object.id, next));
    } catch (e) {
      if (!g.notified) onEditError((e as Error).message);
      g.notified = true;
    }
  }
  function startEndpoint(
    e: React.PointerEvent<SVGElement>,
    id: string,
    endpoint: Endpoint,
  ) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (intent) {
      const o = scene.objects.find((o) => o.id === id)!;
      onAnchor({
        kind: "object",
        objectId: id,
        u: endpoint === "a" ? -0.5 : 0.5,
        v: o.catalogId === "C01" ? 0.5 : 0,
        label: `端点 ${endpoint.toUpperCase()}`,
      });
      return;
    }
    if (mode === "pan") {
      start(e, id);
      return;
    }
    const p = pixel({ x: e.clientX, y: e.clientY });
    if (!p) return;
    setSelected(id);
    gesture.current = {
      kind: "endpoint",
      id,
      endpoint,
      before: structuredClone(scene),
      start: p,
      origin: { x: 0, y: 0 },
      camera: { ...camera },
      moved: false,
    };
    svg.current!.setPointerCapture(e.pointerId);
    setDragging(true);
  }
  function end(cancel = false) {
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "endpoint") {
      if (cancel) onPreview(g.before);
      else if (g.moved) {
        let next = g.latest ?? g.before;
        let failure: string | null = null;
        const object = next.objects.find((o) => o.id === g.id)!;
        if (isConnector(object) && g.pointerWorld) {
          const target = nearestAnchor(
            next,
            g.pointerWorld,
            14 / camera.scale,
            object.id,
          );
          if (target)
            try {
              next = bindEndpoint(next, object.id, g.endpoint!, target);
            } catch (e) {
              next = g.before;
              failure = (e as Error).message;
            }
        }
        onPreview(next);
        onDragComplete(g.before);
        if (failure) onEditError(failure);
      }
    } else if (g.kind === "object") {
      if (cancel) onPreview(g.before);
      else if (g.moved) onDragComplete(g.before);
    } else if (!g.moved && mode === "select") setSelected(null);
    gesture.current = null;
    setDragging(false);
  }
  const activeOwner =
    intent && "connectorId" in intent
      ? intent.connectorId
      : gesture.current?.kind === "endpoint"
        ? gesture.current.id
        : undefined;
  const showPorts =
    !!intent ||
    (gesture.current?.kind === "endpoint" &&
      !!scene.objects.find(
        (o) => o.id === gesture.current?.id && isConnector(o),
      ));
  const hoveredAnchor =
    showPorts && hover
      ? nearestAnchor(scene, hover, 14 / camera.scale, activeOwner)
      : null;
  const selectedObject = scene.objects.find((o) => o.id === selected);
  let controlPoints: { a: Vec; b: Vec } | null = null;
  try {
    if (selectedObject)
      controlPoints =
        selectedObject.catalogId === "C01"
          ? planeEndpoints(selectedObject)
          : isConnector(selectedObject)
            ? resolvedEndpoints(scene, selectedObject)
            : null;
  } catch {}
  const worldMin = toWorld({ x: 0, y: size.height }, camera, size),
    worldMax = toWorld({ x: size.width, y: 0 }, camera, size);
  const rawStep = 60 / camera.scale,
    power = 10 ** Math.floor(Math.log10(rawStep)),
    step = [1, 2, 5, 10].map((v) => v * power).find((v) => v >= rawStep)!;
  const xs = Array.from(
    {
      length: Math.max(
        0,
        Math.min(150, Math.floor((worldMax.x - worldMin.x) / step) + 2),
      ),
    },
    (_, i) => (Math.ceil(worldMin.x / step) + i) * step,
  ).filter((x) => x <= worldMax.x);
  const ys = Array.from(
    {
      length: Math.max(
        0,
        Math.min(150, Math.floor((worldMax.y - worldMin.y) / step) + 2),
      ),
    },
    (_, i) => (Math.ceil(worldMin.y / step) + i) * step,
  ).filter((y) => y <= worldMax.y);
  const origin = toScreen({ x: 0, y: 0 }, camera, size),
    groundY = origin.y,
    ceilingY = toScreen(
      {
        x: 0,
        y: Number.isFinite(scene.environment.ceilingY)
          ? scene.environment.ceilingY
          : 8,
      },
      camera,
      size,
    ).y;
  const tick = (n: number) => Number(n.toFixed(4)).toString();
  return (
    <div className="wb-canvas-host" ref={host}>
      <svg
        ref={svg}
        width="100%"
        height="100%"
        viewBox={`0 0 ${size.width} ${size.height}`}
        className={`wb-canvas ${mode === "pan" || dragging ? "is-panning" : ""} ${placing ? "is-placing" : ""}`}
        role="application"
        aria-label="力学实验台画布，可拖入物体，点击物体编辑属性"
        onPointerDown={(e) => start(e)}
        onPointerMove={move}
        onPointerUp={() => end()}
        onPointerCancel={() => end(true)}
        onPointerLeave={() => {
          if (!gesture.current) setHover(null);
        }}
      >
        <rect width={size.width} height={size.height} fill="var(--canvas-bg)" />
        {showCoordinates && (
          <g className="wb-grid" pointerEvents="none">
            {xs.map((x) => (
              <line
                key={`x${x}`}
                x1={toScreen({ x, y: 0 }, camera, size).x}
                x2={toScreen({ x, y: 0 }, camera, size).x}
                y1="0"
                y2={size.height}
              />
            ))}
            {ys.map((y) => (
              <line
                key={`y${y}`}
                x1="0"
                x2={size.width}
                y1={toScreen({ x: 0, y }, camera, size).y}
                y2={toScreen({ x: 0, y }, camera, size).y}
              />
            ))}
          </g>
        )}
        {scene.environment.ground && (
          <g className="wb-boundary" onPointerDown={(e) => start(e)}>
            <rect
              x="0"
              y={Math.max(0, groundY)}
              width={size.width}
              height={Math.max(0, size.height - groundY)}
              fill="var(--surface)"
            />
            <line x1="0" y1={groundY} x2={size.width} y2={groundY} />
            <text x="18" y={groundY + 22}>
              地面{showCoordinates ? " · y = 0" : ""}
            </text>
          </g>
        )}
        {scene.environment.ceiling && (
          <g className="wb-boundary" onPointerDown={(e) => start(e)}>
            <rect
              x="0"
              y="0"
              width={size.width}
              height={Math.max(0, Math.min(size.height, ceilingY))}
              fill="var(--surface)"
            />
            <line x1="0" y1={ceilingY} x2={size.width} y2={ceilingY} />
            <text x="18" y={ceilingY - 12}>
              天花板
              {showCoordinates ? ` · y = ${scene.environment.ceilingY}` : ""}
            </text>
          </g>
        )}
        {showCoordinates && (
          <g className="wb-axes" pointerEvents="none">
            <line x1="0" y1={origin.y} x2={size.width} y2={origin.y} />
            <line x1={origin.x} y1="0" x2={origin.x} y2={size.height} />
            <text
              x={Math.min(size.width - 16, Math.max(12, origin.x + 9))}
              y="20"
            >
              y
            </text>
            <text
              x={size.width - 18}
              y={Math.min(size.height - 12, Math.max(20, origin.y - 10))}
            >
              x
            </text>
            {xs
              .filter((x) => x !== 0)
              .map((x) => (
                <text
                  key={`tx${x}`}
                  x={toScreen({ x, y: 0 }, camera, size).x + 3}
                  y={Math.min(size.height - 10, Math.max(15, origin.y - 8))}
                >
                  {tick(x)}
                </text>
              ))}
            {ys
              .filter((y) => y !== 0)
              .map((y) => (
                <text
                  key={`ty${y}`}
                  x={Math.min(size.width - 32, Math.max(8, origin.x + 8))}
                  y={toScreen({ x: 0, y }, camera, size).y - 4}
                >
                  {tick(y)}
                </text>
              ))}
            <text x={origin.x + 7} y={origin.y - 8}>
              O
            </text>
          </g>
        )}
        {scene.objects.map((o) => {
          const p = toScreen(
            {
              x: Number.isFinite(o.x) ? o.x : 0,
              y: Number.isFinite(o.y) ? o.y : 0,
            },
            camera,
            size,
          );
          const w =
              (Number.isFinite(o.width) ? Math.max(0.05, o.width) : 1) *
              camera.scale,
            h =
              (Number.isFinite(o.height) ? Math.max(0.05, o.height) : 1) *
              camera.scale;
          const isSelected = o.id === selected;
          return (
            <g
              key={o.id}
              transform={`translate(${p.x},${p.y})`}
              role="button"
              tabIndex={0}
              aria-label={`选择 ${o.name}`}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setSelected(o.id);
                }
              }}
              onPointerDown={(e) => start(e, o.id)}
              className="wb-scene-object"
            >
              <title>{o.name}</title>
              <g
                transform={`rotate(${-(Number.isFinite(o.angle) ? o.angle : 0)})`}
              >
                <rect
                  x={-Math.max(w, 26) / 2 - 6}
                  y={-Math.max(h, 26) / 2 - 6}
                  width={Math.max(w, 26) + 12}
                  height={Math.max(h, 26) + 12}
                  fill="transparent"
                />
                <ObjectGraphic object={o} scale={camera.scale} />
                {isSelected && (
                  <rect
                    className="wb-selected-outline"
                    x={-w / 2 - 7}
                    y={-h / 2 - 7}
                    width={w + 14}
                    height={h + 14}
                    rx="3"
                  />
                )}
              </g>
              <text
                className="wb-object-name"
                x="0"
                y={
                  -halfExtents({
                    ...o,
                    width: w,
                    height: h,
                    angle: Number.isFinite(o.angle) ? o.angle : 0,
                  }).y - 15
                }
                textAnchor="middle"
                pointerEvents="none"
              >
                {o.name.length > 16 ? o.name.slice(0, 16) + "…" : o.name}
              </text>
              {isSelected && (
                <g className="wb-origin-mark" pointerEvents="none">
                  <line x1="-4" x2="4" y1="0" y2="0" />
                  <line y1="-4" y2="4" x1="0" x2="0" />
                </g>
              )}
            </g>
          );
        })}
        {showPorts &&
          scene.objects
            .filter((o) => o.id !== activeOwner)
            .flatMap((o) =>
              objectPorts(o).map((port, i) => {
                const target: AnchorRef = {
                  kind: "object",
                  objectId: o.id,
                  ...port,
                };
                let world: Vec;
                try {
                  world = anchorPosition(scene, target);
                } catch {
                  return null;
                }
                if (![world.x, world.y].every(Number.isFinite)) return null;
                const p = toScreen(world, camera, size);
                return (
                  <g
                    key={`${o.id}-port-${i}`}
                    className="wb-target-port"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (intent) onAnchor(target);
                    }}
                  >
                    <title>
                      {o.name} · {port.label}
                    </title>
                    <circle cx={p.x} cy={p.y} r="11" fill="transparent" />
                    <circle cx={p.x} cy={p.y} r="4" />
                  </g>
                );
              }),
            )}
        {controlPoints &&
          selectedObject &&
          (["a", "b"] as const).map((endpoint) => {
            const world = controlPoints![endpoint];
            if (![world.x, world.y].every(Number.isFinite)) return null;
            const p = toScreen(world, camera, size);
            const linked = scene.connections.some(
              (c) =>
                c.connectorId === selectedObject.id && c.endpoint === endpoint,
            );
            return (
              <g
                key={endpoint}
                className={`wb-endpoint-handle ${linked ? "attached" : ""}`}
                onPointerDown={(e) =>
                  startEndpoint(e, selectedObject.id, endpoint)
                }
                aria-label={`${selectedObject.name}端点${endpoint.toUpperCase()}`}
              >
                <title>拖动端点 {endpoint.toUpperCase()}</title>
                <circle cx={p.x} cy={p.y} r="13" className="wb-handle-hit" />
                <circle cx={p.x} cy={p.y} r="5.5" />
                <text x={p.x + 10} y={p.y - 10}>
                  {endpoint.toUpperCase()}
                </text>
              </g>
            );
          })}
        {hoveredAnchor &&
          (() => {
            try {
              const p = toScreen(
                anchorPosition(scene, hoveredAnchor),
                camera,
                size,
              );
              return (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="10"
                  className="wb-snap-target"
                  pointerEvents="none"
                />
              );
            } catch {
              return null;
            }
          })()}
        {intent &&
          "createType" in intent &&
          intent.first &&
          hover &&
          (() => {
            try {
              const a = toScreen(
                  anchorPosition(scene, intent.first),
                  camera,
                  size,
                ),
                b = toScreen(
                  hoveredAnchor ? anchorPosition(scene, hoveredAnchor) : hover,
                  camera,
                  size,
                );
              return (
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  className="wb-connection-preview"
                  pointerEvents="none"
                />
              );
            } catch {
              return null;
            }
          })()}
        {placing && hover && (
          <g
            pointerEvents="none"
            transform={`translate(${toScreen(hover, camera, size).x},${toScreen(hover, camera, size).y})`}
          >
            <circle r="9" fill="var(--accent-soft)" stroke="var(--accent)" />
            <path d="M-4 0H4M0-4V4" stroke="var(--accent)" />
          </g>
        )}
      </svg>
      {!scene.objects.length && !placing && !intent && (
        <div className="wb-empty-state">
          <span>空白实验台</span>
          <h2>从物体抽屉开始搭建</h2>
          <p>拖入物体，点击它设置质量和其他属性。</p>
        </div>
      )}
      {intent && (
        <div className="wb-placement-hint">
          {"connectorId" in intent
            ? `为端点 ${intent.endpoint.toUpperCase()} 选择目标`
            : intent.first
              ? "选择第二个连接点"
              : "选择第一个连接点"}{" "}
          · 点空白处固定坐标 · Esc 取消
        </div>
      )}
      {placing && (
        <div className="wb-placement-hint">
          点击画布放置「{specFor(placing)?.name}」 · Esc 取消
        </div>
      )}
      <div className="wb-canvas-caption">
        <span>{showCoordinates ? "单位 m · 坐标原点 O" : "坐标已隐藏"}</span>
        <span>{scene.objects.length} 个物体 · 地面与天花板不计入物体</span>
      </div>
    </div>
  );
}
