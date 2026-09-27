import { objectCatalog } from "../mechanics-objects/art.ts";
import {
  connectionIssues,
  syncConnections,
  isConnector,
  looseEndpoints,
  resolvedEndpoints,
  setPlaneGeometry,
  planeEndpoints,
  type Connection,
} from "./relations.ts";
export type Vec = { x: number; y: number };
export type Camera = { x: number; y: number; scale: number };
export type Viewport = { width: number; height: number };
export type ObjectProps = {
  mass?: number;
  vx?: number;
  vy?: number;
  friction?: number;
  restitution?: number;
  naturalLength?: number;
  modulus?: number;
  inertia?: number;
  constraintLength?: number;
};
export type SceneObject = {
  id: string;
  catalogId: string;
  variant: string;
  name: string;
  nameSource?: "auto" | "user";
  x: number;
  y: number;
  angle: number;
  width: number;
  height: number;
  fixed: boolean;
  properties: ObjectProps;
  terminals?: { a: Vec; b: Vec };
};
export type Scene = {
  version: 2;
  environment: {
    ground: boolean;
    ceiling: boolean;
    ceilingY: number;
    g: number;
    groundFriction: number;
    groundRestitution: number;
    ceilingRestitution: number;
  };
  objects: SceneObject[];
  connections: Connection[];
};
export const STORAGE_KEY = "mathroom-mechanics-scene-v1";
export const EMPTY_SCENE: Scene = {
  version: 2,
  environment: {
    ground: true,
    ceiling: false,
    ceilingY: 8,
    g: 9.8,
    groundFriction: 0.2,
    groundRestitution: 0,
    ceilingRestitution: 0,
  },
  objects: [],
  connections: [],
};
export const DEFAULT_CAMERA: Camera = { x: 0, y: 3.5, scale: 55 };
export const specFor = (id: string) => objectCatalog.find((o) => o.id === id);
export const cloneScene = (s: Scene): Scene => structuredClone(s);
export function toScreen(p: Vec, camera: Camera, size: Viewport): Vec {
  return {
    x: (p.x - camera.x) * camera.scale + size.width / 2,
    y: size.height / 2 - (p.y - camera.y) * camera.scale,
  };
}
export function toWorld(p: Vec, camera: Camera, size: Viewport): Vec {
  return {
    x: (p.x - size.width / 2) / camera.scale + camera.x,
    y: (size.height / 2 - p.y) / camera.scale + camera.y,
  };
}
export function zoomAt(
  camera: Camera,
  size: Viewport,
  pointer: Vec,
  factor: number,
): Camera {
  const before = toWorld(pointer, camera, size),
    scale = Math.max(0.02, Math.min(240, camera.scale * factor));
  const after = toWorld(pointer, { ...camera, scale }, size);
  return {
    x: camera.x + before.x - after.x,
    y: camera.y + before.y - after.y,
    scale,
  };
}
export function halfExtents(o: SceneObject) {
  const t = (o.angle * Math.PI) / 180;
  return {
    x: (Math.abs(o.width * Math.cos(t)) + Math.abs(o.height * Math.sin(t))) / 2,
    y: (Math.abs(o.width * Math.sin(t)) + Math.abs(o.height * Math.cos(t))) / 2,
  };
}
export function placement(
  scene: Scene,
  o: SceneObject,
  point: Vec,
  snapDistance = 0.2,
): Vec & { angle: number } {
  let target = { ...point, angle: o.angle };
  if (o.catalogId === "P02") {
    let closest = snapDistance;
    for (const plane of scene.objects) {
      if (
        plane.id === o.id ||
        plane.catalogId !== "C01" ||
        ![plane.x, plane.y, plane.angle, plane.width, plane.height].every(
          Number.isFinite,
        )
      )
        continue;
      const a = (plane.angle * Math.PI) / 180,
        t = { x: Math.cos(a), y: Math.sin(a) },
        n = { x: -Math.sin(a), y: Math.cos(a) };
      const dx = point.x - plane.x,
        dy = point.y - plane.y,
        along = dx * t.x + dy * t.y;
      const normal = dx * n.x + dy * n.y,
        wanted = (plane.height + o.height) / 2,
        gap = Math.abs(normal - wanted);
      if (Math.abs(along) <= plane.width / 2 && gap < closest) {
        closest = gap;
        target = {
          x: plane.x + t.x * along + n.x * wanted,
          y: plane.y + t.y * along + n.y * wanted,
          angle: plane.angle,
        };
      }
    }
  }
  const env = scene.environment;
  if (o.catalogId === "C01") {
    let e = planeEndpoints({ ...o, ...target }),
      low = Math.min(e.a.y, e.b.y);
    if (env.ground && (low < 0 || Math.abs(low) < snapDistance))
      target.y -= low;
    e = planeEndpoints({ ...o, ...target });
    const high = Math.max(e.a.y, e.b.y);
    if (env.ceiling && Number.isFinite(env.ceilingY) && high > env.ceilingY)
      target.y -= high - env.ceilingY;
    return {
      x: Math.round(target.x * 1000) / 1000,
      y: Math.round(target.y * 1000) / 1000,
      angle: target.angle,
    };
  }
  const half = halfExtents({ ...o, angle: target.angle });
  if (env.ground) target.y = Math.max(half.y, target.y);
  if (env.ceiling && Number.isFinite(env.ceilingY))
    target.y = Math.min(env.ceilingY - half.y, target.y);
  return {
    x: Math.round(target.x * 1000) / 1000,
    y: Math.round(target.y * 1000) / 1000,
    angle: target.angle,
  };
}

