import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_SCENE,
  cloneScene,
  makeObject,
  restoreScene,
  loadStoredScene,
  validateScene,
  switchVariant,
  type Scene,
  type SceneObject,
} from "./model.ts";
import {
  planeEndpoints,
  planeFromEndpoints,
  setPlaneGeometry,
  changeEndpoint,
  resolvedEndpoints,
  bindEndpoint,
  releaseEndpoint,
  patchSceneObject,
  removeSceneObjects,
  syncConnections,
  anchorPosition,
  connectionIssues,
  nearestAnchor,
  type AnchorRef,
} from "./relations.ts";
const near = (a: number, b: number, t = 1e-8) =>
  assert.ok(Math.abs(a - b) < t, `${a} != ${b}`);
const point = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  near(a.x, b.x);
  near(a.y, b.y);
};
function setup() {
  const s = cloneScene(EMPTY_SCENE);
  s.environment.ground = false;
  const a = makeObject(s, "P02", { x: 0, y: 3 });
  s.objects.push(a);
  const b = makeObject(s, "P03", { x: 4, y: 3 });
  s.objects.push(b);
  const rope = makeObject(s, "C05", { x: 2, y: 3 });
  rope.properties.naturalLength = 5;
  s.objects.push(rope);
  return { s, a, b, rope };
}
const center = (o: SceneObject): AnchorRef => ({
  kind: "object",
  objectId: o.id,
  u: 0,
  v: 0,
  label: "中心参考点",
});
test("plane defaults to 平面 and subsequent planes are named independently of material", () => {
  const s = cloneScene(EMPTY_SCENE),
    a = makeObject(s, "C01", { x: 0, y: 2 });
  assert.equal(a.name, "平面");
  s.objects.push(a);
  const b = makeObject(s, "C01", { x: 3, y: 2 }, "plane-rough");
  assert.equal(b.name, "平面 2");
  assert.equal(switchVariant(a, "plane-rough").name, "平面");
});
test("dragging A preserves B exactly, including a rotated plane", () => {
  const s = cloneScene(EMPTY_SCENE),
    p = { ...makeObject(s, "C01", { x: 0, y: 4 }), angle: 37 };
  s.objects = [p];
  const before = planeEndpoints(p),
    wanted = { x: -3, y: 2 };
  const next = changeEndpoint(s, p.id, "a", wanted).objects[0],
    after = planeEndpoints(next);
  point(after.a, wanted);
  point(after.b, before.b);
  near(next.width, Math.hypot(after.b.x - after.a.x, after.b.y - after.a.y));
});
test("numeric B changes update angle and length without moving A", () => {
  const p = makeObject(cloneScene(EMPTY_SCENE), "C01", { x: 0, y: 4 }),
    a = planeEndpoints(p).a,
    b = { x: a.x + 3, y: a.y + 4 };
  const next = planeFromEndpoints(p, a, b);
  near(next.width, 5);
  near(next.angle, (Math.atan2(4, 3) * 180) / Math.PI);
  point(planeEndpoints(next).a, a);
});
test("setting angle/length keeps the contact-edge midpoint fixed", () => {
  const p = makeObject(cloneScene(EMPTY_SCENE), "C01", { x: 2, y: 4 }),
    e = planeEndpoints(p);
  const q = setPlaneGeometry(p, 8, 90),
    f = planeEndpoints(q);
  near(q.width, 8);
  near(q.angle, 90);
  point(
    { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 },
    { x: (f.a.x + f.b.x) / 2, y: (f.a.y + f.b.y) / 2 },
  );
  assert.throws(() => planeFromEndpoints(p, e.a, e.a));
  assert.throws(() => setPlaneGeometry(p, -2, 0));
});
test("smooth/rough change preserves edited plane geometry", () => {
  const p = setPlaneGeometry(
      makeObject(cloneScene(EMPTY_SCENE), "C01", { x: 0, y: 4 }),
      11,
      42,
    ),
    q = switchVariant(p, "plane-rough");
  point(planeEndpoints(p).a, planeEndpoints(q).a);
  near(q.width, 11);
  near(q.angle, 42);
  assert.ok(q.properties.friction! > 0);
});
test("attached endpoints follow translation and rotation in the target local frame", () => {
  let { s, a, rope } = setup();
  s = bindEndpoint(s, rope.id, "a", {
    kind: "object",
    objectId: a.id,
    u: 0,
    v: 0.5,
  });
  const fixedB = resolvedEndpoints(
    s,
    s.objects.find((o) => o.id === rope.id)!,
  ).b;
  s = patchSceneObject(s, a.id, { x: 1, y: 5, angle: 90 });
  const ends = resolvedEndpoints(
    s,
    s.objects.find((o) => o.id === rope.id)!,
  );
  point(ends.a, { x: 0.5, y: 5 });
  point(ends.b, fixedB);
});
test("both endpoints follow independently and preserve connector identity", () => {
  let { s, a, b, rope } = setup();
  s = bindEndpoint(s, rope.id, "a", center(a));
  s = bindEndpoint(s, rope.id, "b", center(b));
  s = patchSceneObject(s, b.id, { x: 7, y: 6 });
  const line = s.objects.find((o) => o.id === rope.id)!;
  point(resolvedEndpoints(s, line).a, { x: 0, y: 3 });
  point(resolvedEndpoints(s, line).b, { x: 7, y: 6 });
  near(line.width, Math.sqrt(58));
  assert.equal(s.connections.length, 2);
  assert.ok(connectionIssues(s).some((i) => i.message.includes("超过绳长")));
});
test("a connection can follow a moving plane endpoint", () => {
  let { s, rope } = setup();
  const p = makeObject(s, "C01", { x: 0, y: 6 });
  s.objects.push(p);
  s = bindEndpoint(s, rope.id, "a", {
    kind: "object",
    objectId: p.id,
    u: -0.5,
    v: 0.5,
    label: "端点 A",
  });
  const wanted = { x: -5, y: 4 };
  s = changeEndpoint(s, p.id, "a", wanted);
  point(
    resolvedEndpoints(
      s,
      s.objects.find((o) => o.id === rope.id)!,
    ).a,
    wanted,
  );
});
test("connector chains resolve in any array order and cycles are rejected", () => {
  let { s, a, rope } = setup();
  const spring = makeObject(s, "C07", { x: 5, y: 6 });
  s.objects.push(spring);
  s = bindEndpoint(s, rope.id, "a", center(a));
  s = bindEndpoint(s, spring.id, "a", {
    kind: "object",
    objectId: rope.id,
    u: -0.5,
    v: 0,
  });
  s.objects.reverse();
  s = patchSceneObject(s, a.id, { x: 2, y: 7 });
  point(
    resolvedEndpoints(
      s,
      s.objects.find((o) => o.id === spring.id)!,
    ).a,
    { x: 2, y: 7 },
  );
  assert.throws(
    () =>
      bindEndpoint(s, rope.id, "a", {
        kind: "object",
        objectId: spring.id,
        u: -0.5,
        v: 0,
      }),
    /循环/,
  );
});
test("deleting a target detaches only its ends at their last world position", () => {
  let { s, a, b, rope } = setup();
  s = bindEndpoint(s, rope.id, "a", center(a));
  s = bindEndpoint(s, rope.id, "b", center(b));
  s = patchSceneObject(s, a.id, { x: -2, y: 5 });
  const old = resolvedEndpoints(
    s,
    s.objects.find((o) => o.id === rope.id)!,
  );
  s = removeSceneObjects(s, new Set([a.id]));
  const ends = resolvedEndpoints(
    s,
    s.objects.find((o) => o.id === rope.id)!,
  );
  point(ends.a, old.a);
  point(ends.b, old.b);
  assert.equal(s.connections.length, 1);
  assert.equal(s.connections[0].endpoint, "b");
});
test("deleting a connector also detaches dependent connector ends", () => {
  let { s, rope } = setup();
  const spring = makeObject(s, "C07", { x: 5, y: 5 });
  s.objects.push(spring);
  s = bindEndpoint(s, spring.id, "a", {
    kind: "object",
    objectId: rope.id,
    u: 0.5,
    v: 0,
  });
  const before = resolvedEndpoints(
    s,
    s.objects.find((o) => o.id === spring.id)!,
  ).a;
  s = removeSceneObjects(s, new Set([rope.id]));
  point(
    resolvedEndpoints(
      s,
      s.objects.find((o) => o.id === spring.id)!,
    ).a,
    before,
  );
  assert.equal(s.connections.length, 0);
});
test("release preserves position, and direct endpoint editing changes only that end", () => {
  let { s, a, rope } = setup();
  s = bindEndpoint(s, rope.id, "a", center(a));
  const before = resolvedEndpoints(
    s,
    s.objects.find((o) => o.id === rope.id)!,
  );
  s = releaseEndpoint(s, rope.id, "a");
  point(
    resolvedEndpoints(
      s,
      s.objects.find((o) => o.id === rope.id)!,
    ).a,
    before.a,
  );
  s = changeEndpoint(s, rope.id, "a", { x: -3, y: 8 });
  point(
    resolvedEndpoints(
      s,
      s.objects.find((o) => o.id === rope.id)!,
    ).b,
    before.b,
  );
});
test("environment anchors follow ceiling height and report disabled boundary", () => {
  let { s, rope } = setup();
  s.environment.ceiling = true;
  s = bindEndpoint(s, rope.id, "a", {
    kind: "environment",
    boundary: "ceiling",
    x: 2,
  });
  s = syncConnections({ ...s, environment: { ...s.environment, ceilingY: 9 } });
  point(
    resolvedEndpoints(
      s,
      s.objects.find((o) => o.id === rope.id)!,
    ).a,
    { x: 2, y: 9 },
  );
  s.environment.ceiling = false;
  assert.ok(connectionIssues(s).some((i) => i.message.includes("已关闭")));
});
test("fixed world points remain fixed when unrelated objects move", () => {
  let { s, a, rope } = setup();
  s = bindEndpoint(s, rope.id, "a", { kind: "world", x: -2, y: 8 });
  s = patchSceneObject(s, a.id, { x: 8 });
  point(
    resolvedEndpoints(
      s,
      s.objects.find((o) => o.id === rope.id)!,
    ).a,
    { x: -2, y: 8 },
  );
  assert.throws(() => patchSceneObject(s, rope.id, { x: 5 }), /已连接/);
});
test("self-attachment, missing targets and non-finite anchors cannot be saved", () => {
  const { s, rope } = setup();
  assert.throws(() => bindEndpoint(s, rope.id, "a", center(rope)));
  assert.throws(() =>
    bindEndpoint(s, rope.id, "a", {
      kind: "object",
      objectId: "gone",
      u: 0,
      v: 0,
    }),
  );
  assert.throws(() =>
    bindEndpoint(s, rope.id, "a", { kind: "world", x: NaN, y: 0 }),
  );
});
test("schema migration preserves positions and custom names and adds graph storage", () => {
  const s = cloneScene(EMPTY_SCENE),
    p = makeObject(s, "C01", { x: -1, y: 3 }),
    custom = makeObject(s, "C01", { x: 4, y: 6 });
  p.name = "光滑 1";
  custom.name = "我的斜坡";
  s.objects = [p, custom];
  const legacy = JSON.parse(JSON.stringify(s));
  legacy.version = 1;
  delete legacy.connections;
  const restored = restoreScene(JSON.stringify(legacy))!;
  assert.equal(restored.version, 2);
  assert.equal(restored.objects[0].name, "平面");
  assert.equal(restored.objects[1].name, "我的斜坡");
  point(restored.objects[0], p);
  assert.deepEqual(restored.connections, []);
});
test("graph survives save/restore, including connector chains", () => {
  let { s, a, b, rope } = setup();
  s = bindEndpoint(s, rope.id, "a", center(a));
  s = bindEndpoint(s, rope.id, "b", center(b));
  const restored = restoreScene(JSON.stringify(s))!;
  assert.ok(restored);
  assert.deepEqual(restored.connections, s.connections);
  point(
    resolvedEndpoints(
      restored,
      restored.objects.find((o) => o.id === rope.id)!,
    ).b,
    { x: 4, y: 3 },
  );
  const duplicate = structuredClone(s);
  duplicate.connections.push({ ...duplicate.connections[0], id: "extra" });
  assert.equal(restoreScene(JSON.stringify(duplicate)), null);
});
test("length checks distinguish slack strings, overstretched strings and rigid links", () => {
  let { s, rope } = setup();
  rope.properties.naturalLength = 8;
  assert.equal(connectionIssues(s).length, 0);
  rope.properties.naturalLength = 1;
  assert.ok(connectionIssues(s).some((i) => i.message.includes("超过绳长")));
  const rod = makeObject(s, "C11", { x: 2, y: 6 });
  s.objects = [rod];
  rod.properties.constraintLength = 1;
  assert.ok(connectionIssues(s).some((i) => i.message.includes("杆长")));
});
test("ground attachment is valid without counting decorative line thickness as penetration", () => {
  let { s, rope } = setup();
  s.environment.ground = true;
  s = bindEndpoint(s, rope.id, "a", {
    kind: "environment",
    boundary: "ground",
    x: 0,
  });
  assert.ok(
    !validateScene(s).some(
      (i) => i.objectId === rope.id && i.message.includes("地面"),
    ),
  );
});
test("snap uses world radius derived from screen pixels", () => {
  const { s, a } = setup();
  const p = anchorPosition(s, { kind: "object", objectId: a.id, u: 0, v: 0 });
  const near = nearestAnchor(s, { x: p.x + 0.03, y: p.y }, 0.1);
  assert.equal(near?.kind, "object");
  assert.equal(nearestAnchor(s, { x: 100, y: 100 }, 0.1), null);
});

