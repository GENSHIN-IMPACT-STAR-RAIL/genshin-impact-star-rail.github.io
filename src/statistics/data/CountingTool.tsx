import { useEffect, useState } from "react";
import { Field, NumberField, Notice, Panel, Result } from "../shared";
import { useStatisticsWorkspace, useToolState } from "../workspace";
import type {
  CountingState,
  CountingTemplate,
  ProbabilityState,
} from "./state";
import { countModel, permutationAllowed } from "./model";
import { attempt, HiddenResults, Select } from "./ui";

const templates: readonly (readonly [CountingTemplate, string])[] = [
  ["permutation", "有序选取：n 个不同对象取 r 个"],
  ["repeated", "重复对象排列 / 标号实体"],
  ["multiset", "多重集无序选取：每类有容量上限"],
  ["adjacent", "指定 k 个对象全部相邻"],
  ["nonadjacent", "指定 k 个对象逐对不相邻"],
  ["notall", "指定 k 个对象不全相邻"],
  ["endpoint", "指定对象 A 位于任一端点"],
  ["distance", "指定对象 A、B 的固定位置距离"],
  ["selection", "组合：必选、排除和类别配额"],
  ["groups", "按给定人数分成具名 / 无名组"],
];
function Arrangement({
  state,
  hidden,
}: {
  state: CountingState;
  hidden: boolean;
}) {
  const size = state.template === "permutation" ? state.r : state.n,
    [slots, setSlots] = useState<(number | null)[]>(
      Array.from({ length: size }, () => null),
    ),
    [dragged, setDragged] = useState<number | null>(null);
  const place = (value: number, index: number) =>
    setSlots((old) =>
      old.map((v, i) => (i === index ? value : v === value ? null : v)),
    );
  const complete = slots.every((x) => x !== null),
    legal = complete && permutationAllowed(slots as number[], state);
  return (
    <Panel title="将对象令牌放入位置槽">
      <p className="data-viz-caption">
        拖动或点击对象放入第一个空位；点击位置槽可移除。橙色是被约束的指定对象。
      </p>
      <div className="data-slots">
        {Array.from({ length: state.n }, (_, i) => (
          <button
            className={`data-token ${i < state.k ? "is-special" : ""}`}
            key={i}
            draggable
            onDragStart={() => setDragged(i)}
            onClick={() => {
              const index = slots.findIndex((x) => x === null);
              if (index >= 0) place(i, index);
            }}
            disabled={slots.includes(i)}
          >
            {String.fromCharCode(65 + i)}
          </button>
        ))}
      </div>
      <div className="data-slots">
        {slots.map((value, i) => (
          <button
            className="data-slot"
            key={i}
            aria-label={`位置 ${i + 1}，${value === null ? "空" : String.fromCharCode(65 + value)}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragged !== null) place(dragged, i);
              setDragged(null);
            }}
            onClick={() =>
              setSlots((old) => old.map((v, j) => (i === j ? null : v)))
            }
          >
            {value === null ? (
              <span className="data-tiny">{i + 1}</span>
            ) : (
              String.fromCharCode(65 + value)
            )}
          </button>
        ))}
      </div>
      <HiddenResults hidden={hidden}>
        {complete ? (
          <Notice tone={legal ? "info" : "warning"}>
            {legal
              ? "这个排列满足当前模板。"
              : "这个排列不满足当前模板；检查指定对象的位置。"}
          </Notice>
        ) : (
          <p className="data-tiny">放满全部 {size} 个槽后检查约束。</p>
        )}
      </HiddenResults>
      <button
        className="stats-button"
        onClick={() => setSlots(Array.from({ length: size }, () => null))}
      >
        清空位置槽
      </button>
    </Panel>
  );
}
export function CountingTool() {
  const [s, set] = useToolState<CountingState>("counting"),
    { resultsHidden, setTool, navigate } = useStatisticsWorkspace();
  const [equalWeights, setEqualWeights] = useState(false);
  useEffect(() => setEqualWeights(false), [s]);
  const update = <K extends keyof CountingState>(
    key: K,
    value: CountingState[K],
  ) => set((old) => ({ ...old, [key]: value }));
  const model = attempt(() => countModel(s)),
    r = model.value;
  const number = (
    key:
      | "n"
      | "r"
      | "k"
      | "distance"
      | "required"
      | "excluded"
      | "quotaSize"
      | "quotaMin"
      | "quotaMax",
    label: string,
    min = 0,
  ) => (
    <NumberField
      label={label}
      value={s[key]}
      min={min}
      max={100}
      step={1}
      onChange={(v) => update(key, v)}
    />
  );
  return (
    <div className="stats-stack">
      <Panel title="选择计数模板">
        <Select
          label="对象与约束"
          value={s.template}
          options={templates}
          onChange={(v) => update("template", v)}
        />
        <div className="stats-grid">
          {!["repeated", "multiset", "groups"].includes(s.template) &&
            number("n", "可区分对象总数 n")}
          {(s.template === "permutation" ||
            s.template === "selection" ||
            s.template === "multiset") &&
            number(
              "r",
              s.template === "permutation" ? "有序选取数 r" : "无序选取总数 r",
            )}
          {["adjacent", "nonadjacent", "notall"].includes(s.template) &&
            number("k", "指定对象数 k（A、B、C…）", 1)}
          {s.template === "distance" &&
            number("distance", "A、B 的位置编号差 d（相邻为 1）", 1)}
          {(s.template === "repeated" || s.template === "multiset") && (
            <>
              <Field
                label="各重复类别数量"
                hint="例如 2,2,1 对应 A A B B C；总数不超过 100。"
              >
                <input
                  className="stats-input"
                  value={s.repeated}
                  maxLength={500}
                  onChange={(e) => update("repeated", e.target.value)}
                />
              </Field>
              <label className="data-check">
                <input
                  type="checkbox"
                  checked={s.distinguish}
                  onChange={(e) => update("distinguish", e.target.checked)}
                />
                区分同字母实体（A₁、A₂…）
              </label>
            </>
          )}
          {s.template === "selection" && (
            <>
              {number("required", "必选对象数（预先固定）")}
              {number("excluded", "排除对象数（与必选不重叠）")}
              {number("quotaSize", "其余候选中属于配额类别的人数")}
              {number("quotaMin", "配额类别至少选多少人")}
              {number("quotaMax", "配额类别至多选多少人")}
              {(
                [
                  ["requiredMembers", "指定必选成员"],
                  ["excludedMembers", "指定排除成员"],
                  ["quotaMembers", "指定剩余候选中的配额成员"],
                ] as const
              ).map(([key, label]) => (
                <Field
                  key={key}
                  label={label}
                  hint="可填 A,C,F；留空使用对应人数。n>26 时用 X27、X28 等。"
                >
                  <input
                    className="stats-input"
                    value={s[key]}
                    maxLength={500}
                    onChange={(e) => update(key, e.target.value)}
                  />
                </Field>
              ))}
            </>
          )}
          {s.template === "groups" && (
            <>
              <Field
                label="各组人数"
                hint="例如 2,2：4 人分两组，每组 2 人；各组内部均无序。"
              >
                <input
                  className="stats-input"
                  value={s.groups}
                  maxLength={500}
                  onChange={(e) => update("groups", e.target.value)}
                />
              </Field>
              <label className="data-check">
                <input
                  type="checkbox"
                  checked={s.named}
                  onChange={(e) => update("named", e.target.checked)}
                />
                各组具名（组 1、组 2…）
              </label>
            </>
          )}
        </div>
        <Notice>
          这些模板各自有明确约束；不能将多个模板的答案直接相乘。这里只处理展示的约束，未提供任意自然语言组合约束求解。
        </Notice>
        <div className="stats-toolbar">
          <button
            className="stats-button"
            onClick={() =>
              set((old) => ({
                ...old,
                template: "selection",
                n: 6,
                r: 3,
                required: 0,
                excluded: 0,
                quotaSize: 0,
                quotaMin: 0,
                quotaMax: 0,
                requiredMembers: "",
                excludedMembers: "",
                quotaMembers: "",
              }))
            }
          >
            课堂例：普通组合 C(6,3)
          </button>
          <button
            className="stats-button"
            onClick={() =>
              set((old) => ({
                ...old,
                template: "groups",
                groups: "2, 2",
                named: false,
              }))
            }
          >
            课堂例：4 人分两个 2 人组
          </button>
          <button
            className="stats-button"
            onClick={() =>
              set((old) => ({ ...old, template: "nonadjacent", n: 6, k: 2 }))
            }
          >
            课堂例：插空法
          </button>
          <button
            className="stats-button"
            onClick={() =>
              set((old) => ({
                ...old,
                template: "repeated",
                repeated: "2, 2, 1",
                distinguish: false,
              }))
            }
          >
            课堂例：同字母除重
          </button>
        </div>
      </Panel>
      {model.error && <Notice tone="warning">{model.error}</Notice>}
      {r && (
        <>
          <HiddenResults hidden={resultsHidden}>
            <Panel title="精确计数与解释">
              <div className="stats-results">
                <Result
                  label="合法结果总数（精确整数）"
                  value={r.count.toString()}
                />
                <Result label="本模板对象总数" value={r.population} />
              </div>
              <p className="stats-formula">{r.formula}</p>
              <ol className="data-steps">
                {r.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
              {s.template === "nonadjacent" && s.n <= 14 && (
                <div className="data-preview" aria-label="插空结构">
                  {Array.from({ length: s.n - s.k + 1 }, (_, i) => (
                    <span key={i}>
                      <code>空隙 {i + 1}</code>
                      {i < s.n - s.k && (
                        <code>{String.fromCharCode(65 + s.k + i)}</code>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {s.template === "groups" && !s.named && (
                <Notice>
                  例如 4 人分成两个 2 人组：AB | CD 与 CD | AB
                  是同一无名划分；如果组叫“红队”和“蓝队”，两种分配就不同。
                </Notice>
              )}
            </Panel>
            <Panel title="小规模合法结果">
              <p className="data-viz-caption">
                {r.previewTotal === null
                  ? "超过小规模枚举预算，使用上方精确公式；没有展示全部结果。"
                  : r.previewTotal > 60
                    ? `已核数 ${r.previewTotal} 个合法结果，展示前 60 个。`
                    : `共 ${r.previewTotal} 个，以下完整展示。`}
              </p>
              <div className="data-preview">
                {r.preview.map((v, i) => (
                  <code key={i}>{v || "∅（空排列）"}</code>
                ))}
              </div>
              {r.previewTotal === 0 && (
                <Notice>
                  没有合法结果；检查是否因空隙、配额或距离限制而不可能。
                </Notice>
              )}
              {r.previewTotal !== null &&
                r.previewTotal > 0 &&
                r.previewTotal <= 60 && (
                  <>
                    <label className="data-check">
                      <input
                        type="checkbox"
                        checked={equalWeights}
                        onChange={(e) => setEqualWeights(e.target.checked)}
                      />
                      我定义的基本试验使上述每个合法结果等可能
                    </label>
                    <button
                      className="stats-button"
                      disabled={!equalWeights}
                      onClick={() => {
                        if (!equalWeights || !r.previewTotal) return;
                        setTool<ProbabilityState>("probability", (old) => ({
                          ...old,
                          template: "table",
                          view: "table",
                          outcomes: r.preview
                            .map(
                              (label, i) =>
                                `${label.replace(/[\s,，;；]+/g, "_") || "空选择"} ${1 / r.previewTotal!} ${i === 0 ? 1 : 0} 1`,
                            )
                            .join("\n"),
                        }));
                        navigate("probability");
                      }}
                    >
                      将合法结果及等概率假设送往事件表
                    </button>
                    <p className="data-tiny">
                      计数本身不能证明等可能。合并重复对象后的类别通常权重不同；若基本试验按标号实体抽取，请在事件表录入实际权重。
                    </p>
                  </>
                )}
            </Panel>
          </HiddenResults>
          {!["groups", "repeated", "multiset", "selection"].includes(
            s.template,
          ) &&
            s.n >= 1 &&
            s.n <= 8 &&
            s.r <= s.n && (
              <Arrangement
                key={`${s.template}-${s.n}-${s.r}-${s.k}-${s.distance}`}
                state={s}
                hidden={resultsHidden}
              />
            )}
        </>
      )}
      <Panel title="支持范围">
        <p>
          已支持有序选取、重复对象排列、多重集无序选取、全部相邻、逐对不相邻、不全相邻、单个指定对象端点、两个指定对象固定距离、指定成员必选/排除与一个类别的上下配额，以及任意给定组大小的具名/无名分组。对象总数上限
          100，使用 BigInt 精确整数。
        </p>
        <p className="data-tiny">
          端点与距离模板均假定对象彼此可区分。多个重叠配额、圆排列、隔板法及约束的任意组合尚未实现。排列与分组只对总数
          ≤ 8 枚举；组合只对 n ≤ 12 枚举。无标号多重集在总容量 ≤ 20 且类别数 ≤
          10 时枚举数量向量，其他规模显示精确动态规划结果。
        </p>
      </Panel>
    </div>
  );
}