export function objectDefaults(catalogId: string): {
  width: number;
  height: number;
  properties: ObjectProps;
} {
  const spec = specFor(catalogId);
  if (!spec) throw Error("Unknown object");
  let width = 1.6,
    height = 1;
  if (catalogId === "P01") width = height = 0.3;
  if (catalogId === "P03" || catalogId === "P04") width = height = 0.8;
  if (catalogId === "P05") {
    width = 2.5;
    height = 1.25;
  }
  if (catalogId === "P06") {
    width = 0.9;
    height = 1.75;
  }
  if (catalogId === "P07") {
    width = 1.5;
    height = 2;
  }
  if (catalogId === "P08") {
    width = 2.2;
    height = 1.2;
  }
  if (catalogId === "B01") {
    width = 3;
    height = 0.25;
  }
  if (catalogId === "B02" || catalogId === "B03") {
    width = 2.2;
    height = 1.5;
  }
  if (["B04", "B05", "B06"].includes(catalogId)) width = height = 1.8;
  if (catalogId === "C01") {
    width = 5;
    height = 0.16;
  }
  if (catalogId === "C02") {
    width = 0.18;
    height = 3;
  }
  if (["C05", "C06", "C07", "C11"].includes(catalogId)) {
    width = 3;
    height = catalogId === "C07" ? 0.45 : 0.15;
  }
  if (["C09", "C10", "C12"].includes(catalogId)) {
    width = 0.7;
    height = 0.7;
  }
  if (catalogId === "C04") {
    width = 4;
    height = 0.14;
  }
  if (catalogId === "C08") width = height = 1;
  if (catalogId === "C03") {
    width = 3;
    height = 1.5;
  }
  if (catalogId === "C13") {
    width = 3;
    height = 1;
  }
  const properties: ObjectProps =
    spec.category === "constraint" ? {} : { mass: 1, vx: 0, vy: 0 };
  if (["P02", "P03", "C01", "C02", "C03"].includes(catalogId))
    Object.assign(properties, { friction: 0.2, restitution: 0 });
  if (catalogId === "C05") Object.assign(properties, { naturalLength: 3 });
  if (catalogId === "C06" || catalogId === "C07")
    Object.assign(properties, { naturalLength: 2, modulus: 20 });
  if (catalogId === "B06") properties.inertia = 1;
  if (catalogId === "C11") properties.constraintLength = 3;
  return { width, height, properties };
}
/** Names describe the object. Its appearance or physical state stays in the variant and properties. */
const DEFAULT_NAMES: Record<string, Record<string, string>> = {
  P01: { point: "质点" },
  P06: { person: "人" },
  P07: { lift: "升降机" },
  B06: { flywheel: "飞轮" },
  C01: { "plane-smooth": "平面", "plane-rough": "平面", incline: "平面" },
  C02: { wall: "墙", barrier: "挡板" },
  C03: { bowl: "曲面", dome: "曲面" },
  C05: { string: "细绳", "slack-string": "细绳" },
  C07: { spring: "弹簧", "spring-long": "弹簧", "spring-short": "弹簧" },
  C08: { pulley: "滑轮" },
  C09: { peg: "钉", eyelet: "穿绳环" },
  C10: { axis: "转轴" },
  C13: { turntable: "转台" },
};
const LEGACY_AUTONAMES: Record<string, string[]> = {
  P01: ["点状"],
  P06: ["站立"],
  P07: ["吊笼"],
  B06: ["给定惯量"],
  C01: ["光滑", "粗糙", "倾斜"],
  C02: ["墙面", "有限挡板"],
  C03: ["内曲面", "外曲面"],
  C05: ["绷紧", "松弛"],
  C07: ["自然状态", "伸长", "压缩"],
  C08: ["理想固定滑轮"],
  C09: ["固定钉", "光滑环"],
  C10: ["固定轴"],
  C13: ["水平转台"],
};
export function objectBaseName(catalogId: string, variant: string) {
  const spec = specFor(catalogId);
  if (!spec) throw Error("Unknown object");
  const chosen = spec.variants.find((v) => v.id === variant);
  if (!chosen) throw Error("Unknown variant");
  return DEFAULT_NAMES[catalogId]?.[variant] ?? chosen.name;
}
const numberedName = (base: string, n: number, catalogId: string) =>
  catalogId === "C01" && n === 1 ? "平面" : `${base} ${n}`;