test("a plane on y=0 is valid; decorative backing does not penetrate physically", () => {
  const s = cloneScene(EMPTY_SCENE);
  const p = makeObject(s, "C01", { x: 0, y: 0 });
  s.objects = [p];
  near(planeEndpoints(p).a.y, 0);
  near(planeEndpoints(p).b.y, 0);
  assert.equal(validateScene(s).length, 0);
});

test("changing plane backing thickness preserves contact endpoints and attached links", () => {
  let { s, rope } = setup();
  const p = setPlaneGeometry(makeObject(s, "C01", { x: 0, y: 6 }), 5, 25);
  s.objects.push(p);
  s = bindEndpoint(s, rope.id, "a", {
    kind: "object",
    objectId: p.id,
    u: -0.5,
    v: 0.5,
  });
  const before = planeEndpoints(p);
  s = patchSceneObject(s, p.id, { height: 0.8 });
  const q = s.objects.find((o) => o.id === p.id)!;
  point(planeEndpoints(q).a, before.a);
  point(planeEndpoints(q).b, before.b);
  point(
    resolvedEndpoints(
      s,
      s.objects.find((o) => o.id === rope.id)!,
    ).a,
    before.a,
  );
});

test("backup quota failure never replaces a valid migrated scene with an empty one", () => {
  const s = cloneScene(EMPTY_SCENE);
  s.objects = [makeObject(s, "P02", { x: 2, y: 4 })];
  const old: any = JSON.parse(JSON.stringify(s));
  old.version = 1;
  delete old.connections;
  const saved = JSON.stringify(old);
  const loaded = loadStoredScene({
    getItem: (key) => (key.endsWith("-backup") ? null : saved),
    setItem: () => {
      throw Error("quota");
    },
  })!;
  assert.equal(loaded.objects.length, 1);
  point(loaded.objects[0], s.objects[0]);
});

