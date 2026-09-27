import {
  evolve,
  initialComponents,
  sampleSegment,
  solve,
  validate,
  type Setup,
  type Motion,
  type Kinematics,
  type Segment,
} from "./mechanics.ts";

export type MotionAudit = { ok: boolean; complete: boolean; errors: string[] };
/** Runtime consistency checks for the supported one-particle/one-plane solver.
 * These are not a proof that an arbitrary photographed problem has been understood correctly.
 */
export function auditMotion(m: Motion): MotionAudit {
  const errors: string[] = [];
  const add = (message: string) => {
    if (!errors.includes(message)) errors.push(message);
  };
  const c = m.config,
    theta = (c.angle * Math.PI) / 180,
    A = c.g * Math.sin(theta),
    B = c.g * Math.cos(theta),
    F = c.friction * B;
  const eq = (a: number, b: number, tol = 1e-7) =>
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
  const same = (a: Kinematics, b: Kinematics) =>
    ["s", "n", "vs", "vn"].every((k) =>
      eq(a[k as keyof Kinematics], b[k as keyof Kinematics]),
    );
  const finiteK = (k: Kinematics) =>
    [k.s, k.n, k.vs, k.vn].every(Number.isFinite);
  const initial = initialComponents(c),
    E0 =
      c.mass * c.g * (c.length - c.position) * Math.sin(theta) +
      (c.mass * c.velocity * c.velocity) / 2;
  if (validate(c, true).length) add("求解使用的参数无效。");
  if (
    !eq(m.gravity, A) ||
    !eq(m.normal, c.mass * B) ||
    !eq(m.initialEnergy, E0)
  )
    add("求解结果与输入的重力、质量或初始能量不一致。");
  if (
    !Number.isFinite(m.duration) ||
    m.duration < 0 ||
    m.duration > c.duration + 1e-7
  )
    add("求解时间范围无效。");
  if (m.end === "horizon" && !eq(m.duration, c.duration))
    add("求解未覆盖设置的观察时长。");
  if (m.end === "rest" && m.terminal.phase !== "rest")
    add("停止状态未满足静止条件。");
  let previousEventTime = -Infinity;
  for (const e of m.events) {
    if (
      !Number.isFinite(e.t) ||
      e.t < previousEventTime ||
      e.t < 0 ||
      e.t > m.duration + 1e-7
    )
      add("事件顺序或时间范围无效。");
    previousEventTime = e.t;
    if (!finiteK(e.before) || !finiteK(e.after))
      add("事件含无效的位置或速度。");
    if (e.kind === "impact") {
      if (
        e.before.vn >= 0 ||
        !eq(e.before.n, 0) ||
        !eq(e.after.n, 0) ||
        e.before.s < -1e-7 ||
        e.before.s > c.length + 1e-7
      )
        add("碰撞不在有效的接触条件下。");
      if (
        !eq(e.before.s, e.after.s) ||
        !eq(e.after.vs, e.before.vs) ||
        !eq(e.after.vn, -c.restitution * e.before.vn)
      )
        add("碰撞前后状态不满足本模型的恢复定律。");
      if (
        !eq(e.impulse ?? NaN, c.mass * (e.after.vn - e.before.vn)) ||
        !eq(
          e.loss ?? NaN,
          0.5 *
            c.mass *
            (1 - c.restitution * c.restitution) *
            e.before.vn *
            e.before.vn,
        )
      )
        add("碰撞冲量或能量损失不一致。");
    } else if (!same(e.before, e.after))
      add("非碰撞事件出现未说明的速度或位置跳变。");
  }
  const impacts = m.events.filter((e) => e.kind === "impact");
  let nextImpact = 0;
  let previous: Kinematics = {
      s: c.position,
      n: 0,
      vs: initial.vs,
      vn: initial.vn,
    },
    cursor = 0;
  for (const seg of [...m.segments, m.terminal]) {
    const terminal = seg === m.terminal;
    if (
      !finiteK(seg) ||
      ![seg.t, seg.duration, seg.as, seg.an, seg.heat, seg.collisionLoss].every(
        Number.isFinite,
      )
    ) {
      add("运动阶段含无效数值。");
      continue;
    }
    if (
      !eq(seg.t, cursor) ||
      seg.duration < 0 ||
      (!terminal && seg.duration === 0) ||
      (terminal && seg.duration !== 0)
    )
      add("运动阶段的时间覆盖不连续。");
    // Each impulse must connect the preceding solution to the following phase.
    while (
      nextImpact < impacts.length &&
      Math.abs(impacts[nextImpact].t - seg.t) <= 1e-9
    ) {
      const e = impacts[nextImpact++];
      if (!same(previous, e.before)) add("碰撞前状态与前一运动阶段不一致。");
      previous = e.after;
    }
    if (!same(previous, seg)) add("运动阶段之间出现无依据的状态跳变。");
    if (seg.phase === "flight") {
      if (!eq(seg.as, A) || !eq(seg.an, -B))
        add("飞行阶段的加速度不符合重力模型。");
      if (seg.n >= 0 && seg.duration > 0) {
        const root = Math.sqrt(seg.vn * seg.vn + 2 * B * seg.n),
          hit =
            seg.vn >= 0 ? (seg.vn + root) / B : (2 * seg.n) / (root - seg.vn);
        if (hit > 1e-9 && hit < seg.duration - 1e-9) {
          const p = evolve(seg, hit);
          if (p.s >= 0 && p.s <= c.length)
            add("飞行阶段越过有效平面而未处理碰撞。");
        }
      }
    } else {
      if (
        !eq(seg.n, 0) ||
        !eq(seg.vn, 0) ||
        !eq(seg.an, 0) ||
        seg.s < -1e-7 ||
        seg.s > c.length + 1e-7
      )
        add("接触阶段的位置或法向运动不符合约束。");
      if (seg.phase === "rest") {
        if (!eq(seg.vs, 0) || !eq(seg.as, 0) || A > F + 1e-7)
          add("静止状态不能由静摩擦维持。");
      } else if (seg.phase === "contact") {
        const direction =
          Math.abs(seg.vs) > 1e-10 ? Math.sign(seg.vs) : Math.sign(seg.as) || 1;
        if (!eq(seg.as, A - direction * F))
          add("接触阶段的加速度不符合重力和摩擦方程。");
        const finish = evolve(seg, seg.duration);
        if (direction * finish.vs < -1e-7) add("速度反向前没有切换摩擦状态。");
      } else add("未知运动阶段。");
    }
    for (const dt of [0, seg.duration / 2, seg.duration]) {
      const q = sampleSegment(m, seg, dt);
      if (
        !Object.values(q).every(
          (v) => typeof v !== "number" || Number.isFinite(v),
        )
      )
        add("求解轨迹包含无效的物理量。");
      if (q.heat < -1e-7 || q.collisionLoss < -1e-7) add("耗散能量不能为负。");
      if (
        Math.abs(q.kinetic + q.potential + q.heat + q.collisionLoss - E0) >
        1e-7 * Math.max(1, Math.abs(E0)) +
          1e-12 *
            (Math.abs(q.kinetic) +
              Math.abs(q.potential) +
              q.heat +
              q.collisionLoss)
      )
        add("轨迹的能量收支不一致。");
      if (seg.phase !== "flight" && (q.s < -1e-7 || q.s > c.length + 1e-7))
        add("接触轨迹超出平面长度。");
    }
    previous = evolve(seg, seg.duration);
    cursor = seg.t + seg.duration;
  }
  if (nextImpact !== impacts.length) add("存在未衔接到运动阶段的碰撞事件。");
  if (!eq(cursor, m.duration) || !eq(m.terminal.t, m.duration))
    add("终态与求解时间范围不一致。");
  return {
    ok: errors.length === 0,
    complete: errors.length === 0 && m.end !== "resolution",
    errors,
  };
}
export type PreparedMotion =
  | { ok: true; motion: Motion; audit: MotionAudit }
  | { ok: false; errors: string[] };
export function prepareMotion(
  config: Setup,
  attached: boolean,
  solver: (c: Setup) => Motion = solve,
): PreparedMotion {
  const errors = validate(config, attached);
  if (errors.length) return { ok: false, errors };
  try {
    const motion = solver({ ...config }),
      audit = auditMotion(motion);
    if (!audit.ok)
      return {
        ok: false,
        errors: ["求解结果未通过校验，不能生成动画。", ...audit.errors],
      };
    if (!audit.complete)
      return {
        ok: false,
        errors: [
          "当前模型未完成整个观察范围的求解，演化暂不可用。请缩短观察时长或调整恢复系数后重新求解。",
        ],
      };
    if (!motionMatches(motion, config))
      return { ok: false, errors: ["求解结果与当前条件不一致，请重新求解。"] };
    return { ok: true, motion, audit };
  } catch {
    return {
      ok: false,
      errors: ["求解未完成，不能生成动画。请检查参数或调整模型。"],
    };
  }
}
export function motionMatches(motion: Motion | null, config: Setup): boolean {
  return (
    !!motion &&
    (Object.keys(config) as (keyof Setup)[]).every(
      (k) => motion.config[k] === config[k],
    )
  );
}