function migrateAutomaticNames(objects: SceneObject[]) {
  const candidates = new Map<SceneObject, number>();
  for (const o of objects) {
    if (o.nameSource === "user") continue;
    const bad = LEGACY_AUTONAMES[o.catalogId] ?? [];
    for (const old of bad) {
      const match = new RegExp(`^${old}\\s+([1-9]\\d*)$`).exec(o.name);
      if (match) {
        candidates.set(o, Number(match[1]));
        break;
      }
    }
  }
  const reserved = new Set(
    objects.filter((o) => !candidates.has(o)).map((o) => o.name),
  );
  for (const [o, originalNumber] of candidates) {
    const base = objectBaseName(o.catalogId, o.variant);
    let n = originalNumber;
    while (reserved.has(numberedName(base, n, o.catalogId))) n++;
    o.name = numberedName(base, n, o.catalogId);
    o.nameSource = "auto";
    reserved.add(o.name);
  }
  for (const o of objects) if (!o.nameSource) o.nameSource = "user";
}
export function makeObject(
  scene: Scene,
  catalogId: string,
  point: Vec,
  variant?: string,
): SceneObject {
  const spec = specFor(catalogId);
  if (!spec) throw Error("Unknown object");
  const defaults = objectDefaults(catalogId),
    chosen = spec.variants.find((v) => v.id === variant) ?? spec.variants[0];
  let count = 1;
  const baseName = objectBaseName(catalogId, chosen.id);
  const nameFor = (n: number) => numberedName(baseName, n, catalogId);
  while (scene.objects.some((o) => o.name === nameFor(count))) count++;
  const object: SceneObject = {
    id: crypto.randomUUID(),
    catalogId,
    variant: chosen.id,
    name: nameFor(count),
    nameSource: "auto",
    x: point.x,
    y: point.y,
    angle: 0,
    ...defaults,
    fixed: spec.category === "constraint",
  };
  const shaped = switchVariant(object, chosen.id);
  const result = { ...shaped, ...placement(scene, shaped, point) };
  if (isConnector(result)) result.terminals = looseEndpoints(result);
  return result;
}
export function switchVariant(o: SceneObject, variant: string): SceneObject {
  if (!specFor(o.catalogId)?.variants.some((v) => v.id === variant)) return o;
  if (o.catalogId === "C01") {
    const properties = {
      ...o.properties,
      friction:
        variant === "plane-rough"
          ? o.properties.friction && o.properties.friction > 0
            ? o.properties.friction
            : 0.2
          : 0,
    };
    if (variant === "incline")
      return {
        ...setPlaneGeometry(o, o.width, 25),
        variant: "plane-smooth",
        properties,
      };
    return { ...o, variant, properties };
  }
  let { width, height } = objectDefaults(o.catalogId);
  const properties =
    o.catalogId === "C01"
      ? {
          ...o.properties,
          friction:
            variant === "plane-rough"
              ? o.properties.friction && o.properties.friction > 0
                ? o.properties.friction
                : 0.2
              : 0,
        }
      : o.properties;
  if (
    [
      "wire-ring",
      "disc",
      "circle-guide",
      "tube",
      "solid-ball",
      "axis",
    ].includes(variant)
  )
    width = height = 2;
  if (variant === "wire-arc") {
    width = 2.5;
    height = 1.3;
  }
  if (variant === "guide") {
    width = 4;
    height = 0.14;
  }
  if (variant === "spring-long") width = 4;
  if (variant === "spring-short") width = 2;
  if (variant === "slack-string") height = 1;
  if (variant === "ladder") {
    width = 3;
    height = 0.8;
  }
  if (variant === "beam") height = 0.5;
  if (variant === "incline")
    return {
      ...o,
      variant: "plane-smooth",
      angle: 25,
      width: 5,
      height: 0.16,
      properties,
    };
  return { ...o, variant, width, height, properties };
}
export function fitCamera(scene: Scene, size: Viewport): Camera {
  if (!scene.objects.length) return { ...DEFAULT_CAMERA };
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const o of scene.objects) {
    if (![o.x, o.y, o.width, o.height, o.angle].every(Number.isFinite))
      continue;
    const h = halfExtents(o);
    minX = Math.min(minX, o.x - h.x);
    maxX = Math.max(maxX, o.x + h.x);
    minY = Math.min(minY, o.y - h.y);
    maxY = Math.max(maxY, o.y + h.y);
  }
  if (!Number.isFinite(minX)) return { ...DEFAULT_CAMERA };
  if (scene.environment.ground) minY = Math.min(minY, 0);
  if (scene.environment.ceiling && Number.isFinite(scene.environment.ceilingY))
    maxY = Math.max(maxY, scene.environment.ceilingY);
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    scale: Math.max(
      0.02,
      Math.min(
        100,
        (size.width - 120) / Math.max(maxX - minX, 3),
        (size.height - 130) / Math.max(maxY - minY, 3),
      ),
    ),
  };
}
export type SceneIssue = { objectId?: string; message: string };
export function validateScene(scene: Scene): SceneIssue[] {
  const issues: SceneIssue[] = [],
    e = scene.environment;
  if (
    ![
      e.g,
      e.ceilingY,
      e.groundFriction,
      e.groundRestitution,
      e.ceilingRestitution,
    ].every(Number.isFinite)
  )
    issues.push({ message: "实验环境中有未填写或无效的数值。" });
  if (
    !(e.g >= 9.8 && e.g <= 10) ||
    Math.abs(e.g * 100 - Math.round(e.g * 100)) > 1e-8
  )
    issues.push({ message: "重力加速度须为9.80–10.00，步长0.01。" });
  if (e.ground && e.ceiling && e.ceilingY <= 0)
    issues.push({ message: "启用地面时，天花板必须高于 y = 0。" });
  if (
    e.groundFriction < 0 ||
    e.groundFriction > 5 ||
    e.groundRestitution < 0 ||
    e.groundRestitution > 1 ||
    e.ceilingRestitution < 0 ||
    e.ceilingRestitution > 1
  )
    issues.push({ message: "环境摩擦因数须在0–5，恢复系数须在0–1。" });
  const ids = new Set<string>();
  for (const o of scene.objects) {
    const add = (message: string) =>
      issues.push({ objectId: o.id, message: `${o.name}：${message}` });
    if (ids.has(o.id)) add("对象编号重复。");
    ids.add(o.id);
    if (!specFor(o.catalogId)) {
      add("物体类型无效。");
      continue;
    }
    if (
      ![
        o.x,
        o.y,
        o.width,
        o.height,
        o.angle,
        ...Object.values(o.properties),
      ].every((v) => typeof v === "number" && Number.isFinite(v))
    ) {
      add("属性中有未填写或无效的数值。");
      continue;
    }
    if (o.width <= 0 || o.height <= 0 || o.width > 200 || o.height > 200)
      add("显示尺寸必须大于0且不超过200 m。");
    if (
      o.fixed &&
      ((o.properties.vx ?? 0) !== 0 || (o.properties.vy ?? 0) !== 0)
    )
      add("固定物体的初速度应为0。");
    if (o.properties.mass !== undefined && o.properties.mass <= 0)
      add("质量必须大于0。");
    if (
      o.properties.friction !== undefined &&
      (o.properties.friction < 0 || o.properties.friction > 5)
    )
      add("摩擦因数须在0–5。");
    if (
      o.properties.restitution !== undefined &&
      (o.properties.restitution < 0 || o.properties.restitution > 1)
    )
      add("恢复系数须在0–1。");
    if (
      o.properties.naturalLength !== undefined &&
      o.properties.naturalLength <= 0
    )
      add("绳长/自然长必须大于0。");
    if (o.properties.modulus !== undefined && o.properties.modulus <= 0)
      add("弹性模量必须大于0。");
    if (o.properties.inertia !== undefined && o.properties.inertia <= 0)
      add("转动惯量必须大于0。");
    if (
      o.properties.constraintLength !== undefined &&
      o.properties.constraintLength <= 0
    )
      add("杆长必须大于0。");
    if (o.catalogId === "C01") {
      if (o.width < 0.05) add("平面长度必须至少0.05 m。");
      const ends = planeEndpoints(o);
      if (e.ground && Math.min(ends.a.y, ends.b.y) < -0.001)
        add("平面端点位于地面下方。");
      if (e.ceiling && Math.max(ends.a.y, ends.b.y) > e.ceilingY + 0.001)
        add("平面端点位于天花板上方。");
      continue;
    }
    if (isConnector(o)) {
      try {
        const ends = resolvedEndpoints(scene, o);
        if (e.ground && Math.min(ends.a.y, ends.b.y) < -0.001)
          add("端点位于地面下方。");
        if (e.ceiling && Math.max(ends.a.y, ends.b.y) > e.ceilingY + 0.001)
          add("端点位于天花板上方。");
      } catch {}
      continue;
    }
    const h = halfExtents(o);
    if (e.ground && o.y - h.y < -0.001)
      add("图形越过地面，可向上移动或关闭地面。");
    if (e.ceiling && o.y + h.y > e.ceilingY + 0.001)
      add("图形越过天花板，可调整位置或天花板高度。");
  }
  return [...issues, ...connectionIssues(scene)];
}
export function restoreScene(value: string | null): Scene | null {
  try {
    const s = JSON.parse(value ?? "null");
    if (
      !s ||
      ![1, 2].includes(s.version) ||
      !s.environment ||
      !Array.isArray(s.objects) ||
      s.objects.length > 200
    )
      return null;
    const legacy = s.version === 1;
    s.version = 2;
    if (s.connections === undefined && legacy) s.connections = [];
    if (!Array.isArray(s.connections) || s.connections.length > 400)
      return null;
    if (legacy)
      for (const o of s.objects)
        if (o.catalogId === "C11" && o.properties)
          o.properties.constraintLength ??= o.width;
    migrateAutomaticNames(s.objects);
    const e = s.environment;
    if (
      typeof e.ground !== "boolean" ||
      typeof e.ceiling !== "boolean" ||
      ![
        "g",
        "ceilingY",
        "groundFriction",
        "groundRestitution",
        "ceilingRestitution",
      ].every((k) => typeof e[k] === "number" && Number.isFinite(e[k]))
    )
      return null;
    for (const o of s.objects) {
      const spec = specFor(o.catalogId);
      if (
        !spec ||
        typeof o.id !== "string" ||
        typeof o.name !== "string" ||
        (o.nameSource !== undefined &&
          !["auto", "user"].includes(o.nameSource)) ||
        typeof o.fixed !== "boolean" ||
        !spec.variants.some((v) => v.id === o.variant) ||
        !["x", "y", "width", "height", "angle"].every(
          (k) => typeof o[k] === "number" && Number.isFinite(o[k]),
        ) ||
        !o.properties ||
        !Object.keys(objectDefaults(o.catalogId).properties).every(
          (k) => typeof o.properties[k as keyof ObjectProps] === "number",
        ) ||
        !Object.values(o.properties).every(
          (v) => typeof v === "number" && Number.isFinite(v),
        )
      )
        return null;
    }
    if (
      new Set(s.objects.map((o: SceneObject) => o.id)).size !== s.objects.length
    )
      return null;
    for (const o of s.objects) {
      if (
        o.terminals &&
        !(["a", "b"] as const).every(
          (k) =>
            o.terminals[k] &&
            [o.terminals[k].x, o.terminals[k].y].every(Number.isFinite),
        )
      )
        return null;
    }
    const endpointKeys = new Set<string>(),
      linkIds = new Set<string>();
    for (const c of s.connections) {
      if (
        !c ||
        typeof c.id !== "string" ||
        typeof c.connectorId !== "string" ||
        !["a", "b"].includes(c.endpoint) ||
        !c.target
      )
        return null;
      if (
        linkIds.has(c.id) ||
        endpointKeys.has(c.connectorId + ":" + c.endpoint)
      )
        return null;
      linkIds.add(c.id);
      endpointKeys.add(c.connectorId + ":" + c.endpoint);
      const owner = s.objects.find((o: SceneObject) => o.id === c.connectorId);
      if (!owner || !isConnector(owner)) return null;
      const t = c.target;
      if (t.kind === "object") {
        if (
          t.objectId === c.connectorId ||
          !s.objects.some((o: SceneObject) => o.id === t.objectId) ||
          ![t.u, t.v].every(Number.isFinite) ||
          (t.label !== undefined && typeof t.label !== "string")
        )
          return null;
      } else if (t.kind === "world") {
        if (![t.x, t.y].every(Number.isFinite)) return null;
      } else if (t.kind === "environment") {
        if (
          !["ground", "ceiling"].includes(t.boundary) ||
          !Number.isFinite(t.x)
        )
          return null;
      } else return null;
    }
    return syncConnections(s as Scene);
  } catch {
    return null;
  }
}

/** Backup failure (e.g. quota) must never discard a valid existing apparatus. */
export function loadStoredScene(
  storage: Pick<Storage, "getItem" | "setItem">,
): Scene | null {
  const saved = storage.getItem(STORAGE_KEY),
    restored = restoreScene(saved);
  if (saved && restored) {
    try {
      const original = JSON.parse(saved),
        renamed = original.objects.some(
          (o: SceneObject, i: number) => o.name !== restored.objects[i]?.name,
        );
      if (original.version === 1 && !storage.getItem(STORAGE_KEY + "-backup"))
        storage.setItem(STORAGE_KEY + "-backup", saved);
      if (renamed && !storage.getItem(STORAGE_KEY + "-before-name-migration"))
        storage.setItem(STORAGE_KEY + "-before-name-migration", saved);
    } catch {
      /* A backup failure must not discard the restored apparatus. */
    }
  }
  return restored;
}
