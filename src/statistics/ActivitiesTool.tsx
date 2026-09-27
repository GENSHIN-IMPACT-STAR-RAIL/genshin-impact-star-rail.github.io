import { Field, Notice, Panel } from "./shared";
import { useStatisticsWorkspace, useToolState } from "./workspace";
import type { ToolSpec } from "./workspace-types";
export const ACTIVITIES = [
  {
    id: "histogram",
    title: "宽柱为何不一定更高",
    tool: "data",
    prediction: "两组频数相同，组距不同，哪一根柱应更高？",
    steps: "选择分组数据，比较组宽、柱高与面积；将一组组距改为原来的两倍。",
    explain: "频数保持不变时，频数密度怎样改变？为什么柱面积才对应频数？",
  },
  {
    id: "outlier",
    title: "一个异常值改变什么",
    tool: "data",
    prediction: "把最大观测值增加很多，均值、中位数和 IQR 谁变化更大？",
    steps: "输入一组原始数据，拖动最大的点，再比较集中和离散指标。",
    explain: "为什么均值和标准差对极端值较敏感？",
  },
  {
    id: "groups",
    title: "4 人分两组为何除 2!",
    tool: "counting",
    prediction: "4 人分两个各 2 人的组，是 6 种还是 3 种？",
    steps: "选择分组模板，对比具名组与无名组。交换两个组，判断是否得到新结果。",
    explain: "被除掉的是哪些重复？组名改变了什么？",
  },
  {
    id: "conditional",
    title: "知道 B 发生后发生了什么",
    tool: "probability",
    prediction: "已知 B 发生，P(A|B) 的分母应保留哪些结果？",
    steps: "选择事件表，改变条件方向。查看条件内的交集和归一化结果。",
    explain: "为什么 P(A|B) 与 P(B|A) 一般不相等？",
  },
  {
    id: "geometric",
    title: "直到第一次成功为止",
    tool: "discrete",
    prediction: "“超过 4 次才首次成功”要求前几次都失败？",
    steps: "选择几何分布，比较 X>4 和 X≥4 的尾概率，改变 p。",
    explain: "总尝试次数和失败次数的支持起点有何区别？",
  },
  {
    id: "normal-inverse",
    title: "两个分位条件确定一条曲线",
    tool: "normal",
    prediction: "一个概率条件能同时确定 μ 和 σ 吗？",
    steps: "进入双分位反求，分别调整两组阈值和累计概率。",
    explain: "为什么需要两个独立条件？不相容条件会产生什么结果？",
  },
  {
    id: "same-v-independent",
    title: "2X 与 X₁+X₂",
    tool: "combinations",
    prediction: "两者均值相同，分布和方差会相同吗？",
    steps: "使用公平骰子的分布，比较同一变量倍数与两个独立副本之和。",
    explain: "共用同一次观测与分别抽样，如何改变支持和方差？",
  },
  {
    id: "cdf",
    title: "面积怎样变成累计概率",
    tool: "continuous",
    prediction: "PDF 在分段点跳跃，CDF 也一定跳吗？",
    steps: "选择分段密度，改变概率阈值，在 PDF 与 CDF 间对应面积和高度。",
    explain: "第二段 CDF 为什么不能忘掉第一段累计的概率？",
  },
  {
    id: "sample-size",
    title: "一次抽 100 个与重复 100 次",
    tool: "sampling",
    prediction: "哪个参数增大会使样本均值的理论标准误缩小？",
    steps: "分别只改变 n 和 R，用同一种子比较；再把总体改为偏态。",
    explain: "经验图变平滑与抽样分布变窄是同一件事吗？",
  },
  {
    id: "coverage",
    title: "95% 到底在说什么",
    tool: "intervals",
    prediction: "重复抽样时，是总体参数在变，还是区间在变？",
    steps: "构造同一方法的多次置信区间，改变置信水平和样本量。",
    explain: "置信度描述的是哪一个程序的长期覆盖率？",
  },
  {
    id: "critical",
    title: "5% 检验为什么不到 5%",
    tool: "tests",
    prediction: "二项分布能拒绝半根概率柱吗？",
    steps: "建立 B(10,0.5) 的单侧 5% 检验，比较相邻整数临界值。",
    explain: "标称显著性与实际第一类错误概率为何可能不同？",
  },
  {
    id: "chi-pooling",
    title: "合并类别以后，自由度呢",
    tool: "chi-square",
    prediction: "合并 O 与 E 后，可以直接相加原来的 χ² 贡献吗？",
    steps: "使用拟合优度例子合并小期望频数组，观察最终贡献和自由度。",
    explain: "组数与估参个数分别怎样影响自由度？",
  },
] as const;
type State = {
  selected: string;
  active: boolean;
  records: Record<
    string,
    { prediction: string; observation: string; explanation: string }
  >;
};
const initial: State = {
  selected: ACTIVITIES[0].id,
  active: false,
  records: {},
};
function valid(v: unknown): boolean {
  const s = v as State;
  return (
    !!s &&
    typeof s === "object" &&
    typeof s.active === "boolean" &&
    ACTIVITIES.some((a) => a.id === s.selected) &&
    !!s.records &&
    typeof s.records === "object" &&
    !Array.isArray(s.records) &&
    Object.keys(s.records).length <= 12 &&
    Object.entries(s.records).every(
      ([key, value]) =>
        ACTIVITIES.some((a) => a.id === key) &&
        !!value &&
        ["prediction", "observation", "explanation"].every(
          (field) =>
            typeof value[field as keyof typeof value] === "string" &&
            value[field as keyof typeof value].length <= 5000,
        ),
    )
  );
}
function ActivitiesTool() {
  const [state, setState] = useToolState<State>("activities");
  const workspace = useStatisticsWorkspace();
  const activity = ACTIVITIES.find((a) => a.id === state.selected)!;
  const record = state.records[state.selected] ?? {
    prediction: "",
    observation: "",
    explanation: "",
  };
  const update = (patch: Partial<typeof record>) =>
    setState({
      ...state,
      records: { ...state.records, [state.selected]: { ...record, ...patch } },
    });
  return (
    <div className="stats-stack">
      <Panel title="选择一个问题">
        <div className="stats-activity-cards">
          {ACTIVITIES.map((a, i) => (
            <button
              key={a.id}
              aria-pressed={a.id === state.selected}
              onClick={() =>
                setState({ ...state, selected: a.id, active: false })
              }
            >
              <small>{String(i + 1).padStart(2, "0")}</small>
              <span>{a.title}</span>
            </button>
          ))}
        </div>
      </Panel>
      <Panel title={activity.title}>
        <Notice>{activity.prediction}</Notice>
        <Field label="我的预测">
          <textarea
            className="stats-textarea"
            maxLength={5000}
            value={record.prediction}
            onChange={(e) => update({ prediction: e.target.value })}
            placeholder="先写下预测与理由，再操作工具。"
          />
        </Field>
        <p>{activity.steps}</p>
        <div className="stats-toolbar">
          <button
            className="stats-button primary"
            onClick={() => {
              setState({ ...state, active: true });
              workspace.setResultsHidden(true);
              workspace.navigate(activity.tool);
            }}
          >
            开始实验（隐藏结果）
          </button>
          <button
            className="stats-button"
            onClick={() => {
              setState({ ...state, active: true });
              workspace.setResultsHidden(false);
              workspace.navigate(activity.tool);
            }}
          >
            自由观察
          </button>
        </div>
      </Panel>
      <Panel title="观察与解释">
        <div className="stats-stack">
          <Field label="实际观察到的变化">
            <textarea
              className="stats-textarea"
              maxLength={5000}
              value={record.observation}
              onChange={(e) => update({ observation: e.target.value })}
            />
          </Field>
          <Field label={activity.explain}>
            <textarea
              className="stats-textarea"
              maxLength={5000}
              value={record.explanation}
              onChange={(e) => update({ explanation: e.target.value })}
            />
          </Field>
          <button
            className="stats-button"
            onClick={() => {
              setState({ ...state, active: false });
              workspace.setResultsHidden(false);
            }}
          >
            结束本次探究
          </button>
        </div>
      </Panel>
      <Notice>
        预测、观察和解释随作品一起保存。工具内的数据由你按活动步骤设置；自由观察不会自动改变已有模型。
      </Notice>
    </div>
  );
}
export function ActivityRibbon() {
  const { document, navigate } = useStatisticsWorkspace();
  const state = document.states.activities as State | undefined;
  const activity = ACTIVITIES.find((a) => a.id === state?.selected);
  return state?.active && document.activeTool !== "activities" ? (
    <div className="stats-activity-ribbon">
      <span>课堂探究 · {activity?.title}</span>
      <button onClick={() => navigate("activities")}>返回记录</button>
    </div>
  ) : null;
}
export const activityTools: ToolSpec[] = [
  {
    id: "activities",
    title: "课堂探究与记录",
    description: "先预测、再观察，用自己的语言解释数学变化。",
    courses: ["S1", "S2", "FS"],
    group: "课堂探究",
    component: ActivitiesTool,
    initialState: initial,
    validate: valid,
  },
];
