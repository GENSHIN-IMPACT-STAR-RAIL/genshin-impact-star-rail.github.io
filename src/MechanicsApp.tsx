import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Play,
  Pause,
  RotateCcw,
  Move,
  FlaskConical,
  Moon,
  Sun,
} from "lucide-react";
import {
  sample,
  initialComponents,
  velocityFromCartesian,
  type Setup,
  type Motion,
  type Phase,
} from "./mechanics";
import { prepareMotion, motionMatches } from "./mechanics-solution";
import { StaticMath } from "./StaticMath";
import { MechanicsScene, VelocityChart } from "./MechanicsScene";
import { useColorTheme } from "./useColorTheme";

const initial: Setup = {
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
const presets: { name: string; config: Setup }[] = [
  { name: "沿面滑动", config: initial },
  {
    name: "抛出后接触",
    config: {
      ...initial,
      length: 16,
      angle: 20,
      velocity: 6,
      direction: 60,
      duration: 5,
    },
  },
  {
    name: "连续反弹",
    config: {
      ...initial,
      length: 20,
      angle: 0,
      position: 3,
      velocity: 5,
      direction: 70,
      restitution: 0.7,
      duration: 3,
    },
  },
];
const fmt = (v: number) =>
  Number.isFinite(v) ? (Math.abs(v) < 0.0005 ? "0.000" : v.toFixed(3)) : "—";
const eventTime = (t: number) =>
  t.toFixed(6).replace(/0+$/, "").replace(/\.$/, "") || "0";
const phaseName: Record<Phase, string> = {
  contact: "沿面接触",
  flight: "自由飞行",
  rest: "静止平衡",
};
const symbols: Record<keyof Setup, string> = {
  length: "L",
  angle: String.raw`\theta`,
  mass: "m",
  velocity: "u",
  direction: String.raw`\alpha`,
  friction: String.raw`\mu`,
  position: "s_0",
  g: "g",
  restitution: "e",
  duration: "T",
};

export default function MechanicsApp() {
  const { theme, toggleTheme } = useColorTheme();
  const [config, setConfig] = useState<Setup>(initial);
  const [attached, setAttached] = useState(false);
  const [stage, setStage] = useState<"build" | "parameters">("build");
  const [computedMotion, setMotion] = useState<Motion | null>(null);
  const [answersVisible, setAnswersVisible] = useState(false),
    [hasStarted, setHasStarted] = useState(false);
  const motion =
    attached && motionMatches(computedMotion, config) ? computedMotion : null;
  const [errors, setErrors] = useState<string[]>([]);
  const [time, setTime] = useState(0),
    [running, setRunning] = useState(false),
    [speed, setSpeed] = useState(1);
  const [velocityMode, setVelocityMode] = useState<"polar" | "cartesian">(
    "polar",
  );
  const [components, setComponents] = useState({ vx: 0, vy: 0 });
  const state = motion ? sample(motion, time) : null;
  const done = !!motion && time >= motion.duration;
  function invalidate() {
    setAnswersVisible(false);
    setHasStarted(false);
    setRunning(false);
    setMotion(null);
    setErrors([]);
    setTime(0);
  }
  function change(key: keyof Setup, value: number) {
    invalidate();
    setConfig((c) => {
      const next = { ...c, [key]: value };
      return key === "angle" && velocityMode === "cartesian"
        ? {
            ...next,
            ...velocityFromCartesian(components.vx, components.vy, value),
          }
        : next;
    });
  }
  function changeMode(mode: "polar" | "cartesian") {
    const { vx, vy } = initialComponents(config);
    setComponents({ vx, vy });
    setVelocityMode(mode);
  }
  function changeComponent(key: "vx" | "vy", value: number) {
    const next = { ...components, [key]: value };
    setComponents(next);
    invalidate();
    setConfig((c) => ({
      ...c,
      ...velocityFromCartesian(next.vx, next.vy, c.angle),
    }));
  }
  useEffect(() => {
    if (!running || !motion) return;
    let id = 0,
      last: number | null = null;
    const frame = (now: number) => {
      if (last !== null) {
        const dt = Math.min((now - last) / 1000, 0.1) * speed;
        setTime((t) => Math.min(motion.duration, t + dt));
      }
      last = now;
      id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(id);
  }, [running, motion, speed]);
  useEffect(() => {
    if (done) setRunning(false);
  }, [done]);
  function check() {
    setRunning(false);
    setTime(0);
    setAnswersVisible(false);
    setHasStarted(false);
    const result = prepareMotion(config, attached);
    setErrors(result.ok ? [] : result.errors);
    setMotion(result.ok ? result.motion : null);
  }
  function field(
    label: string,
    key: keyof Setup,
    unit: string,
    min: number,
    max: number,
    step: number,
  ) {
    return (
      <label className="mech-field">
        <span>
          {label} <StaticMath value={symbols[key]} />
        </span>
        <div>
          <input
            aria-label={`${label} ${key}`}
            type="number"
            value={Number.isFinite(config[key]) ? config[key] : ""}
            min={min}
            max={max}
            step={step}
            onChange={(e) =>
              change(key, e.target.value === "" ? NaN : Number(e.target.value))
            }
          />
          <small>{unit}</small>
        </div>
      </label>
    );
  }
  const outcome = !motion
    ? ""
    : motion.end === "rest"
      ? `在 ${eventTime(motion.duration)} s 达到静止平衡。`
      : motion.end === "resolution"
        ? "可演示至计算边界，详见下面的提示。"
        : `已预测 ${config.duration} s 内的运动；到达观察时长后停止播放。`;
  const collisions =
    motion?.events.filter((e) => e.kind === "impact").length ?? 0;
  const eventEnergy = state
    ? state.kinetic + state.potential + state.heat + state.collisionLoss
    : undefined;
  const readings: [string, string, number | undefined, string][] = [
    ["水平位置", "X", state?.x, "m"],
    ["竖直位置", "Y", state?.y, "m"],
    ["沿面投影", "s", state?.s, "m"],
    ["离面法向距离", "n", state?.n, "m"],
    ["切向速度", "v_s", state?.vs, "m/s"],
    ["法向速度", "v_n", state?.vn, "m/s"],
    ["水平速度", "v_X", state?.vx, "m/s"],
    ["竖直速度", "v_Y", state?.vy, "m/s"],
    ["速率", "|v|", state?.speed, "m/s"],
    ["切向加速度", "a_s", state?.as, "m/s²"],
    ["法向加速度", "a_n", state?.an, "m/s²"],
    ["支持力", "R", state?.normal, "N"],
    ["切向摩擦力", "f", state?.friction, "N"],
    ["动能", "E_k", state?.kinetic, "J"],
    ["重力势能", "E_p", state?.potential, "J"],
    ["摩擦耗散", "Q_f", state?.heat, "J"],
    ["碰撞损失", "Q_c", state?.collisionLoss, "J"],
  ];
  return (
    <div className="mechanics-app">
      <header className="mech-header">
        <a href="/mechanics.html" aria-label="返回装置搭建">
          <ArrowLeft size={18} />
        </a>
        <FlaskConical size={24} />
        <div>
          <strong>力学实验台</strong>
          <span>MATHROOM / MECHANICS LAB</span>
        </div>
        <span className="mech-badge">接触 · 飞行 · 碰撞</span>
        <a className="mech-library-link" href="/mechanics-objects.html">
          物体图鉴
        </a>
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={theme === "light" ? "切换深色模式" : "切换浅色模式"}
        >
          {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
        </button>
      </header>
      <main className="mech-layout">
        <aside className="mech-sidebar">
          <div className="mech-steps">
            <button
              className={stage === "build" ? "active" : ""}
              onClick={() => {
                invalidate();
                setStage("build");
              }}
            >
              01 搭建装置
            </button>
            <button
              className={stage === "parameters" ? "active" : ""}
              disabled={!attached}
              onClick={() => setStage("parameters")}
            >
              02 设置与检验
            </button>
          </div>
          <h1>
            {stage === "build" ? "同一装置，不同运动。" : "让参数决定运动。"}
          </h1>
          <p className="mech-muted">
            {stage === "build"
              ? "拖动滑块放到平面，或从示例开始。吸附只确定初始位置，物体可以离开平面。"
              : "设置初速度、接触与碰撞参数，完成求解与校验后开始演化。"}
          </p>
          <div className="mech-presets" aria-label="装置示例">
            {presets.map((p) => (
              <button
                key={p.name}
                onClick={() => {
                  invalidate();
                  setConfig({ ...p.config });
                  setAttached(true);
                  setStage("parameters");
                  setVelocityMode("polar");
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
          <section>
            <h2>
              平面 <span>FINITE SURFACE</span>
            </h2>
            {field("平面长度", "length", "m", 0.1, 1000, 0.5)}
            {field("倾斜角度", "angle", "°", 0, 85, 1)}
            <input
              className="mech-range"
              aria-label="调整倾角"
              type="range"
              min="0"
              max="85"
              value={Number.isFinite(config.angle) ? config.angle : 0}
              onChange={(e) => change("angle", +e.target.value)}
            />
          </section>
          <section>
            <h2>
              滑块 <span>PARTICLE</span>
            </h2>
            <div className={`mech-attach ${attached ? "attached" : ""}`}>
              <Move size={16} />
              {attached ? "初始位置已放到平面" : "等待放置"}
            </div>
            {field(
              "初始位置（距上端）",
              "position",
              "m",
              0,
              config.length,
              0.1,
            )}
            {stage === "build" ? (
              <>
                <button
                  className="mech-secondary full"
                  onClick={() => {
                    invalidate();
                    setAttached(true);
                    setConfig((c) => ({
                      ...c,
                      position: Number.isFinite(c.length) ? c.length * 0.2 : 0,
                    }));
                  }}
                >
                  将滑块放到平面上
                </button>
                <button
                  className="mech-primary full"
                  disabled={!attached}
                  onClick={() => setStage("parameters")}
                >
                  装置搭建完成 →
                </button>
              </>
            ) : (
              <>
                {field("质量", "mass", "kg", 0.01, 10000, 0.1)}
                <div
                  className="mech-input-mode"
                  role="group"
                  aria-label="初速度输入方式"
                >
                  <button
                    aria-pressed={velocityMode === "polar"}
                    onClick={() => changeMode("polar")}
                  >
                    大小与方向
                  </button>
                  <button
                    aria-pressed={velocityMode === "cartesian"}
                    onClick={() => changeMode("cartesian")}
                  >
                    水平与竖直
                  </button>
                </div>
                {velocityMode === "polar" ? (
                  <>
                    {field("初速大小", "velocity", "m/s", 0, 100, 0.5)}
                    {field("速度方向", "direction", "°", -180, 180, 5)}
                    <p className="mech-field-hint">
                      0° 沿面向下，90° 垂直离面，180°
                      沿面向上；负角度朝向平面内部。
                    </p>
                  </>
                ) : (
                  <>
                    {(["vx", "vy"] as const).map((key) => (
                      <label className="mech-field" key={key}>
                        <span>
                          {key === "vx" ? "水平初速度" : "竖直初速度"}{" "}
                          <StaticMath value={key === "vx" ? "u_X" : "u_Y"} />
                        </span>
                        <div>
                          <input
                            aria-label={
                              key === "vx" ? "水平初速度" : "竖直初速度"
                            }
                            type="number"
                            step="0.1"
                            value={
                              Number.isFinite(components[key])
                                ? Number(components[key].toFixed(8))
                                : ""
                            }
                            onChange={(e) =>
                              changeComponent(
                                key,
                                e.target.value === ""
                                  ? NaN
                                  : Number(e.target.value),
                              )
                            }
                          />
                          <small>m/s</small>
                        </div>
                      </label>
                    ))}
                    <p className="mech-field-hint">
                      水平向右、竖直向上为正。合速度不能超过 100 m/s。
                    </p>
                  </>
                )}
                {field("接触摩擦因数", "friction", "", 0, 5, 0.05)}
                {field("恢复系数", "restitution", "", 0, 1, 0.05)}
                <p className="mech-field-hint">
                  e = 0：法向不反弹；e =
                  1：法向完全弹性。碰撞瞬间无切向摩擦冲量。
                </p>
                {field("重力加速度", "g", "m/s²", 9.8, 10, 0.01)}
                {field("观察时长", "duration", "s", 0.1, 120, 0.5)}
                <button className="mech-primary full" onClick={check}>
                  <CheckCircle2 size={18} />
                  求解并校验
                </button>
              </>
            )}
          </section>
          {errors.length > 0 && (
            <div role="alert" className="mech-report error">
              <strong>请先修正</strong>
              {errors.map((e) => (
                <p key={e}>{e}</p>
              ))}
            </div>
          )}
          {motion && (
            <div role="status" className="mech-report">
              <strong>✓ 已求解并通过校验</strong>
              <p>可以开始演化。答案、数值和预测事件默认隐藏。</p>
              <p>修改条件后须重新求解。</p>
            </div>
          )}
          <details className="mech-assumptions">
            <summary>模型假设与边界</summary>
            <p>
              一个质点与一个固定、有限、单面的平面。没有地面、侧壁或平面背面碰撞；离开端点后只受重力。矩形不参与碰撞几何，也不计算旋转。
            </p>
            <p>
              接触时静摩擦上限和滑动摩擦共用
              μ。碰撞时切向速度不变，法向满足恢复系数定律；冲量单独记录，不显示为有限碰撞力。
            </p>
            <p>
              连续反弹间隔小于 10⁻⁷ s 或事件数达到 512
              时报告求解边界；未完成整段求解时不开放演化。观察时长最多 120 s。
            </p>
          </details>
        </aside>
        <div className="mech-workspace">
          <section className="mech-scene">
            <div className="mech-scene-heading">
              <div>
                <span className="mech-eyebrow">
                  ONE SCENE / MULTIPLE PHASES
                </span>
                <h2>接触、离面与再次相遇</h2>
              </div>
              <span className={`mech-status ${running ? "live" : ""}`}>
                {!state
                  ? "等待求解"
                  : !hasStarted
                    ? "已求解，待演化"
                    : `${running ? "● " : ""}${phaseName[state.phase]}${done ? " · 已结束" : !running && time > 0 ? " · 已暂停" : ""}`}
              </span>
            </div>
            <MechanicsScene
              config={config}
              attached={attached}
              editable={stage === "build"}
              motion={motion}
              time={time}
              state={state}
              showForces={answersVisible}
              onPlace={(p) => {
                invalidate();
                setAttached(p !== null);
                if (p !== null) setConfig((c) => ({ ...c, position: p }));
              }}
            />
            <div className="mech-playback">
              <button
                className="mech-primary"
                disabled={!motion || (done && hasStarted)}
                onClick={() => {
                  setHasStarted(true);
                  setRunning((r) =>
                    motion && motion.duration > 0 ? !r : false,
                  );
                }}
              >
                {running ? <Pause size={18} /> : <Play size={18} />}{" "}
                {running ? "暂停" : time > 0 ? "继续" : "演化"}
              </button>
              <button
                className="mech-icon"
                aria-label="回到初始状态"
                disabled={!motion}
                onClick={() => {
                  setRunning(false);
                  setTime(0);
                  setHasStarted(false);
                }}
              >
                <RotateCcw size={19} />
              </button>
              <div className="mech-clock">
                {answersVisible ? (
                  <>
                    <strong>{fmt(time)}</strong>
                    <span>s{motion ? ` / ${fmt(motion.duration)} s` : ""}</span>
                  </>
                ) : (
                  <span>
                    {!motion
                      ? "待求解"
                      : !hasStarted
                        ? "等待演化"
                        : running
                          ? "正在演化"
                          : done
                            ? "演化结束"
                            : "已暂停"}
                  </span>
                )}
              </div>
              <label className="mech-speed">
                速度
                <select
                  aria-label="播放速度"
                  value={speed}
                  onChange={(e) => setSpeed(+e.target.value)}
                >
                  <option value="0.1">0.1×</option>
                  <option value="0.25">0.25×</option>
                  <option value="0.5">0.5×</option>
                  <option value="1">1×</option>
                  <option value="2">2×</option>
                </select>
              </label>
            </div>
            <input
              className="mech-timeline"
              aria-label={answersVisible ? "演化时间" : "演化进度"}
              aria-valuetext={
                answersVisible
                  ? `${fmt(time)} 秒`
                  : `${motion?.duration ? Math.round((time / motion.duration) * 100) : 0}%`
              }
              type="range"
              min="0"
              max={motion?.duration || 1}
              step="any"
              value={time}
              disabled={!motion || motion.duration === 0}
              onChange={(e) => {
                setRunning(false);
                setHasStarted(true);
                setTime(+e.target.value);
              }}
            />
            {motion && done && hasStarted && (
              <p className="mech-end-note">
                {motion.end === "rest"
                  ? "物体已达到静止平衡。"
                  : motion.end === "resolution"
                    ? "已到达计算分辨率边界，未假定物体静止。"
                    : "观察时长结束；可增加时长后重新检验。"}
              </p>
            )}
          </section>
          <section className="mech-answer-control">
            <div>
              <h2>答案与计算过程</h2>
              <p>
                {!motion
                  ? "完成求解与校验后可查看。"
                  : answersVisible
                    ? "答案、事件和动画使用同一份求解结果。"
                    : "答案已计算，点击后显示；动画可独立播放。"}
              </p>
            </div>
            <button
              className="mech-secondary"
              disabled={!motion}
              aria-expanded={answersVisible && !!motion}
              aria-controls="mech-solved-results"
              onClick={() => setAnswersVisible((v) => !v)}
            >
              {answersVisible ? "隐藏答案" : "显示答案"}
            </button>
          </section>
          {answersVisible && motion && (
            <div id="mech-solved-results">
              <div className="mech-solved-summary">
                <p>{outcome}</p>
                <p>
                  本次计算得到 {collisions} 次碰撞、
                  {motion.events.filter((e) => e.kind === "edge").length}{" "}
                  次滑出端点。
                </p>
                {motion.warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
              </div>
              <details className="mech-answer-detail">
                <summary>查看事件与阶段</summary>
                <section className="mech-events">
                  <div className="mech-section-title">
                    <h2>事件记录与预测</h2>
                    <span>点击事件，暂停到该时刻</span>
                  </div>
                  {motion ? (
                    <ol>
                      {motion.events.map((e, i) => (
                        <li
                          key={i}
                          className={e.t <= time ? "occurred" : "future"}
                        >
                          <button
                            onClick={() => {
                              setRunning(false);
                              setHasStarted(true);
                              setTime(e.t);
                            }}
                          >
                            <time>{eventTime(e.t)} s</time>
                            <strong>{e.label}</strong>
                            <span>{e.t <= time ? "已发生" : "预测"}</span>
                          </button>
                          <p>
                            {e.detail}
                            {e.impulse !== undefined && (
                              <>
                                {" "}
                                法向冲量 {fmt(e.impulse)} N·s；本次能量损失{" "}
                                {fmt(e.loss!)} J。
                              </>
                            )}
                          </p>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="mech-field-hint">
                      检验后预测离面、碰撞、转向与端点事件。
                    </p>
                  )}
                </section>
              </details>
              <details className="mech-results">
                <summary>调取物理量、图像与运动方程</summary>
                <section className="mech-readings">
                  <div className="mech-section-title">
                    <h2>此刻的物理量</h2>
                    <span>
                      {state ? "碰撞时刻显示碰撞后读数" : "检验后显示"}
                    </span>
                  </div>
                  <div className="mech-metrics">
                    {readings.map(([label, symbol, value, unit]) => (
                      <div className="mech-metric" key={label}>
                        <span>
                          {label} <StaticMath value={symbol} />
                        </span>
                        <strong>
                          {value === undefined ? "—" : fmt(value)}
                          <small>{unit}</small>
                        </strong>
                      </div>
                    ))}
                  </div>
                  <p className="mech-footnote">
                    X 向右、Y 向上，初始上端的 X = 0，下端的 Y = 0。s
                    沿平面向下，n 垂直向外；越过有限表面后可为负值。势能以 Y = 0
                    为零点。
                  </p>
                  {state && (
                    <p className="mech-energy">
                      <StaticMath value={String.raw`E_k+E_p+Q_f+Q_c`} /> ≈{" "}
                      {fmt(eventEnergy!)} J{" "}
                      <span>初始总能量 {fmt(motion!.initialEnergy)} J</span>
                    </p>
                  )}
                </section>
                <section className="mech-bottom">
                  <div className="mech-equation">
                    <h2>当前运动方程</h2>
                    {!state ? (
                      <p className="mech-field-hint">
                        检验后显示当前阶段的方程。
                      </p>
                    ) : state.phase === "flight" ? (
                      <>
                        <p>
                          <StaticMath value={String.raw`a_X=0,\quad a_Y=-g`} />
                        </p>
                        <p>
                          <StaticMath value={String.raw`R=0,\quad f=0`} />
                        </p>
                        <span>离面后仅受重力，运动为抛体运动。</span>
                      </>
                    ) : (
                      <>
                        <p>
                          <StaticMath value={String.raw`R=mg\cos\theta`} />
                        </p>
                        <p>
                          <StaticMath value={String.raw`ma_s=mg\sin\theta+f`} />
                        </p>
                        <span>
                          {state.phase === "rest" ? (
                            <StaticMath
                              value={String.raw`f=-mg\sin\theta,\quad |f|\leq\mu R`}
                            />
                          ) : (
                            <StaticMath
                              value={`${state.friction > 0 ? "f=+" : "f=-"}\\mu R`}
                            />
                          )}
                        </span>
                        <p className="mech-substitution">
                          <StaticMath
                            value={`${fmt(config.mass)} \\times ${fmt(state.as)} \\approx ${fmt(config.mass * motion!.gravity)} + (${fmt(state.friction)})`}
                          />
                        </p>
                      </>
                    )}
                    <h2 className="mech-collision-title">碰撞规则</h2>
                    <p>
                      <StaticMath
                        value={String.raw`v_n^+=-ev_n^-,\quad v_s^+=v_s^-`}
                      />
                    </p>
                    <span>− 为碰撞前，+ 为碰撞后；瞬时冲量见事件记录。</span>
                  </div>
                  <div className="mech-chart">
                    <h2>速度分量随时间变化</h2>
                    <p className="mech-chart-legend">
                      <span>
                        — 切向 <StaticMath value="v_s" />
                      </span>
                      <span>
                        — 法向 <StaticMath value="v_n" />
                      </span>
                      <small>m/s</small>
                    </p>
                    {motion && motion.duration > 0 ? (
                      <VelocityChart motion={motion} time={time} />
                    ) : (
                      <div className="mech-chart-empty">
                        {motion ? "静止状态：v = 0" : "检验通过后生成预测曲线"}
                      </div>
                    )}
                    <p className="mech-field-hint">
                      碰撞前后分别绘制，不把速度突变连接为连续加速。
                    </p>
                  </div>
                </section>
              </details>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