test("default labels use object names rather than a state, posture or input parameter", () => {
  const s = cloneScene(EMPTY_SCENE);
  for (const [id, variant, name] of [
    ["P01", "point", "质点 1"],
    ["P06", "person", "人 1"],
    ["P07", "lift", "升降机 1"],
    ["B06", "flywheel", "飞轮 1"],
    ["C02", "wall", "墙 1"],
    ["C03", "bowl", "曲面 1"],
    ["C05", "string", "细绳 1"],
    ["C07", "spring", "弹簧 1"],
    ["C08", "pulley", "滑轮 1"],
    ["C09", "peg", "钉 1"],
    ["C10", "axis", "转轴 1"],
    ["C13", "turntable", "转台 1"],
  ] as const)
    assert.equal(makeObject(s, id, { x: 0, y: 4 }, variant).name, name);
});
test("different state variants share the same base name and receive distinct numbers", () => {
  const s = cloneScene(EMPTY_SCENE);
  const taut = makeObject(s, "C05", { x: 0, y: 4 }, "string");
  s.objects.push(taut);
  const slack = makeObject(s, "C05", { x: 1, y: 4 }, "slack-string");
  assert.equal(taut.name, "细绳 1");
  assert.equal(slack.name, "细绳 2");
  s.objects.push(slack);
  assert.equal(makeObject(s, "C05", { x: 2, y: 4 }).name, "细绳 3");
});
test("version 2 old automatic state names migrate without touching names explicitly marked user", () => {
  const s = cloneScene(EMPTY_SCENE);
  const taut = makeObject(s, "C05", { x: 0, y: 4 }),
    slack = makeObject(s, "C05", { x: 2, y: 4 }, "slack-string");
  const spring = makeObject(s, "C07", { x: 4, y: 4 });
  const custom = makeObject(s, "C05", { x: 6, y: 4 });
  taut.name = "绷紧 1";
  slack.name = "松弛 1";
  spring.name = "自然状态 1";
  custom.name = "绷紧 1";
  custom.nameSource = "user";
  delete taut.nameSource;
  delete slack.nameSource;
  delete spring.nameSource;
  s.objects = [taut, slack, spring, custom];
  const r = restoreScene(JSON.stringify(s))!;
  assert.deepEqual(
    r.objects.map((o) => o.name),
    ["细绳 1", "细绳 2", "弹簧 1", "绷紧 1"],
  );
  assert.equal(r.objects[3].nameSource, "user");
  assert.deepEqual(
    r.objects.map((o) => o.id),
    s.objects.map((o) => o.id),
  );
});
test("auto names are not rewritten after the variant changes; custom names survive reload", () => {
  const s = cloneScene(EMPTY_SCENE),
    o = makeObject(s, "P02", { x: 0, y: 4 });
  const changed = switchVariant(o, "sledge");
  s.objects = [changed];
  assert.equal(restoreScene(JSON.stringify(s))!.objects[0].name, o.name);
  changed.name = "我设计的雪橇";
  changed.nameSource = "user";
  assert.equal(
    restoreScene(JSON.stringify(s))!.objects[0].name,
    "我设计的雪橇",
  );
});
test("a name migration retains an unmodified JSON backup when storage is available", () => {
  const s = cloneScene(EMPTY_SCENE),
    o = makeObject(s, "C05", { x: 0, y: 4 });
  o.name = "绷紧 1";
  delete o.nameSource;
  s.objects = [o];
  const saved = JSON.stringify(s),
    stored = new Map<string, string>([["mathroom-mechanics-scene-v1", saved]]);
  const r = loadStoredScene({
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => {
      stored.set(key, value);
    },
  })!;
  assert.equal(r.objects[0].name, "细绳 1");
  assert.equal(
    stored.get("mathroom-mechanics-scene-v1-before-name-migration"),
    saved,
  );
});
