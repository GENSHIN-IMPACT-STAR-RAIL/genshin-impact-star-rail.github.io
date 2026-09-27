import { NumberField } from "./ui";
import { Panel, Result, Notice, Plot, Formula } from "../shared";
import { useToolState } from "../workspace";
import { format } from "../math";
import {
  parseMasses,
  displayMasses,
  countMoments,
  countProbability,
  moments,
  affine,
  convolve,
  iidSquareRoot,
  type CountModel,
} from "./model";
import {
  exactMasses,
  exactAffine,
  exactConvolve,
  polynomialText,
  rationalText,
} from "./exact";
import type { PgfState } from "./state";
import { Select, TextInput, Output, MomentResults, Button, Reveal } from "./ui";
export function PgfTool() {
  const [s, set] = useToolState<PgfState>("pgf");
  const patch = (p: Partial<PgfState>) => set({ ...s, ...p });
  return (
    <div className="stats-grid">
      <Panel title="PGF、系数与卷积">
        <div className="stats-stack">
          <Notice>
            FS 核心。普通 PGF 对应非负整数支持；有限负整数支持可用 Laurent
            形式，但 t=0 可能无定义，不能用普通 Taylor 系数法。
          </Notice>
          <Select
            label="分布模板"
            value={s.kind}
            onChange={(kind) =>
              patch({
                kind,
                ...(kind === "geometric" && s.p === 0 ? { p: 0.2 } : {}),
              })
            }
            options={[
              ["finite", "有限整数概率表（精确有理系数）"],
              ["uniform", "离散均匀 0,…,m−1"],
              ["binomial", "二项"],
              ["geometric", "几何，支持 1,2,…"],
              ["poisson", "泊松"],
            ]}
          />
          {s.kind === "finite" ? (
            <TextInput
              label="整数取值, 概率"
              value={s.table}
              onChange={(table) => patch({ table })}
            />
          ) : s.kind === "uniform" ? (
            <NumberField
              label="支持点数 m"
              value={s.uniformN}
              onChange={(uniformN) => patch({ uniformN })}
              min={1}
              max={30}
              step={1}
            />
          ) : s.kind === "poisson" ? (
            <NumberField
              label="λ"
              value={s.lambda}
              onChange={(lambda) => patch({ lambda })}
              min={0}
              max={100}
            />
          ) : (
            <>
              {s.kind === "binomial" && (
                <NumberField
                  label="n"
                  value={s.n}
                  onChange={(n) => patch({ n })}
                  min={0}
                  max={100}
                  step={1}
                />
              )}
              <NumberField
                label="p"
                value={s.p}
                onChange={(p) => patch({ p })}
                min={s.kind === "geometric" ? 0.00001 : 0}
                max={1}
              />
            </>
          )}
          <Select
            label="生成的变量"
            value={s.operation}
            onChange={(operation) => patch({ operation })}
            options={[
              ["original", "原变量 X"],
              ["independent", "独立副本和 X₁+X₂：G(t)²"],
              ["double", "同一个 X：2X，G(t²)"],
              ["affine", "整数仿射 aX+b：tᵇG(tᵃ)"],
            ]}
          />
          {s.operation === "affine" && (
            <>
              <NumberField
                label="整数 a"
                value={s.a}
                onChange={(a) => patch({ a })}
                min={-20}
                max={20}
                step={1}
              />
              <NumberField
                label="整数 b"
                value={s.b}
                onChange={(b) => patch({ b })}
                min={-100}
                max={100}
                step={1}
              />
            </>
          )}
          <NumberField
            label="高亮的系数指数 k"
            min={-1e9}
            max={1e9}
            value={s.selected}
            onChange={(selected) => patch({ selected })}
            step={1}
          />
          <NumberField
            label="代入 t（检查收敛域）"
            value={s.t}
            onChange={(t) => patch({ t })}
            min={-2}
            max={2}
          />
          <Select
            label="任务模板"
            value={s.task}
            onChange={(task) => patch({ task })}
            options={[
              ["forward", "顺求：PGF 与导数矩"],
              ["root", "反求：独立同分布和的有限 PGF 开平方"],
            ]}
          />
          {s.task === "root" && (
            <TextInput
              label="和 S 的有限概率表（0–100 整数支持）"
              value={s.sumTable}
              onChange={(sumTable) => patch({ sumTable })}
            />
          )}
          <Button
            onClick={() =>
              patch({
                kind: "finite",
                table: "0, 1/2\n1, 1/2",
                operation: "independent",
                selected: 1,
              })
            }
          >
            比较 G(t)² 与 G(t²)
          </Button>
          <Button
            onClick={() =>
              patch({
                kind: "finite",
                table: "-1, 1/4\n0, 1/2\n1, 1/4",
                operation: "original",
                t: 0.5,
              })
            }
          >
            有限 Laurent 示例
          </Button>
        </div>
      </Panel>
      <div className="stats-stack stats-tool-results">
        <Output>
          {() => {
            let model: CountModel,
              formula: string,
              finiteExact = null;
            if (s.kind === "finite") {
              model = { kind: "finite", masses: parseMasses(s.table, true) };
              finiteExact = exactMasses(s.table);
              formula = polynomialText(finiteExact);
            } else if (s.kind === "uniform") {
              const text = Array.from(
                { length: s.uniformN },
                (_, i) => `${i}, 1/${s.uniformN}`,
              ).join("\n");
              model = { kind: "finite", masses: parseMasses(text, true) };
              finiteExact = exactMasses(text);
              formula = polynomialText(finiteExact);
            } else if (s.kind === "binomial") {
              model = { kind: "binomial", n: s.n, p: s.p };
              formula = `(${format(1 - s.p)} + ${format(s.p)}t)^${s.n}`;
            } else if (s.kind === "geometric") {
              if (s.p <= 0) throw new Error("几何参数要求 p>0。");
              model = { kind: "geometric", p: s.p };
              formula = `${format(s.p)}t / (1 − ${format(1 - s.p)}t)`;
            } else {
              model = { kind: "poisson", lambda: s.lambda };
              formula = `exp(${format(s.lambda)}(t−1))`;
            }
            const sourceStats = countMoments(model),
              source = displayMasses(model),
              a =
                s.operation === "double"
                  ? 2
                  : s.operation === "affine"
                    ? s.a
                    : 1,
              b = s.operation === "affine" ? s.b : 0,
              infinite = model.kind === "geometric" || model.kind === "poisson";
            if (infinite && s.operation === "affine" && (a < 0 || b < 0))
              throw new Error(
                "无限支持的负指数变换未列入此模板；有限负整数支持可用 Laurent 形式。",
              );
            let shown = source.masses,
              tail = source.tail,
              mean = sourceStats.mean,
              variance = sourceStats.variance;
            if (s.operation === "independent") {
              mean *= 2;
              variance *= 2;
              if (model.kind === "poisson") {
                const view = displayMasses({
                  kind: "poisson",
                  lambda: 2 * model.lambda,
                });
                shown = view.masses;
                tail = view.tail;
              } else if (model.kind === "binomial") {
                const view = displayMasses({
                  kind: "binomial",
                  n: 2 * model.n,
                  p: model.p,
                });
                shown = view.masses;
                tail = 0;
              } else {
                shown = convolve(shown, shown);
                if (infinite)
                  shown = shown.filter((p) => p.x <= source.masses.at(-1)!.x);
                tail = infinite
                  ? Math.max(0, 1 - shown.reduce((total, p) => total + p.y, 0))
                  : 0;
              }
              if (finiteExact) finiteExact = exactConvolve(finiteExact);
            } else if (s.operation !== "original") {
              shown = affine(shown, a, b);
              mean = a * mean + b;
              variance = a * a * variance;
              if (finiteExact) finiteExact = exactAffine(finiteExact, a, b);
              if (a === 0) {
                shown = [{ x: b, y: 1 }];
                tail = 0;
              }
            }
            const derived = finiteExact
              ? polynomialText(finiteExact)
              : s.operation === "independent"
                ? `[${formula}]²`
                : s.operation === "original"
                  ? formula
                  : `t^(${b}) · G_X(t^(${a}))`;
            const baseValue = (t: number): number => {
              if (model.kind === "finite") {
                if (t === 0 && model.masses.some((p) => p.x < 0))
                  throw new Error("有限 Laurent 表达式在 t=0 无定义。");
                return model.masses.reduce(
                  (total, p) => total + p.y * t ** p.x,
                  0,
                );
              }
              if (model.kind === "binomial")
                return (1 - model.p + model.p * t) ** model.n;
              if (model.kind === "poisson")
                return Math.exp(model.lambda * (t - 1));
              if (Math.abs((1 - model.p) * t) >= 1)
                throw new Error(
                  "几何 PGF 级数要求 |(1−p)t|<1；不在收敛域时不以有理式值冒充级数和。",
                );
              return (model.p * t) / (1 - (1 - model.p) * t);
            };
            let value: number;
            if (!infinite) {
              if (s.t === 0 && shown.some((p) => p.x < 0 && p.y > 0))
                throw new Error("当前 Laurent 形式在 t=0 无定义。");
              value = shown.reduce((total, p) => total + p.y * s.t ** p.x, 0);
            } else if (s.operation === "independent")
              value = baseValue(s.t) ** 2;
            else if (s.operation === "original") value = baseValue(s.t);
            else {
              if (s.t === 0 && (b < 0 || a < 0))
                throw new Error(
                  "当前 Laurent 变换在 t=0 可能无定义，请使用非零 t。",
                );
              value = s.t ** b * baseValue(s.t ** a);
            }
            const coefficient = (k: number): number => {
              if (s.operation === "independent") {
                if (model.kind === "geometric")
                  return k < 2
                    ? 0
                    : model.p === 1
                      ? k === 2
                        ? 1
                        : 0
                      : (k - 1) * model.p ** 2 * (1 - model.p) ** (k - 2);
                if (model.kind === "poisson")
                  return countProbability(
                    { kind: "poisson", lambda: 2 * model.lambda },
                    k,
                    k,
                  );
                if (model.kind === "binomial")
                  return countProbability(
                    { kind: "binomial", n: 2 * model.n, p: model.p },
                    k,
                    k,
                  );
                return shown.find((p) => p.x === k)?.y ?? 0;
              }
              if (s.operation === "original")
                return countProbability(model, k, k);
              if (a === 0) return k === b ? 1 : 0;
              return countProbability(model, (k - b) / a, (k - b) / a);
            };
            const factorialSecond = variance + mean * mean - mean,
              selected = coefficient(s.selected);
            return (
              <>
                <Panel title="系数柱与 PGF">
                  <Plot
                    series={[
                      { kind: "bar", data: shown, name: "系数" },
                      {
                        kind: "bar",
                        data: shown.filter((p) => p.x === s.selected),
                        color: "var(--stats-gold)",
                        name: "选中指数",
                      },
                    ]}
                    xLabel="幂指数 / 随机变量取值"
                    yLabel="概率系数"
                  />
                  <Result
                    label="结果 PGF（有限表保留精确分数）"
                    value={derived}
                  />
                  <Result
                    label="代入 G(t)"
                    value={
                      Number.isFinite(value)
                        ? format(value, 10)
                        : "当前代入值超出浮点表示范围"
                    }
                  />
                  <Result
                    label={`系数 [t^${s.selected}]G(t)`}
                    value={format(selected, 10)}
                    note={
                      infinite
                        ? "所选系数按完整模型计算，包含图示范围之外的支持。"
                        : undefined
                    }
                  />
                  <Result
                    label="显示范围之外的理论质量"
                    value={format(tail, 12)}
                    note="无限级数只截断显示，理论矩与 PGF 使用完整分布。"
                  />
                  <MomentResults mean={mean} variance={variance} />
                  <Result label="G′(1)=E(X)" value={format(mean)} />
                  <Result
                    label="G″(1)=E[X(X−1)]"
                    value={format(factorialSecond)}
                  />
                  <Formula value="\operatorname{Var}(X)=G''(1)+G'(1)-[G'(1)]^2" />
                  {finiteExact && (
                    <>
                      <Result
                        label="逐项求导 G′(t)"
                        value={polynomialText(finiteExact, 1)}
                      />
                      <Result
                        label="逐项求导 G″(t)"
                        value={polynomialText(finiteExact, 2)}
                      />
                      <Reveal>
                        <div style={{ maxHeight: 250, overflow: "auto" }}>
                          <table className="stats-table">
                            <thead>
                              <tr>
                                <th>指数 k</th>
                                <th>精确系数</th>
                                <th>选中</th>
                              </tr>
                            </thead>
                            <tbody>
                              {finiteExact.map((row) => (
                                <tr key={row.x}>
                                  <td>{row.x}</td>
                                  <td>{rationalText(row.p)}</td>
                                  <td>
                                    <Button
                                      onClick={() => patch({ selected: row.x })}
                                    >
                                      高亮
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </Reveal>
                    </>
                  )}
                  {shown.some((p) => p.x < 0) && (
                    <Notice>
                      这里是有限 Laurent 形式；在 t=1 求导仍可连接矩，但不能在 0
                      点使用普通 PGF 的 Taylor 求系数法。
                    </Notice>
                  )}
                </Panel>
                {s.operation === "independent" && (
                  <Panel title="独立配对按总和聚合">
                    <Notice>
                      独立性给出 P(X₁=i,X₂=j)=pᵢpⱼ。每条 i+j
                      相同的对角线相加成为一个卷积系数；若使用同一个 X
                      两次，应切换 G(t²)。
                    </Notice>
                    <Reveal>
                      <div style={{ overflow: "auto" }}>
                        <table className="stats-table">
                          <thead>
                            <tr>
                              <th>X₁ ＼ X₂</th>
                              {source.masses.slice(0, 8).map((p) => (
                                <th key={p.x}>{p.x}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {source.masses.slice(0, 8).map((p) => (
                              <tr key={p.x}>
                                <th>{p.x}</th>
                                {source.masses.slice(0, 8).map((q) => (
                                  <td
                                    key={q.x}
                                    style={
                                      p.x + q.x === s.selected
                                        ? { background: "#a66b1433" }
                                        : undefined
                                    }
                                  >
                                    {p.x + q.x}
                                    <br />
                                    {format(p.y * q.y, 4)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <Notice>
                        配对格最多显示前 8×8
                        格；上方卷积计算使用全部有限支持或注明的显示截断。
                      </Notice>
                    </Reveal>
                  </Panel>
                )}
                {s.task === "root" && (
                  <Panel title="已知独立同分布条件，反求单个 PGF">
                    <Output>
                      {() => {
                        const root = iidSquareRoot(
                            parseMasses(s.sumTable, true),
                          ),
                          stats = moments(root),
                          table = root
                            .map((p) => `${p.x}, ${format(p.y, 10)}`)
                            .join("\n");
                        return (
                          <>
                            <Result
                              label="非负、归一且全系数回代通过的根"
                              value={table}
                            />
                            <MomentResults {...stats} />
                            <Plot
                              series={[
                                { kind: "bar", data: root, color: "var(--stats-gold)" },
                              ]}
                              xLabel="单个变量的支持"
                              yLabel="恢复的概率"
                            />
                            <Notice>
                              仅支持两个独立同分布非负整数有限变量的平方根模板，数值容差
                              10⁻⁸；没有独立同分布条件时不能作此逆推。
                            </Notice>
                          </>
                        );
                      }}
                    </Output>
                  </Panel>
                )}
              </>
            );
          }}
        </Output>
      </div>
    </div>
  );
}
