import { Field, NumberField, Notice, Panel, Result } from "../shared";
import { useStatisticsWorkspace, useToolState } from "../workspace";
import type { ProbabilityState } from "./state";
import { eventSummary, probabilityModel, sourcePrior } from "./model";
import type { EventSummary, Outcome } from "./model";
import { attempt, fmt, HiddenResults, Select } from "./ui";

type TreeNode = {
  label: string;
  edge: number;
  mass: number;
  children: Map<string, TreeNode>;
};
function ProbabilityTree({ outcomes }: { outcomes: Outcome[] }) {
  const root: TreeNode = {
    label: "开始",
    edge: 1,
    mass: 1,
    children: new Map(),
  };
  for (const o of outcomes) {
    if (!o.path) continue;
    let current = root;
    let mass = 1;
    for (const branch of o.path) {
      mass *= branch.p;
      let child = current.children.get(branch.label);
      if (!child) {
        child = {
          label: branch.label,
          edge: branch.p,
          mass,
          children: new Map(),
        };
        current.children.set(branch.label, child);
      }
      current = child;
    }
  }
  function render(node: TreeNode, depth: number): React.ReactNode {
    return (
      <li key={node.label}>
        <span>
          {node.label}：分支 {fmt(node.edge)}；到此路径 {fmt(node.mass)}
        </span>
        {node.children.size > 0 && (
          <details open={depth < 2}>
            <summary>
              {node.children.size} 条后续分支；概率和{" "}
              {fmt([...node.children.values()].reduce((a, b) => a + b.edge, 0))}
            </summary>
            <ul>
              {[...node.children.values()].map((child) =>
                render(child, depth + 1),
              )}
            </ul>
          </details>
        )}
        {!node.children.size && <span className="data-tiny">　■ 已停止</span>}
      </li>
    );
  }
  return root.children.size ? (
    <div className="data-tree">
      <p className="data-viz-caption">
        沿路径相乘，互斥终点相加。每个可继续节点的出边概率之和为
        1；叶节点已停止。
      </p>
      <ul>{render(root, 0)}</ul>
    </div>
  ) : (
    <Notice>
      此模板显示聚合后的有限结果；没有逐阶段路径可画。抽球和两阶段来源模板可查看完整树。
    </Notice>
  );
}
function Venn({ summary }: { summary: EventSummary }) {
  const [ab, aOnly, bOnly, neither] = summary.cells;
  return (
    <>
      <svg
        className="data-chart"
        viewBox="0 0 620 260"
        role="img"
        aria-label="事件 A、B 的 Venn 关系示意图，区域不按概率比例绘制"
      >
        <rect
          x="20"
          y="15"
          width="580"
          height="225"
          rx="12"
          fill="none"
          stroke="currentColor"
          strokeOpacity=".35"
        />
        <circle cx="250" cy="125" r="85" fill="color-mix(in srgb, var(--accent) 15%, transparent)" stroke="var(--accent)" />
        <circle cx="370" cy="125" r="85" fill="color-mix(in srgb, var(--stats-gold) 15%, transparent)" stroke="var(--stats-gold)" />
        <text x="210" y="60">
          A
        </text>
        <text x="400" y="60">
          B
        </text>
        <text x="216" y="131" textAnchor="middle">
          {fmt(aOnly)}
        </text>
        <text x="310" y="131" textAnchor="middle">
          {fmt(ab)}
        </text>
        <text x="401" y="131" textAnchor="middle">
          {fmt(bOnly)}
        </text>
        <text x="45" y="220">
          两者都不发生：{fmt(neither)}
        </text>
      </svg>
      <p className="data-viz-caption">
        圆仅表示集合关系。区域面积没有按概率比例构造；相交部分标注的是 P(A∩B)。
      </p>
    </>
  );
}
export function ProbabilityTool() {
  const [s, set] = useToolState<ProbabilityState>("probability"),
    { resultsHidden } = useStatisticsWorkspace();
  const update = <K extends keyof ProbabilityState>(
    key: K,
    value: ProbabilityState[K],
  ) => set((old) => ({ ...old, [key]: value }));
  const model = attempt(() => {
      const m = probabilityModel(s);
      return { ...m, summary: eventSummary(m.outcomes, s.direction) };
    }),
    m = model.value;
  const inverse =
    s.template === "source"
      ? attempt(() => sourcePrior(s.totalTarget, s.sourceA, s.sourceB))
      : null;
  const probabilityInput = (
    key: "sourceP" | "sourceA" | "sourceB" | "successP" | "totalTarget",
    label: string,
  ) => (
    <NumberField
      label={label}
      value={s[key]}
      min={0}
      max={1}
      step={0.01}
      onChange={(v) => update(key, v)}
    />
  );
  const setOutcomeEvent = (
    index: number,
    event: "A" | "B",
    checked: boolean,
  ) => {
    if (!m) return;
    update(
      "outcomes",
      m.outcomes
        .map(
          (o, i) =>
            `${o.label} ${o.p} ${event === "A" && i === index ? Number(checked) : Number(o.A)} ${event === "B" && i === index ? Number(checked) : Number(o.B)}`,
        )
        .join("\n"),
    );
  };
  return (
    <div className="stats-stack">
      <Panel title="试验模型与事件">
        <Select
          label="试验模板"
          value={s.template}
          onChange={(v) => update("template", v)}
          options={[
            ["table", "自定义有限结果：概率权重与事件"],
            ["dice", "两枚公平骰子的结果格"],
            ["bag", "袋中抽球：放回规则与停止条件"],
            ["source", "两阶段来源：全概率与贝叶斯"],
            ["success", "第 r 次成功恰在第 k 次"],
          ]}
        />
        {s.template === "table" && (
          <Field
            label="每行：结果名称 概率 A(0/1) B(0/1)"
            hint="名称不含空格或逗号；每行互不重叠且穷尽，总概率须为 1。"
          >
            <textarea
              className="stats-textarea"
              rows={7}
              maxLength={20000}
              value={s.outcomes}
              onChange={(e) => update("outcomes", e.target.value)}
            />
          </Field>
        )}
        {s.template === "dice" && (
          <div className="stats-grid">
            <NumberField
              label="每枚骰子的面数"
              value={s.dieSides}
              min={2}
              max={12}
              step={1}
              onChange={(v) => update("dieSides", v)}
            />
            <NumberField
              label="事件 A：两骰之和至少为"
              value={s.eventA}
              min={2}
              max={24}
              step={1}
              onChange={(v) => update("eventA", v)}
            />
            <NumberField
              label="事件 B：第一骰至少为"
              value={s.eventB}
              min={1}
              max={12}
              step={1}
              onChange={(v) => update("eventB", v)}
            />
          </div>
        )}
        {s.template === "bag" && (
          <div className="stats-grid">
            <NumberField
              label="初始红球数"
              value={s.red}
              min={0}
              max={30}
              step={1}
              onChange={(v) => update("red", v)}
            />
            <NumberField
              label="初始蓝球数"
              value={s.blue}
              min={0}
              max={30}
              step={1}
              onChange={(v) => update("blue", v)}
            />
            <NumberField
              label="最多抽取次数"
              value={s.draws}
              min={1}
              max={10}
              step={1}
              onChange={(v) => update("draws", v)}
            />
            <Select
              label="抽后放回规则"
              value={s.replacement}
              onChange={(v) => update("replacement", v)}
              options={[
                ["yes", "两色都放回"],
                ["no", "两色都不放回"],
                ["red-only", "仅红球放回，蓝球不放回"],
              ]}
            />
            <Select
              label="停止规则"
              value={s.stop}
              onChange={(v) => update("stop", v)}
              options={[
                ["fixed", "抽满最多次数（袋空时提前停止）"],
                ["first-red", "遇到第 1 次红球停止"],
                ["second-red", "遇到第 2 次红球停止"],
              ]}
            />
          </div>
        )}
        {s.template === "source" && (
          <div className="stats-grid">
            {probabilityInput("sourceP", "选来源 1 的概率 q")}
            {probabilityInput("sourceA", "来源 1 的成功率")}
            {probabilityInput("sourceB", "来源 2 的成功率")}
          </div>
        )}
        {s.template === "success" && (
          <div className="stats-grid">
            {probabilityInput("successP", "每次成功概率 p")}
            <NumberField
              label="第几次成功 r"
              value={s.successR}
              min={1}
              max={20}
              step={1}
              onChange={(v) => update("successR", v)}
            />
            <NumberField
              label="恰在第几次试验 k"
              value={s.successK}
              min={1}
              max={50}
              step={1}
              onChange={(v) => update("successK", v)}
            />
          </div>
        )}
        <div className="stats-toolbar">
          <button
            className="stats-button"
            onClick={() =>
              set((old) => ({
                ...old,
                template: "bag",
                red: 3,
                blue: 2,
                draws: 2,
                replacement: "no",
                stop: "fixed",
                view: "tree",
              }))
            }
          >
            例：3 红 2 蓝不放回抽两次
          </button>
          <button
            className="stats-button"
            onClick={() =>
              set((old) => ({
                ...old,
                template: "table",
                outcomes:
                  "交集 0.25 1 1\n仅A 0.25 1 0\n仅B 0.25 0 1\n外部 0.25 0 0",
                view: "venn",
              }))
            }
          >
            例：独立但不互斥
          </button>
          <button
            className="stats-button"
            onClick={() =>
              set((old) => ({
                ...old,
                template: "table",
                outcomes: "A 0.4 1 0\nB 0.3 0 1\n其余 0.3 0 0",
                view: "venn",
              }))
            }
          >
            例：互斥但不独立
          </button>
        </div>
      </Panel>
      {model.error && <Notice tone="warning">{model.error}</Notice>}
      {m && (
        <>
          <Panel title="条件事件与方向">
            <p>
              A：{m.eventA}。B：{m.eventB}。
            </p>
            <div className="stats-toolbar">
              <button
                className="data-event-button"
                aria-pressed={s.direction === "A|B"}
                onClick={() => update("direction", "A|B")}
              >
                已知 B，考察 A：P(A|B)
              </button>
              <button
                className="data-event-button"
                aria-pressed={s.direction === "B|A"}
                onClick={() => update("direction", "B|A")}
              >
                已知 A，考察 B：P(B|A)
              </button>
            </div>
            <Select
              label="结果展示"
              value={s.view}
              onChange={(v) => update("view", v)}
              options={[
                ["table", "结果格与二维概率表"],
                ["venn", "Venn 关系示意"],
                ["tree", "分支概率树"],
              ]}
            />
            {m.notes.map((note, i) => (
              <Notice key={i}>{note}</Notice>
            ))}
            {s.template !== "table" && (
              <button
                className="stats-button"
                disabled={m.outcomes.length > 500}
                onClick={() =>
                  set((old) => ({
                    ...old,
                    template: "table",
                    outcomes: m.outcomes
                      .map(
                        (o) =>
                          `${o.label.replace(/[\s,，;；]+/g, "_")} ${o.p} ${Number(o.A)} ${Number(o.B)}`,
                      )
                      .join("\n"),
                  }))
                }
              >
                将当前结果转成可编辑事件表（至多 500 行）
              </button>
            )}
          </Panel>
          <HiddenResults hidden={resultsHidden}>
            <Panel title="概率摘要与归一化">
              <div className="stats-results">
                <Result label="P(A)" value={fmt(m.summary.a)} />
                <Result label="P(B)" value={fmt(m.summary.b)} />
                <Result label="P(A∩B)" value={fmt(m.summary.intersection)} />
                <Result
                  label={`P(${s.direction})`}
                  value={fmt(m.summary.conditional)}
                  note={`分母为 P(${s.direction === "A|B" ? "B" : "A"}) = ${fmt(m.summary.denominator)}`}
                />
                <Result label="P(A∪B)" value={fmt(m.summary.union)} />
                <Result label="P(Aᶜ)" value={fmt(1 - m.summary.a)} />
              </div>
              {m.summary.denominator === 0 ? (
                <Notice tone="warning">
                  条件事件概率为 0，条件概率未定义；不能把 0/0 写成 0。
                </Notice>
              ) : (
                <Notice>
                  灰化条件事件以外的结果。条件内各行概率除以{" "}
                  {fmt(m.summary.denominator)} 后总和为
                  1；交集质量除以这个分母，得到条件概率。
                </Notice>
              )}
              <div className="stats-results">
                <Result
                  label="A 与 B 是否独立"
                  value={m.summary.independent ? "是" : "否"}
                  note={`检查 P(A∩B) = P(A)P(B)：${fmt(m.summary.intersection)} 与 ${fmt(m.summary.a * m.summary.b)}`}
                />
                <Result
                  label="A 与 B 是否互斥"
                  value={m.summary.exclusive ? "是" : "否"}
                  note="检查交集概率是否为 0；若表中列有零概率结果，以概率意义判断。"
                />
              </div>
              <Notice>
                独立描述概率关系，互斥描述不能共同发生（此处按概率质量判断）；概率依赖不自动解释为因果。
              </Notice>
            </Panel>
            <Panel
              title={
                s.view === "tree"
                  ? "概率树"
                  : s.view === "venn"
                    ? "Venn 关系"
                    : "二维事件表与结果权重"
              }
            >
              {s.view === "tree" ? (
                <ProbabilityTree outcomes={m.outcomes} />
              ) : s.view === "venn" ? (
                <Venn summary={m.summary} />
              ) : (
                <>
                  <table className="stats-table">
                    <thead>
                      <tr>
                        <th></th>
                        <th>B</th>
                        <th>Bᶜ</th>
                        <th>合计</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th>A</th>
                        <td>{fmt(m.summary.cells[0])}</td>
                        <td>{fmt(m.summary.cells[1])}</td>
                        <td>{fmt(m.summary.a)}</td>
                      </tr>
                      <tr>
                        <th>Aᶜ</th>
                        <td>{fmt(m.summary.cells[2])}</td>
                        <td>{fmt(m.summary.cells[3])}</td>
                        <td>{fmt(1 - m.summary.a)}</td>
                      </tr>
                      <tr>
                        <th>合计</th>
                        <td>{fmt(m.summary.b)}</td>
                        <td>{fmt(1 - m.summary.b)}</td>
                        <td>1</td>
                      </tr>
                    </tbody>
                  </table>
                  {s.template === "dice" && (
                    <div className="data-scroll">
                      <table className="stats-table">
                        <caption>
                          两骰有序结果格：行是第一骰，列是第二骰；AB 表示交集
                        </caption>
                        <thead>
                          <tr>
                            <th>第一 / 第二</th>
                            {Array.from({ length: s.dieSides }, (_, i) => (
                              <th key={i}>{i + 1}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: s.dieSides }, (_, i) => (
                            <tr key={i}>
                              <th>{i + 1}</th>
                              {m.outcomes
                                .slice(i * s.dieSides, (i + 1) * s.dieSides)
                                .map((o, j) => (
                                  <td
                                    key={j}
                                    className={
                                      (s.direction === "A|B" ? o.B : o.A)
                                        ? "data-table-row-selected"
                                        : "data-muted"
                                    }
                                  >
                                    {o.A ? "A" : ""}
                                    {o.B ? "B" : ""}
                                    {!o.A && !o.B ? "·" : ""}
                                  </td>
                                ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="data-scroll">
                    <table className="stats-table">
                      <thead>
                        <tr>
                          <th>互斥终点</th>
                          <th>原概率</th>
                          <th>A</th>
                          <th>B</th>
                          <th>条件下归一化权重</th>
                        </tr>
                      </thead>
                      <tbody>
                        {m.outcomes.map((o, i) => {
                          const within = s.direction === "A|B" ? o.B : o.A;
                          return (
                            <tr
                              key={i}
                              className={
                                within
                                  ? "data-table-row-selected"
                                  : "data-muted"
                              }
                            >
                              <td>{o.label}</td>
                              <td>{fmt(o.p)}</td>
                              <td>
                                {s.template === "table" ? (
                                  <input
                                    aria-label={`${o.label} 属于事件 A`}
                                    type="checkbox"
                                    checked={o.A}
                                    onChange={(e) =>
                                      setOutcomeEvent(i, "A", e.target.checked)
                                    }
                                  />
                                ) : o.A ? (
                                  "✓"
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td>
                                {s.template === "table" ? (
                                  <input
                                    aria-label={`${o.label} 属于事件 B`}
                                    type="checkbox"
                                    checked={o.B}
                                    onChange={(e) =>
                                      setOutcomeEvent(i, "B", e.target.checked)
                                    }
                                  />
                                ) : o.B ? (
                                  "✓"
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td>
                                {m.summary.denominator === 0
                                  ? "未定义"
                                  : fmt(
                                      within ? o.p / m.summary.denominator : 0,
                                    )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Panel>
          </HiddenResults>
        </>
      )}
      {s.template === "source" && (
        <Panel title="由总概率反求来源比例">
          {probabilityInput("totalTarget", "目标总体成功概率 t")}
          <p>t = q·p₁ + (1−q)·p₂。已知来源成功率时，可反求来源 1 比例 q。</p>
          <HiddenResults hidden={resultsHidden}>
            {inverse?.error ? (
              <Notice tone="warning">{inverse.error}</Notice>
            ) : inverse?.value === null ? (
              <Notice>
                两个来源成功率相同且等于目标，q 可以是 [0,1]
                中任意值，无法唯一确定。
              </Notice>
            ) : (
              <>
                <Result label="反求的来源 1 比例" value={fmt(inverse?.value)} />
                <button
                  className="stats-button"
                  onClick={() => {
                    if (inverse?.value != null)
                      update("sourceP", inverse.value);
                  }}
                >
                  应用反求比例
                </button>
              </>
            )}
          </HiddenResults>
        </Panel>
      )}
      <Panel title="支持范围">
        <p className="data-tiny">
          已提供有限权重事件表、公平独立双骰、两来源模型、两色袋中抽球、红球独自放回、遇第
          1/2 次红球停止，以及第 r 次成功恰在第 k 次的独立试验公式。抽球最多 10
          次；任意多色规则、用户自定义状态转移和任意停止谓词尚未实现，可先将有限终点及其真实概率录入事件表。
        </p>
      </Panel>
    </div>
  );
}
