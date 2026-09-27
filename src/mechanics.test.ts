import { test } from "node:test";
import assert from "node:assert/strict";
import {
  solve,
  sample,
  sampleSegment,
  validate,
  initialComponents,
  velocityFromCartesian,
  type Setup,
} from "./mechanics.ts";
const base: Setup = {
  length: 10,
  angle: 30,
  mass: 2,
  velocity: 0,
  direction: 0,
  friction: 0,
  position: 1,
  g: 9.8,
  restitution: 0,
  duration: 5,
};
const near = (a: number, b: number, tolerance = 1e-7) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
function energy(c: Setup) {
  const m = solve(c);
  for (const seg of m.segments) {
    for (const f of [0, 0.3, 0.8, 1]) {
      const s = sampleSegment(m, seg, seg.duration * f);
      near(
        s.kinetic + s.potential + s.heat + s.collisionLoss,
        m.initialEnergy,
        Math.max(1, Math.abs(m.initialEnergy)) * 1e-8,
      );
    }
  }
  const s = sample(m, m.duration);
  near(
    s.kinetic + s.potential + s.heat + s.collisionLoss,
    m.initialEnergy,
    Math.max(1, Math.abs(m.initialEnergy)) * 1e-8,
  );
}
test("frictionless incline transitions to ballistic motion at endpoint", () => {
  const m = solve(base);
  const edge = m.events.find((e) => e.kind === "edge")!;
  near(edge.t, Math.sqrt(18 / 4.9));
  near(sample(m, 1).as, 4.9);
  assert.equal(sample(m, edge.t).phase, "flight");
  near(sample(m, edge.t + 0.5).ax, 0);
  near(sample(m, edge.t + 0.5).ay, -9.8);
  near(sample(m, edge.t + 0.5).normal, 0);
  energy(base);
});
test("static friction balances downhill force", () => {
  const m = solve({ ...base, friction: 0.8 });
  assert.equal(m.end, "rest");
  const s = sample(m, 0);
  near(s.friction, -9.8);
  near(s.as, 0);
  near(s.vn, 0);
});
test("horizontal friction stops without reversing", () => {
  const m = solve({ ...base, angle: 0, velocity: 2, friction: 0.2 });
  assert.equal(m.end, "rest");
  near(m.duration, 2 / 1.96);
  near(sample(m, 10).s, 1 + 4 / 3.92);
  energy(m.config);
});
test("uphill turn then downhill tracks frictional energy", () => {
  const c = {
    ...base,
    position: 5,
    velocity: 2,
    direction: 180,
    friction: 0.1,
  };
  const m = solve(c);
  assert.ok(m.events.some((e) => e.kind === "turn"));
  assert.ok(m.events.some((e) => e.kind === "edge"));
  energy(c);
});
test("uphill motion may stop and stick", () => {
  const m = solve({
    ...base,
    position: 5,
    velocity: 2,
    direction: 180,
    friction: 1,
  });
  assert.equal(m.end, "rest");
  near(sample(m, 100).vs, 0);
});
test("top edge departure precedes hypothetical uphill turn", () => {
  const m = solve({ ...base, position: 0.1, velocity: 10, direction: 180 });
  const e = m.events.find((e) => e.kind === "edge")!;
  near(e.after.s, 0);
  assert.equal(sample(m, e.t).phase, "flight");
  assert.equal(m.events.filter((e) => e.kind === "impact").length, 0);
});
test("horizontal uniform motion and initially stationary equilibrium", () => {
  const m = solve({ ...base, angle: 0, velocity: 3 });
  near(m.events.find((e) => e.kind === "edge")!.t, 3);
  assert.equal(solve({ ...base, angle: 0 }).end, "rest");
});
test("outward tangent velocity at an endpoint releases at t=0", () => {
  const m = solve({ ...base, position: 0, velocity: 1, direction: 180 });
  near(m.events.find((e) => e.kind === "edge")!.t, 0);
  assert.equal(sample(m, 0).phase, "flight");
});
test("invalid setups and detached geometry are blocked", () => {
  for (const config of [
    { ...base, length: 0.5 },
    { ...base, mass: NaN },
    { ...base, restitution: 1.1 },
    { ...base, restitution: -0.1 },
    { ...base, direction: 181 },
    { ...base, velocity: -1 },
    { ...base, duration: 0 },
  ])
    assert.ok(validate(config, true).length);
  assert.ok(validate(base, false).length);
});
test("gravity affects reaction, acceleration and endpoint timing", () => {
  for (const g of [9.8, 9.81, 10]) {
    const m = solve({ ...base, g });
    near(sample(m, 1).as, g / 2);
    near(m.normal, 2 * g * Math.cos(Math.PI / 6));
    near(m.events.find((e) => e.kind === "edge")!.t, Math.sqrt(36 / g));
    energy({ ...base, g });
  }
});
test("gravity bounds and step enforced", () => {
  for (const g of [9.79, 10.01, 9.805, NaN])
    assert.ok(validate({ ...base, g }, true).length);
  for (const g of [9.8, 9.99, 10])
    assert.equal(validate({ ...base, g }, true).length, 0);
});
test("velocity angle and Cartesian input round-trip", () => {
  for (const angle of [0, 25, 85])
    for (const [vx, vy] of [
      [3, 4],
      [-3, -4],
      [0, 0],
      [0, 5],
    ]) {
      const c = { ...base, angle, ...velocityFromCartesian(vx, vy, angle) };
      const v = initialComponents(c);
      near(v.vx, vx);
      near(v.vy, vy);
    }
});
test("oblique launch flies with no support or friction", () => {
  const c = { ...base, length: 100, velocity: 6, direction: 60, friction: 1 };
  const m = solve(c),
    s = sample(m, 0.3),
    v = initialComponents(c);
  assert.equal(s.phase, "flight");
  near(s.x, c.position * Math.cos(Math.PI / 6) + v.vx * 0.3);
  near(s.y, (100 - c.position) * 0.5 + v.vy * 0.3 - (9.8 * 0.3 ** 2) / 2);
  near(s.normal, 0);
  near(s.friction, 0);
  near(s.heat, 0);
});
test("inelastic normal impact preserves tangent velocity then enters contact", () => {
  const c = { ...base, length: 100, velocity: 5, direction: 60, friction: 0.1 };
  const m = solve(c);
  const e = m.events.find((e) => e.kind === "impact")!;
  near(e.t, (2 * initialComponents(c).vn) / (c.g * Math.cos(Math.PI / 6)));
  near(e.before.vs, e.after.vs);
  near(e.after.vn, 0);
  assert.equal(sample(m, e.t).phase, "contact");
  near(sample(m, e.t).normal, m.normal);
  near(e.impulse!, -c.mass * e.before.vn);
  energy(c);
});
test("elastic normal impact reverses normal velocity without losing energy", () => {
  const c = {
    ...base,
    angle: 0,
    length: 100,
    velocity: 5,
    direction: 90,
    restitution: 1,
    duration: 4,
  };
  const m = solve(c);
  const impacts = m.events.filter((e) => e.kind === "impact");
  assert.ok(impacts.length >= 3);
  for (const e of impacts) {
    near(e.after.vn, -e.before.vn);
    near(e.loss!, 0);
  }
  energy(c);
});
test("partial restitution accounts for normal kinetic loss", () => {
  const c = {
    ...base,
    angle: 0,
    length: 100,
    velocity: 5,
    direction: 70,
    restitution: 0.6,
    duration: 1.8,
  };
  const m = solve(c);
  for (const e of m.events.filter((e) => e.kind === "impact")) {
    near(e.after.vn, -0.6 * e.before.vn);
    near(e.loss!, (c.mass * (1 - 0.6 ** 2) * e.before.vn ** 2) / 2);
  }
  energy(c);
});
test("inward initial velocity is an explicit zero-time impact", () => {
  const c = { ...base, velocity: 3, direction: -45, restitution: 0.5 };
  const m = solve(c),
    e = m.events[0];
  assert.equal(e.kind, "impact");
  near(e.t, 0);
  assert.ok(m.warnings.length);
  near(sample(m, 0).vn, e.after.vn);
  energy(c);
});
test("normal inelastic initial impact may settle instantly", () => {
  const m = solve({
    ...base,
    angle: 0,
    velocity: 3,
    direction: -90,
    restitution: 0,
  });
  assert.equal(m.end, "rest");
  near(m.duration, 0);
  near(sample(m, 0).collisionLoss, 9);
  near(sample(m, 0).normal, 19.6);
});
test("finite plane does not collide with its extension", () => {
  const m = solve({
    ...base,
    length: 1,
    position: 0.5,
    angle: 0,
    velocity: 10,
    direction: 45,
    restitution: 1,
  });
  assert.equal(m.events.filter((e) => e.kind === "impact").length, 0);
  assert.equal(sample(m, 3).phase, "flight");
  assert.ok(sample(m, 3).n < 0);
});
test("observation horizon is not confused with physical equilibrium", () => {
  const m = solve({ ...base, duration: 0.2 });
  assert.equal(m.end, "horizon");
  near(m.duration, 0.2);
  assert.ok(sample(m, 0.2).vs > 0);
});
test("infinite diminishing rebounds stop with explicit resolution notice", () => {
  const m = solve({
    ...base,
    angle: 0,
    velocity: 3,
    direction: 90,
    restitution: 0.5,
    duration: 5,
  });
  assert.equal(m.end, "resolution");
  assert.ok(m.warnings.some((w) => w.includes("反弹")));
  assert.equal(sample(m, m.duration).phase, "flight");
  assert.ok(m.duration < 5);
  energy(m.config);
});
test("stopping exactly on endpoint remains supported", () => {
  const m = solve({
    ...base,
    angle: 0,
    length: 2,
    position: 1,
    velocity: 2,
    g: 10,
    friction: 0.2,
  });
  assert.equal(m.end, "rest");
  near(sample(m, m.duration).s, 2);
  assert.equal(m.events.filter((e) => e.kind === "edge").length, 0);
});
test("mass scales forces and energy but not kinematics", () => {
  const c = {
    ...base,
    velocity: 6,
    direction: 60,
    restitution: 0.5,
    length: 100,
  };
  const a = solve(c),
    b = solve({ ...c, mass: 8 });
  for (const t of [0, 0.5, 2]) {
    const x = sample(a, t),
      y = sample(b, t);
    near(x.s, y.s);
    near(x.n, y.n);
    near(y.kinetic, 4 * x.kinetic);
  }
  energy(b.config);
});
test("sampled phases do not penetrate the finite supported surface", () => {
  for (const direction of [-160, -60, 0, 45, 90, 180])
    for (const restitution of [0, 0.3, 1]) {
      const c = {
        ...base,
        length: 20,
        position: 5,
        velocity: 4,
        direction,
        restitution,
        duration: 3,
        friction: 0.15,
      };
      const m = solve(c);
      for (let i = 0; i <= 100; i++) {
        const s = sample(m, (m.duration * i) / 100);
        if (s.s >= 0 && s.s <= c.length) assert.ok(s.n >= -1e-7);
        if (s.phase !== "flight") {
          near(s.n, 0);
          near(s.vn, 0);
        }
      }
      energy(c);
    }
});
