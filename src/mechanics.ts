/** Exact phases for a point particle and a finite one-sided plane.
 * s: downhill tangent; n: outward normal. X right, Y up.
 * Impacts have no tangential impulse; sustained contact uses Coulomb friction.
 */
export type Setup = {
  length: number;
  angle: number;
  mass: number;
  velocity: number;
  direction: number;
  friction: number;
  position: number;
  g: number;
  restitution: number;
  duration: number;
};
export type Phase = "contact" | "flight" | "rest";
export type Kinematics = { s: number; n: number; vs: number; vn: number };
export type Segment = Kinematics & {
  t: number;
  duration: number;
  phase: Phase;
  as: number;
  an: number;
  heat: number;
  collisionLoss: number;
};
export type MotionEvent = {
  t: number;
  kind: "launch" | "impact" | "edge" | "turn" | "rest" | "limit";
  label: string;
  detail: string;
  before: Kinematics;
  after: Kinematics;
  impulse?: number;
  loss?: number;
};
export type Motion = {
  config: Setup;
  segments: Segment[];
  events: MotionEvent[];
  duration: number;
  end: "rest" | "horizon" | "resolution";
  warnings: string[];
  terminal: Segment;
  gravity: number;
  normal: number;
  initialEnergy: number;
};
const EPS = 1e-10;
const MIN_REBOUND_TIME = 1e-7;
const MAX_EVENTS = 512;
const clean = (v: number) => (Math.abs(v) < EPS ? 0 : v);
const describe = (n: number) => n.toFixed(4);
export function initialComponents(c: Setup) {
  const alpha = (c.direction * Math.PI) / 180,
    theta = (c.angle * Math.PI) / 180;
  const vs = clean(c.velocity * Math.cos(alpha)),
    vn = clean(c.velocity * Math.sin(alpha));
  return {
    vs,
    vn,
    vx: vs * Math.cos(theta) + vn * Math.sin(theta),
    vy: -vs * Math.sin(theta) + vn * Math.cos(theta),
  };
}
export function velocityFromCartesian(vx: number, vy: number, angle: number) {
  const theta = (angle * Math.PI) / 180;
  const vs = vx * Math.cos(theta) - vy * Math.sin(theta),
    vn = vx * Math.sin(theta) + vy * Math.cos(theta);
  return {
    velocity: Math.hypot(vx, vy),
    direction: (Math.atan2(vn, vs) * 180) / Math.PI,
  };
}
export function validate(c: Setup, attached: boolean): string[] {
  const errors: string[] = [];
  if (!attached) errors.push("滑块尚未放到平面，请先完成搭建。");
  if (!Object.values(c).every(Number.isFinite))
    errors.push("所有参数必须是有限数值，不能留空。");
  if (!(c.length >= 0.1 && c.length <= 1000))
    errors.push("平面长度应在 0.1–1000 m 之间。");
  if (!(c.angle >= 0 && c.angle <= 85)) errors.push("倾角应在 0–85° 之间。");
  if (!(c.mass > 0 && c.mass <= 10000))
    errors.push("质量应大于 0 且不超过 10000 kg。");
  if (!(c.friction >= 0 && c.friction <= 5))
    errors.push("摩擦因数应在 0–5 之间。");
  if (!(c.velocity >= 0 && c.velocity <= 100))
    errors.push("初速大小应在 0–100 m/s 之间；上滑请将方向设为 180°。");
  if (!(c.direction >= -180 && c.direction <= 180))
    errors.push("速度方向应在 −180°–180° 之间。");
  if (!(c.position >= 0 && c.position <= c.length))
    errors.push("初始位置超出平面：请增加长度或重新放置滑块。");
  if (
    !(c.g >= 9.8 && c.g <= 10) ||
    Math.abs(c.g * 100 - Math.round(c.g * 100)) > 1e-8
  )
    errors.push("重力加速度应为 9.80–10.00 m/s²，步长为 0.01。");
  if (!(c.restitution >= 0 && c.restitution <= 1))
    errors.push("恢复系数 e 应在 0–1 之间。");
  if (!(c.duration >= 0.1 && c.duration <= 120))
    errors.push("观察时长应在 0.1–120 s 之间。");
  return errors;
}
export function evolve(segment: Segment, dt: number): Kinematics {
  return {
    s: segment.s + segment.vs * dt + (segment.as * dt * dt) / 2,
    n: segment.n + segment.vn * dt + (segment.an * dt * dt) / 2,
    vs: segment.vs + segment.as * dt,
    vn: segment.vn + segment.an * dt,
  };
}
export function solve(config: Setup): Motion {
  if (validate(config, true).length) throw new Error("Invalid setup");
  const c = { ...config },
    theta = (c.angle * Math.PI) / 180;
  const A = c.g * Math.sin(theta),
    B = c.g * Math.cos(theta),
    F = c.friction * B;
  const start = initialComponents(c);
  let k: Kinematics = { s: c.position, n: 0, vs: start.vs, vn: start.vn };
  let t = 0,
    heat = 0,
    collisionLoss = 0,
    phase: Phase = k.vn === 0 ? "contact" : "flight";
  let end: Motion["end"] = "horizon";
  const segments: Segment[] = [],
    events: MotionEvent[] = [],
    warnings: string[] = [];
  const initialEnergy =
    c.mass * c.g * (c.length - c.position) * Math.sin(theta) +
    (c.mass * c.velocity ** 2) / 2;
  const event = (
    kind: MotionEvent["kind"],
    label: string,
    detail: string,
    before = { ...k },
    extra: Partial<MotionEvent> = {},
  ) => {
    events.push({ t, kind, label, detail, before, after: { ...k }, ...extra });
  };
  const segment = (as: number, an: number, duration = 0): Segment => ({
    ...k,
    t,
    duration,
    as,
    an,
    phase,
    heat,
    collisionLoss,
  });
  const advance = (dt: number, as: number, an: number) => {
    if (dt <= 0) return;
    const seg = segment(as, an, dt);
    segments.push(seg);
    const next = evolve(seg, dt);
    if (phase === "contact") heat += c.mass * F * Math.abs(next.s - k.s);
    k = next;
    t += dt;
  };
  const impact = () => {
    const before = { ...k },
      outgoing = -c.restitution * k.vn;
    const loss = (c.mass * (k.vn * k.vn - outgoing * outgoing)) / 2;
    k = { ...k, n: 0, vn: outgoing };
    collisionLoss += loss;
    phase = outgoing > 0 ? "flight" : "contact";
    event(
      "impact",
      "与平面碰撞",
      `法向速度 ${describe(before.vn)} → ${describe(outgoing)} m/s；切向速度不变。`,
      before,
      { impulse: c.mass * (outgoing - before.vn), loss },
    );
    if (outgoing > 0 && (2 * outgoing) / B < MIN_REBOUND_TIME) {
      end = "resolution";
      warnings.push(
        "连续反弹间隔小于 0.0000001 s，已在本次碰撞后停止。未将微小反弹冒充静止；可设 e = 0 观察接触后的运动。",
      );
      return false;
    }
    return true;
  };
  if (k.vn < 0) {
    warnings.push(
      "初速度指向平面内部：将在 t = 0 先处理碰撞，初始读数显示碰撞后的状态。",
    );
    impact();
  } else if (k.vn > 0)
    event("launch", "离开平面", "初速度具有朝外的法向分量，开始自由飞行。");
  const reachedResolution = () => end === "resolution";
  let terminal = segment(A, -B);
  for (let iteration = 0; iteration <= MAX_EVENTS; iteration++) {
    if (reachedResolution()) {
      terminal = segment(A, -B);
      break;
    }
    if (iteration === MAX_EVENTS) {
      end = "resolution";
      warnings.push("事件数量达到 512，已停止；请缩短观察时长。");
      terminal = segment(
        phase === "contact" ? A - Math.sign(k.vs || 1) * F : A,
        phase === "contact" ? 0 : -B,
      );
      break;
    }
    if (phase === "contact") {
      k.n = 0;
      k.vn = 0;
      k.vs = clean(k.vs);
      if (k.vs === 0 && A <= F + EPS) {
        phase = "rest";
        end = "rest";
        terminal = segment(0, 0);
        event("rest", "静止平衡", "静摩擦足以平衡沿平面的重力分量。");
        break;
      }
      const direction = k.vs < 0 ? -1 : 1,
        as = A - direction * F;
      if ((k.s <= 0 && direction < 0) || (k.s >= c.length && direction > 0)) {
        phase = "flight";
        event("edge", "滑出平面端点", "接触约束解除，随后仅受重力作用。");
        continue;
      }
      terminal = segment(as, 0);
      if (t >= c.duration) break;
      const d = direction < 0 ? k.s : c.length - k.s,
        speed = Math.abs(k.vs),
        along = direction * as;
      const stop = along < 0 ? speed / -along : Infinity;
      const stoppingDistance =
        along < 0 ? (speed * speed) / (-2 * along) : Infinity;
      const edge =
        d <= stoppingDistance
          ? d === 0
            ? 0
            : (2 * d) /
              (speed + Math.sqrt(Math.max(0, speed * speed + 2 * along * d)))
          : Infinity;
      const remaining = c.duration - t;
      if (remaining < Math.min(stop, edge)) {
        advance(remaining, as, 0);
        terminal = segment(as, 0);
        break;
      }
      if (stop <= edge) {
        advance(stop, as, 0);
        k.vs = 0;
        if (A > F + EPS)
          event("turn", "速度降至零后返回", "随后沿平面向下加速。");
      } else {
        advance(edge, as, 0);
        k.s = direction < 0 ? 0 : c.length;
        phase = "flight";
        event("edge", "滑出平面端点", "接触约束解除，随后仅受重力作用。");
      }
    } else {
      terminal = segment(A, -B);
      if (t >= c.duration) break;
      const remaining = c.duration - t;
      let hit = Infinity;
      if (k.n >= 0) {
        const root = Math.sqrt(k.vn * k.vn + 2 * B * k.n);
        const candidate =
          k.vn >= 0 ? (k.vn + root) / B : (2 * k.n) / (root - k.vn);
        if (candidate > 0) {
          const sHit = k.s + k.vs * candidate + (A * candidate * candidate) / 2;
          if (sHit >= 0 && sHit <= c.length) hit = candidate;
        }
      }
      if (hit > remaining) {
        advance(remaining, A, -B);
        terminal = segment(A, -B);
        break;
      }
      advance(hit, A, -B);
      k.n = 0;
      if (!impact()) {
        terminal = segment(A, -B);
        break;
      }
    }
  }
  if (end === "horizon")
    event(
      "limit",
      "观察时长结束",
      "仅停止播放，物体仍可继续运动；可增加观察时长后重新检验。",
    );
  if (end === "resolution")
    event("limit", "达到计算分辨率边界", warnings.at(-1) ?? "计算停止。");
  return {
    config: c,
    segments,
    events,
    duration: t,
    end,
    warnings,
    terminal,
    gravity: A,
    normal: c.mass * B,
    initialEnergy,
  };
}
export function sampleSegment(m: Motion, segment: Segment, dt: number) {
  const k = evolve(segment, dt),
    c = m.config,
    theta = (c.angle * Math.PI) / 180;
  const cos = Math.cos(theta),
    sin = Math.sin(theta);
  const friction =
    segment.phase === "flight" ? 0 : c.mass * (segment.as - m.gravity);
  const heat =
    segment.heat +
    (segment.phase === "contact"
      ? c.friction * m.normal * Math.abs(k.s - segment.s)
      : 0);
  return {
    ...k,
    t: segment.t + dt,
    phase: segment.phase,
    as: segment.as,
    an: segment.an,
    x: k.s * cos + k.n * sin,
    y: (c.length - k.s) * sin + k.n * cos,
    vx: k.vs * cos + k.vn * sin,
    vy: -k.vs * sin + k.vn * cos,
    ax: segment.as * cos + segment.an * sin,
    ay: -segment.as * sin + segment.an * cos,
    speed: Math.hypot(k.vs, k.vn),
    normal: segment.phase === "flight" ? 0 : m.normal,
    friction,
    kinetic: (c.mass * (k.vs * k.vs + k.vn * k.vn)) / 2,
    potential: c.mass * c.g * ((c.length - k.s) * sin + k.n * cos),
    heat,
    collisionLoss: segment.collisionLoss,
  };
}
/** Right-continuous at impacts: events retain both incoming and outgoing velocities. */
export function sample(m: Motion, time: number) {
  const t = Math.max(0, Math.min(time, m.duration));
  const seg =
    t >= m.duration
      ? m.terminal
      : (m.segments.find((s) => t >= s.t && t < s.t + s.duration) ??
        m.terminal);
  return sampleSegment(m, seg, Math.max(0, Math.min(seg.duration, t - seg.t)));
}
export type Sample = ReturnType<typeof sample>;
