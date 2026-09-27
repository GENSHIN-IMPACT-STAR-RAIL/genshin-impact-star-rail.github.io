import { test } from "node:test";
import assert from "node:assert/strict";
import { solve, type Setup } from "./mechanics.ts";
import {
  auditMotion,
  prepareMotion,
  motionMatches,
} from "./mechanics-solution.ts";
const base: Setup = {
  length: 10,
  angle: 25,
  mass: 2,
  velocity: 0,
  direction: 0,
  friction: 0.2,
  position: 2,
  g: 9.8,
  restitution: 0,
  duration: 5,
};
test("solve gate accepts verified contact, free flight, collisions and equilibrium", () => {
  for (const c of [
    base,
    { ...base, angle: 0 },
    { ...base, velocity: 2, direction: 180, friction: 1 },
    { ...base, length: 100, velocity: 6, direction: 60 },
    { ...base, length: 100, velocity: 6, direction: -60, restitution: 1 },
    { ...base, angle: 0, velocity: 5, direction: 90, restitution: 1 },
  ]) {
    const r = prepareMotion(c, true);
    assert.ok(r.ok, JSON.stringify(r));
  }
});
test("runtime audit covers a range of one-sided contact transitions", () => {
  for (const angle of [0, 30, 85])
    for (const direction of [-90, 0, 60, 180])
      for (const restitution of [0, 0.6, 1]) {
        const m = solve({
          ...base,
          angle,
          direction,
          restitution,
          velocity: 4,
          duration: 3,
        });
        const audit = auditMotion(m);
        assert.ok(
          audit.ok,
          `${angle}/${direction}/${restitution}: ${audit.errors}`,
        );
      }
});
test("large canceling kinetic and potential energies do not reject a valid free fall", () => {
  const r = prepareMotion(
    { ...base, mass: 10000, position: 10, duration: 120 },
    true,
  );
  assert.ok(r.ok, JSON.stringify(r));
});
test("invalid or detached inputs never reach the solver", () => {
  let calls = 0;
  const fake = (c: Setup) => {
    calls++;
    return solve(c);
  };
  assert.equal(prepareMotion(base, false, fake).ok, false);
  assert.equal(prepareMotion({ ...base, mass: NaN }, true, fake).ok, false);
  assert.equal(calls, 0);
});
test("computed answers cannot be reused after any physical input changes", () => {
  const m = solve(base);
  assert.ok(motionMatches(m, { ...base }));
  for (const k of Object.keys(base) as (keyof Setup)[])
    assert.equal(motionMatches(m, { ...base, [k]: base[k] + 0.01 }), false, k);
});
test("incomplete computation cannot be presented as a full playable solution", () => {
  const c = {
    ...base,
    angle: 0,
    velocity: 3,
    direction: 90,
    restitution: 0.5,
    duration: 5,
  };
  const m = solve(c);
  assert.equal(m.end, "resolution");
  const a = auditMotion(m);
  assert.ok(a.ok);
  assert.equal(a.complete, false);
  assert.equal(prepareMotion(c, true).ok, false);
});
test("fabricated acceleration and inconsistent energy fail the playback gate", () => {
  const bad = solve(base);
  bad.segments[0].as += 1;
  assert.equal(auditMotion(bad).ok, false);
  assert.equal(prepareMotion(base, true, () => bad).ok, false);
  const badEnergy = solve(base);
  badEnergy.initialEnergy += 1;
  assert.equal(auditMotion(badEnergy).ok, false);
});
test("missing phases and unmotivated state jumps are rejected", () => {
  const gap = solve(base);
  gap.segments[0].t += 0.1;
  assert.equal(auditMotion(gap).ok, false);
  const jump = solve(base);
  jump.terminal.s += 1;
  assert.equal(auditMotion(jump).ok, false);
});
test("wrong restitution or a hidden impact cannot pass verification", () => {
  const c = {
    ...base,
    angle: 0,
    length: 100,
    velocity: 5,
    direction: 90,
    restitution: 1,
  };
  const wrong = solve(c),
    e = wrong.events.find((e) => e.kind === "impact")!;
  e.after.vn *= 0.7;
  assert.equal(auditMotion(wrong).ok, false);
  const missing = solve(c);
  missing.events = missing.events.filter((e) => e.kind !== "impact");
  assert.equal(auditMotion(missing).ok, false);
});
test("a solver result for different inputs is rejected even if internally consistent", () => {
  assert.equal(
    prepareMotion(base, true, () => solve({ ...base, mass: 3 })).ok,
    false,
  );
});
