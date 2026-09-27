import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_SCENE,
  DEFAULT_CAMERA,
  cloneScene,
  makeObject,
  toScreen,
  toWorld,
  zoomAt,
  placement,
  halfExtents,
  switchVariant,
  restoreScene,
  validateScene,
  fitCamera,
  type SceneObject,
} from "./model.ts";
const near = (a: number, b: number, t = 1e-8) =>
  assert.ok(Math.abs(a - b) < t, `${a} != ${b}`);
const size = { width: 1000, height: 650 };
test("world/screen round trip preserves Y-up coordinates under pan and zoom", () => {
  for (const camera of [
    DEFAULT_CAMERA,
    { x: -20, y: 17, scale: 17 },
    { x: 3, y: -4, scale: 180 },
  ])
    for (const p of [
      { x: 0, y: 0 },
      { x: -7.3, y: 8.4 },
    ]) {
      const q = toWorld(toScreen(p, camera, size), camera, size);
      near(q.x, p.x);
      near(q.y, p.y);
    }
  assert.ok(
    toScreen({ x: 0, y: 1 }, DEFAULT_CAMERA, size).y <
      toScreen({ x: 0, y: 0 }, DEFAULT_CAMERA, size).y,
  );
});
test("zoom stays anchored under cursor including scale limits", () => {
  for (const f of [0.00001, 0.7, 2, 10000]) {
    const pointer = { x: 257, y: 132 },
      before = toWorld(pointer, DEFAULT_CAMERA, size),
      c = zoomAt(DEFAULT_CAMERA, size, pointer, f),
      after = toWorld(pointer, c, size);
    near(before.x, after.x);
    near(before.y, after.y);
  }
});
test("floor and ceiling are environment settings and never create objects", () => {
  const s = cloneScene(EMPTY_SCENE);
  s.environment.ceiling = true;
  assert.equal(s.objects.length, 0);
  assert.equal(validateScene(s).length, 0);
});
test("floor placement uses the rotated bounding extent", () => {
  const s = cloneScene(EMPTY_SCENE),
    o = makeObject(s, "P02", { x: 2, y: -8 });
  near(o.y, 0.5);
  const rotated = { ...o, angle: 30 },
    p = placement(s, rotated, { x: 2, y: -8 });
  near(p.y, halfExtents(rotated).y, 0.001);
});
test("disabled floor permits negative coordinates without rewriting existing positions", () => {
  const s = cloneScene(EMPTY_SCENE);
  s.environment.ground = false;
  const o = makeObject(s, "P02", { x: -3, y: -4 });
  near(o.x, -3);
  near(o.y, -4);
  s.objects = [o];
  assert.equal(validateScene(s).length, 0);
  s.environment.ground = true;
  near(s.objects[0].y, -4);
  assert.ok(validateScene(s).some((i) => i.objectId === o.id));
});
test("ceiling clamps a dragged body and invalid gaps are reported", () => {
  const s = cloneScene(EMPTY_SCENE);
  s.environment.ceiling = true;
  s.environment.ceilingY = 4;
  const o = makeObject(s, "P03", { x: 0, y: 20 });
  near(o.y, 3.6);
  s.environment.ceilingY = 0;
  assert.ok(validateScene(s).some((i) => i.message.includes("高于")));
});
test("only blocks near finite planes align; this is initial placement, not a permanent constraint", () => {
  const s = cloneScene(EMPTY_SCENE),
    plane = { ...makeObject(s, "C01", { x: 0, y: 2 }), angle: 30, height: 0.2 };
  s.objects = [plane];
  const block = makeObject(s, "P02", { x: 10, y: 3 });
  const wanted = 0.6,
    point = { x: -0.5 * wanted, y: 2 + (Math.sqrt(3) / 2) * wanted };
  const p = placement(s, block, point);
  near(p.angle, 30);
  near(p.x, point.x, 0.001);
  near(p.y, point.y, 0.001);
  const moved = placement(s, { ...block, ...p }, { x: 7, y: 4 });
  near(moved.x, 7);
  near(moved.y, 4);
});
test("variants carry geometry and preserve mass/velocity properties", () => {
  const s = cloneScene(EMPTY_SCENE),
    o = makeObject(s, "B01", { x: 0, y: 4 });
  o.properties.mass = 8;
  const ladder = switchVariant(o, "ladder");
  near(ladder.properties.mass!, 8);
  assert.equal(ladder.variant, "ladder");
  assert.ok(ladder.height > o.height);
  const incline = makeObject(s, "C01", { x: 0, y: 4 }, "incline");
  near(incline.angle, 25);
  assert.equal(incline.variant, "plane-smooth");
});
test("instances have independent ids, names and physical properties", () => {
  const s = cloneScene(EMPTY_SCENE),
    a = makeObject(s, "P02", { x: 0, y: 2 });
  s.objects.push(a);
  const b = makeObject(s, "P02", { x: 3, y: 2 });
  s.objects.push(b);
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.name, b.name);
  b.properties.mass = 5;
  near(a.properties.mass!, 1);
});
test("round-trip storage retains world placement, environment and properties", () => {
  const s = cloneScene(EMPTY_SCENE);
  s.environment.ground = false;
  s.environment.ceiling = true;
  s.environment.ceilingY = 9;
  s.objects.push(makeObject(s, "P02", { x: -2, y: -1 }));
  s.objects[0].properties.mass = 3.5;
  assert.deepEqual(restoreScene(JSON.stringify(s)), s);
});
test("malformed, missing required attributes and unknown object snapshots are rejected", () => {
  assert.equal(restoreScene("{"), null);
  assert.equal(restoreScene('{"version":3}'), null);
  const s = cloneScene(EMPTY_SCENE);
  s.objects.push(makeObject(s, "P02", { x: 0, y: 2 }));
  const unknown = cloneScene(s);
  unknown.objects[0].catalogId = "not-a-shape";
  assert.equal(restoreScene(JSON.stringify(unknown)), null);
  const missing = cloneScene(s);
  delete missing.objects[0].properties.mass;
  assert.equal(restoreScene(JSON.stringify(missing)), null);
  s.objects[0].x = NaN;
  assert.equal(restoreScene(JSON.stringify(s)), null);
});
test("invalid mass, boundary overlap and contradictory fixed initial state are visible in checks", () => {
  const s = cloneScene(EMPTY_SCENE);
  const o = makeObject(s, "P02", { x: 0, y: 2 });
  o.properties.mass = 0;
  o.y = -2;
  o.fixed = true;
  o.properties.vx = 2;
  s.objects = [o];
  const errors = validateScene(s);
  assert.ok(errors.some((e) => e.message.includes("质量")));
  assert.ok(errors.some((e) => e.message.includes("地面")));
  assert.ok(errors.some((e) => e.message.includes("固定")));
});
test("fit-all keeps a widely separated apparatus in view", () => {
  const s = cloneScene(EMPTY_SCENE);
  s.objects = [
    makeObject(s, "P02", { x: -80, y: 2 }),
    makeObject(s, "P03", { x: 80, y: 5 }),
  ];
  const c = fitCamera(s, size);
  for (const o of s.objects) {
    const p = toScreen(o, c, size);
    assert.ok(p.x > 0 && p.x < size.width);
    assert.ok(p.y > 0 && p.y < size.height);
  }
});
