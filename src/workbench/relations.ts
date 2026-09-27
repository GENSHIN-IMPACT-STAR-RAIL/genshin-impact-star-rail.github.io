import type { Scene, SceneObject, Vec } from "./model.ts";
import { objectCatalog, variantPorts } from "../mechanics-objects/art.ts";
import { BOUNDS } from "./glyph-layout.ts";
export type Endpoint = "a" | "b";
export type AnchorRef =
  | { kind: "object"; objectId: string; u: number; v: number; label?: string }
  | { kind: "world"; x: number; y: number }
  | { kind: "environment"; boundary: "ground" | "ceiling"; x: number };
export type Connection = {
  id: string;
  connectorId: string;
  endpoint: Endpoint;
  target: AnchorRef;
};
export type ConnectionIntent =
  | { connectorId: string; endpoint: Endpoint }
  | { createType: string; first: AnchorRef | null };
export type Port = { label: string; u: number; v: number };
export const isConnector = (o: SceneObject) =>
  ["C05", "C06", "C07", "C11"].includes(o.catalogId);
const angleOf = (a: Vec, b: Vec) =>
  (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
const distance = (a: Vec, b: Vec) => Math.hypot(b.x - a.x, b.y - a.y);
export function planeEndpoints(o: SceneObject): { a: Vec; b: Vec } {
  const rad = (o.angle * Math.PI) / 180,
    t = { x: Math.cos(rad), y: Math.sin(rad) },
    n = { x: -t.y, y: t.x };
  const mid = { x: o.x + (n.x * o.height) / 2, y: o.y + (n.y * o.height) / 2 };
  return {
    a: { x: mid.x - (t.x * o.width) / 2, y: mid.y - (t.y * o.width) / 2 },
    b: { x: mid.x + (t.x * o.width) / 2, y: mid.y + (t.y * o.width) / 2 },
  };
}
export function planeFromEndpoints(
  o: SceneObject,
  a: Vec,
  b: Vec,
): SceneObject {
  const width = distance(a, b);
  if (
    ![a.x, a.y, b.x, b.y, width].every(Number.isFinite) ||
    width < 0.05 ||
    width > 200
  )
    throw Error("平面两端须相距0.05–200 m，坐标必须为有效数字。");
  const angle = angleOf(a, b),
    rad = (angle * Math.PI) / 180,
    n = { x: -Math.sin(rad), y: Math.cos(rad) };
  return {
    ...o,
    x: (a.x + b.x) / 2 - (n.x * o.height) / 2,
    y: (a.y + b.y) / 2 - (n.y * o.height) / 2,
    width,
    angle,
  };
}
export function setPlaneGeometry(
  o: SceneObject,
  length: number,
  angle: number,
) {
  if (!Number.isFinite(angle)) throw Error("角度必须为有效数字。");
  if (!Number.isFinite(length) || length < 0.05 || length > 200)
    throw Error("平面长度须在0.05–200 m之间。");
  const ends = planeEndpoints(o),
    mid = { x: (ends.a.x + ends.b.x) / 2, y: (ends.a.y + ends.b.y) / 2 },
    rad = (angle * Math.PI) / 180;
  return planeFromEndpoints(
    o,
    {
      x: mid.x - (Math.cos(rad) * length) / 2,
      y: mid.y - (Math.sin(rad) * length) / 2,
    },
    {
      x: mid.x + (Math.cos(rad) * length) / 2,
      y: mid.y + (Math.sin(rad) * length) / 2,
    },
  );
}
export function looseEndpoints(o: SceneObject): { a: Vec; b: Vec } {
  if (o.terminals) return o.terminals;
  const r = (o.angle * Math.PI) / 180,
    dx = (Math.cos(r) * o.width) / 2,
    dy = (Math.sin(r) * o.width) / 2;
  return { a: { x: o.x - dx, y: o.y - dy }, b: { x: o.x + dx, y: o.y + dy } };
}
export function objectPorts(o: SceneObject): Port[] {
  if (o.catalogId === "C01")
    return [
      { label: "端点 A", u: -0.5, v: 0.5 },
      { label: "端点 B", u: 0.5, v: 0.5 },
      { label: "平面中点", u: 0, v: 0.5 },
    ];
  if (isConnector(o))
    return [
      { label: "端点 A", u: -0.5, v: 0 },
      { label: "端点 B", u: 0.5, v: 0 },
      { label: "中点", u: 0, v: 0 },
    ];
  const spec = objectCatalog.find((s) => s.id === o.catalogId)!,
    bounds = BOUNDS[o.variant] ?? [0, 0, 220, 140];
  const list: Port[] = [{ label: "中心参考点", u: 0, v: 0 }];
  for (const [i, [x, y]] of variantPorts(spec, o.variant).entries()) {
    const u = (x - bounds[0]) / bounds[2] - 0.5,
      v = 0.5 - (y - bounds[1]) / bounds[3];
    if (list.some((p) => Math.hypot(p.u - u, p.v - v) < 0.02)) continue;
    list.push({ label: `连接点 ${i + 1}`, u, v });
  }
  return list;
}
export function terminalPosition(
  scene: Scene,
  o: SceneObject,
  endpoint: Endpoint,
  stack = new Set<string>(),
): Vec {
  const key = `${o.id}:${endpoint}`;
  if (stack.has(key))
    throw Error(
      "这条连接会产生循环位置依赖。请通过独立结点连接，或先解除循环中的一端。",
    );
  const next = new Set(stack);
  next.add(key);
  const link = scene.connections.find(
    (c) => c.connectorId === o.id && c.endpoint === endpoint,
  );
  return link
    ? anchorPosition(scene, link.target, next)
    : looseEndpoints(o)[endpoint];
}
export function anchorPosition(
  scene: Scene,
  ref: AnchorRef,
  stack = new Set<string>(),
): Vec {
  if (ref.kind === "world") return { x: ref.x, y: ref.y };
  if (ref.kind === "environment")
    return {
      x: ref.x,
      y: ref.boundary === "ground" ? 0 : scene.environment.ceilingY,
    };
  const o = scene.objects.find((o) => o.id === ref.objectId);
  if (!o) throw Error("连接目标不存在。");
  if (isConnector(o)) {
    // Endpoint references only depend on that endpoint, so legal chains are not mistaken for cycles.
    if (ref.u === -0.5 && ref.v === 0)
      return terminalPosition(scene, o, "a", stack);
    if (ref.u === 0.5 && ref.v === 0)
      return terminalPosition(scene, o, "b", stack);
    const a = terminalPosition(scene, o, "a", stack),
      b = terminalPosition(scene, o, "b", stack),
      L = distance(a, b),
      r = Math.atan2(b.y - a.y, b.x - a.x);
    return {
      x:
        (a.x + b.x) / 2 +
        Math.cos(r) * ref.u * L -
        Math.sin(r) * ref.v * o.height,
      y:
        (a.y + b.y) / 2 +
        Math.sin(r) * ref.u * L +
        Math.cos(r) * ref.v * o.height,
    };
  }
  const r = (o.angle * Math.PI) / 180;
  return {
    x: o.x + Math.cos(r) * ref.u * o.width - Math.sin(r) * ref.v * o.height,
    y: o.y + Math.sin(r) * ref.u * o.width + Math.cos(r) * ref.v * o.height,
  };
}
export function resolvedEndpoints(scene: Scene, o: SceneObject) {
  return {
    a: terminalPosition(scene, o, "a"),
    b: terminalPosition(scene, o, "b"),
  };
}
export function syncConnections(scene: Scene): Scene {
  scene = { ...scene, version: 2, connections: scene.connections ?? [] };
  const objects = scene.objects.map((o) => {
    if (!isConnector(o)) return o;
    const { a, b } = resolvedEndpoints(scene, o),
      width = distance(a, b);
    if (![a.x, a.y, b.x, b.y, width].every(Number.isFinite)) return o;
    return {
      ...o,
      terminals: { a, b },
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      width,
      angle: width > 1e-10 ? angleOf(a, b) : o.angle,
    };
  });
  return { ...scene, objects };
}
export function bindEndpoint(
  scene: Scene,
  connectorId: string,
  endpoint: Endpoint,
  target: AnchorRef,
): Scene {
  const o = scene.objects.find((o) => o.id === connectorId);
  if (!o || !isConnector(o)) throw Error("请选择绳、弹簧或轻杆的端点。");
  if (target.kind === "object" && target.objectId === connectorId)
    throw Error("不能把连接件连接到自身。");
  const targetPoint = anchorPosition(scene, target);
  if (![targetPoint.x, targetPoint.y].every(Number.isFinite))
    throw Error("连接目标坐标必须是有效数字。");
  const base = syncConnections(scene),
    existing = base.connections.find(
      (c) => c.connectorId === connectorId && c.endpoint === endpoint,
    );
  const next = {
    ...base,
    connections: [
      ...base.connections.filter((c) => c !== existing),
      {
        id: existing?.id ?? crypto.randomUUID(),
        connectorId,
        endpoint,
        target,
      },
    ],
  };
  const synced = syncConnections(next),
    connector = synced.objects.find((o) => o.id === connectorId)!;
  if (connector.width < 0.05) throw Error("两个端点过于接近，请选择不同位置。");
  return synced;
}
export function releaseEndpoint(
  scene: Scene,
  connectorId: string,
  endpoint: Endpoint,
  position?: Vec,
): Scene {
  const base = syncConnections(scene),
    o = base.objects.find((o) => o.id === connectorId)!;
  const ends = resolvedEndpoints(base, o);
  if (position) {
    if (![position.x, position.y].every(Number.isFinite))
      throw Error("端点坐标必须为有效数字。");
    ends[endpoint] = position;
  }
  if (distance(ends.a, ends.b) < 0.05) throw Error("两个端点不能重合。");
  return syncConnections({
    ...base,
    objects: base.objects.map((v) =>
      v.id === o.id ? { ...v, terminals: ends } : v,
    ),
    connections: base.connections.filter(
      (c) => c.connectorId !== o.id || c.endpoint !== endpoint,
    ),
  });
}
export function changeEndpoint(
  scene: Scene,
  id: string,
  endpoint: Endpoint,
  position: Vec,
): Scene {
  const o = scene.objects.find((o) => o.id === id)!;
  if (o.catalogId === "C01") {
    const ends = planeEndpoints(o);
    ends[endpoint] = position;
    const next = planeFromEndpoints(o, ends.a, ends.b);
    return syncConnections({
      ...scene,
      objects: scene.objects.map((v) => (v.id === id ? next : v)),
    });
  }
  return releaseEndpoint(scene, id, endpoint, position);
}
export function patchSceneObject(
  scene: Scene,
  id: string,
  patch: Partial<SceneObject>,
): Scene {
  const base = syncConnections(scene),
    old = base.objects.find((o) => o.id === id);
  if (!old) return base;
  let next = { ...old, ...patch };
  if (
    old.catalogId === "C01" &&
    patch.height !== undefined &&
    !["x", "y", "width", "angle"].some((k) => k in patch)
  ) {
    if (!Number.isFinite(patch.height) || patch.height <= 0)
      throw Error("显示厚度必须大于0。");
    const ends = planeEndpoints(old);
    next = planeFromEndpoints(next, ends.a, ends.b);
  }
  if (
    isConnector(old) &&
    ["x", "y", "angle", "width"].some((k) => k in patch)
  ) {
    if (base.connections.some((c) => c.connectorId === id))
      throw Error("已连接的端点会跟随目标。请拖动端点改连，或移动目标物体。");
    const r = (next.angle * Math.PI) / 180;
    next.terminals = {
      a: {
        x: next.x - (Math.cos(r) * next.width) / 2,
        y: next.y - (Math.sin(r) * next.width) / 2,
      },
      b: {
        x: next.x + (Math.cos(r) * next.width) / 2,
        y: next.y + (Math.sin(r) * next.width) / 2,
      },
    };
  }
  return syncConnections({
    ...base,
    objects: base.objects.map((o) => (o.id === id ? next : o)),
  });
}
export function removeSceneObjects(scene: Scene, ids: Set<string>): Scene {
  const base = syncConnections(scene);
  return syncConnections({
    ...base,
    objects: base.objects.filter((o) => !ids.has(o.id)),
    connections: base.connections.filter(
      (c) =>
        !ids.has(c.connectorId) &&
        !(c.target.kind === "object" && ids.has(c.target.objectId)),
    ),
  });
}
export function nearestAnchor(
  scene: Scene,
  position: Vec,
  radius: number,
  excludeId?: string,
): AnchorRef | null {
  let best = radius,
    ref: AnchorRef | null = null;
  for (const o of scene.objects) {
    if (o.id === excludeId) continue;
    for (const port of objectPorts(o)) {
      const target: AnchorRef = { kind: "object", objectId: o.id, ...port };
      let p: Vec;
      try {
        p = anchorPosition(scene, target);
      } catch {
        continue;
      }
      const d = distance(position, p);
      if (d <= best) {
        best = d;
        ref = target;
      }
    }
  }
  for (const boundary of ["ground", "ceiling"] as const) {
    if (!scene.environment[boundary]) continue;
    const y = boundary === "ground" ? 0 : scene.environment.ceilingY;
    if (Math.abs(position.y - y) < best) {
      best = Math.abs(position.y - y);
      ref = { kind: "environment", boundary, x: position.x };
    }
  }
  return ref;
}
export function anchorLabel(scene: Scene, ref: AnchorRef) {
  if (ref.kind === "world") return "固定位置";
  if (ref.kind === "environment")
    return ref.boundary === "ground" ? "地面" : "天花板";
  return `${scene.objects.find((o) => o.id === ref.objectId)?.name ?? "目标已删除"} · ${ref.label ?? "连接点"}`;
}
export function connectionIssues(
  scene: Scene,
): { objectId?: string; message: string }[] {
  const issues: { objectId?: string; message: string }[] = [],
    seen = new Set<string>(),
    ids = new Set<string>();
  for (const c of scene.connections) {
    const o = scene.objects.find((o) => o.id === c.connectorId),
      add = (message: string) =>
        issues.push({
          objectId: c.connectorId,
          message: `${o?.name ?? "连接"}：${message}`,
        });
    if (ids.has(c.id)) add("连接编号重复。");
    ids.add(c.id);
    const key = c.connectorId + ":" + c.endpoint;
    if (seen.has(key)) add("同一个端点只能有一个附着目标。");
    seen.add(key);
    if (!o || !isConnector(o)) {
      add("连接件不存在或类型无效。");
      continue;
    }
    if (c.target.kind === "object" && c.target.objectId === c.connectorId) {
      add("连接件不能连接自身。");
      continue;
    }
    if (
      c.target.kind === "environment" &&
      !scene.environment[c.target.boundary]
    )
      add("连接的环境边界已关闭。");
    try {
      const p = anchorPosition(scene, c.target);
      if (![p.x, p.y].every(Number.isFinite)) add("目标位置无效。");
    } catch (e) {
      add((e as Error).message);
    }
  }
  for (const o of scene.objects.filter(isConnector))
    try {
      const { a, b } = resolvedEndpoints(scene, o),
        L = distance(a, b),
        limit =
          o.catalogId === "C11"
            ? o.properties.constraintLength
            : o.properties.naturalLength;
      if (L < 0.05)
        issues.push({
          objectId: o.id,
          message: `${o.name}：两个端点过于接近。`,
        });
      if (o.catalogId === "C05" && limit !== undefined && L > limit + 1e-5)
        issues.push({
          objectId: o.id,
          message: `${o.name}：端点距离 ${L.toFixed(3)} m 超过绳长 ${limit} m。`,
        });
      if (
        o.catalogId === "C11" &&
        limit !== undefined &&
        Math.abs(L - limit) > 1e-5
      )
        issues.push({
          objectId: o.id,
          message: `${o.name}：端点距离 ${L.toFixed(3)} m 与杆长 ${limit} m 不一致。`,
        });
    } catch (e) {
      issues.push({
        objectId: o.id,
        message: `${o.name}：${(e as Error).message}`,
      });
    }
  return issues;
}
