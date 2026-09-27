import { useMemo } from "react";
import { MathInput, StaticMath } from "./MathInput";
import { odeSelection, solveOdeLatex, type OdeEntryState } from "./odeLatex";
import { ODE_DENSITIES } from "./odeField";

export function OdeExpression({
  index,
  order = 1,
  value,
  state,
  onValue,
  onState,
  onFocus,
}: {
  index: number;
  order?: 1 | 2;
  value: string;
  state: OdeEntryState;
  onValue: (value: string) => void;
  onState: (patch: Partial<OdeEntryState>) => void;
  onFocus: () => void;
}) {
  const selected = useMemo(
    () => odeSelection(state),
    [state.solution, state.initialX, state.initialY, state.initialSlope],
  );
  const solve = () => {
    window.mathVirtualKeyboard.hide();
    try {
      onState({ solution: solveOdeLatex(value, order), error: "" });
    } catch (error) {
      onState({ solution: null, error: (error as Error).message });
    }
  };
  return (
    <div className="ode-expression">
      <div
        className="formula-row ode-formula"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            solve();
          }
        }}
      >
        <MathInput
          label={`微分方程 ${index}`}
          value={value}
          onChange={onValue}
          onFocus={onFocus}
        />
      </div>
      <div className="ode-solve-row">
        <span>输入完整方程</span>
        <button className="ode-solve" onClick={solve}>
          求解
        </button>
      </div>
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      {state.solution && (
        <div className="ode-answer">
          <span>
            通解
            {state.solution.order === 2 && state.solution.approximate
              ? "（系数近似）"
              : ""}
          </span>
          <StaticMath value={state.solution.general} />
        </div>
      )}
      <div className="ode-initial-title">
        初值条件 <span>可选</span>
      </div>
      <div className="ode-initial">
        <div>
          <StaticMath value="x_0=" />
          <MathInput
            label={`微分方程 ${index} 初值 x 坐标`}
            value={state.initialX}
            onChange={(initialX) => onState({ initialX })}
            onFocus={onFocus}
          />
        </div>
        <div>
          <StaticMath value={order === 2 ? "y(x_0)=" : "y_0="} />
          <MathInput
            label={`微分方程 ${index} 初值 y 坐标`}
            value={state.initialY}
            onChange={(initialY) => onState({ initialY })}
            onFocus={onFocus}
          />
        </div>
        {order === 2 && (
          <div className="ode-initial-slope">
            <StaticMath value="y'(x_0)=" />
            <MathInput
              label={`微分方程 ${index} 初始斜率`}
              value={state.initialSlope}
              onChange={(initialSlope) => onState({ initialSlope })}
              onFocus={onFocus}
            />
          </div>
        )}
      </div>
      {selected.error && (
        <p className="error" role="status">
          {selected.error}
        </p>
      )}
      {selected.warning && (
        <p className="ode-note" role="status">
          {selected.warning}
        </p>
      )}
      {selected.point && (
        <div className="ode-answer ode-special">
          <span>特解{selected.approximate ? "（系数近似）" : ""}</span>
          <StaticMath value={selected.particular} />
        </div>
      )}
      {selected.point && (
        <label className="ode-family-toggle">
          <input
            type="checkbox"
            checked={state.showFamily !== false}
            onChange={(event) => onState({ showFamily: event.target.checked })}
          />
          显示其它积分曲线
        </label>
      )}
      <div className="ode-density">
        <span>曲线密度</span>
        <div
          className="ode-density-presets"
          role="group"
          aria-label={`微分方程 ${index} 曲线密度`}
        >
          {ODE_DENSITIES.map((preset) => (
            <button
              key={preset.level}
              aria-pressed={(state.density ?? 3) === preset.level}
              disabled={!!selected.point && state.showFamily === false}
              onClick={() => onState({ density: preset.level })}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
      <p className="ode-note">
        {order === 2
          ? "曲线连续铺满视窗，允许相交。选中特解后，优先显示附近初值与斜率对应的曲线。"
          : "曲线连续铺满可求解区域。选中特解后，优先显示附近初值对应的曲线。"}
      </p>
      <div className="ode-feature-key">
        <span>
          <i className="ode-singular-key" />
          奇点
        </span>
        <span>
          <i className="ode-asymptote-key" />
          渐近线
        </span>
        <small>仅标记可确认的特征</small>
      </div>
      {state.solution && (
        <details className="ode-details">
          <summary>求解过程</summary>
          <ol>
            {state.solution.steps.map((step, index) => (
              <li key={index}>
                <StaticMath value={step} />
              </li>
            ))}
          </ol>
          {state.solution.constantSolutions && (
            <div className="ode-equilibrium">
              <span>平衡解条件</span>
              <StaticMath value={state.solution.constantSolutions} />
            </div>
          )}
          <p className="ode-note">
            <StaticMath value={order === 2 ? "C_1,\\,C_2" : "C"} />{" "}
            {order === 2
              ? "为两个独立的任意常数。积分曲线由求得的通解采样绘制。"
              : "为任意常数。曲线采用数值积分，接近奇点时停止绘制。"}
          </p>
        </details>
      )}
    </div>
  );
}
