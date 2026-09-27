import { ChevronDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";
import {
  formatAngle,
  formatDegrees,
  formatRadius,
  type PolarSample,
} from "./polarPoints";
import "./polarPoints.css";

export function PolarPointControls({
  enabled,
  onEnabled,
  divisions,
  onDivisions,
  showValues,
  onShowValues,
  showRays,
  onShowRays,
  expressionId,
  onExpression,
  expressions,
  error,
  onFit,
}: {
  enabled: boolean;
  onEnabled: (value: boolean) => void;
  divisions: string;
  onDivisions: (value: string) => void;
  showValues: boolean;
  onShowValues: (value: boolean) => void;
  showRays: boolean;
  onShowRays: (value: boolean) => void;
  expressionId: number | undefined;
  onExpression: (id: number) => void;
  expressions: { id: number; name: string }[];
  error: string;
  onFit: () => void;
}) {
  return (
    <section className="point-settings" aria-label="极坐标描点设置">
      <div className="point-top-row">
        <label className="point-toggle">
          <input
            type="checkbox"
            aria-label="极坐标描点"
            checked={enabled}
            onChange={(e) => onEnabled(e.target.checked)}
          />
          显示描点
        </label>
        <label className="point-field">
          <span>等分</span>
          <input
            aria-label="描点等分份数"
            type="number"
            min="1"
            max="64"
            step="1"
            value={divisions}
            disabled={!enabled}
            onChange={(e) => onDivisions(e.target.value)}
          />
          <span>份</span>
        </label>
      </div>
      <fieldset className="point-options" disabled={!enabled}>
        {expressions.length > 1 && (
          <label className="point-field point-curve">
            <span>曲线</span>
            <select
              aria-label="描点曲线"
              value={expressionId}
              onChange={(e) => onExpression(Number(e.target.value))}
            >
              {expressions.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="point-presets">
          {[4, 8, 12, 16].map((n) => (
            <button
              key={n}
              aria-label={n + " 等份"}
              aria-pressed={divisions === String(n)}
              onClick={() => onDivisions(String(n))}
            >
              {n} 等份
            </button>
          ))}
        </div>
        <div className="point-actions-row">
          <label className="point-toggle">
            <input
              type="checkbox"
              aria-label="标注 r 与 θ"
              checked={showValues}
              onChange={(e) => onShowValues(e.target.checked)}
            />
            数值标注
          </label>
          <label className="point-toggle">
            <input
              type="checkbox"
              aria-label="显示径向辅助线"
              checked={showRays}
              onChange={(e) => onShowRays(e.target.checked)}
            />
            辅助线
          </label>
          <button
            className="point-fit"
            aria-label="适应描点视图"
            onClick={onFit}
            disabled={!!error}
          >
            适应视图
          </button>
        </div>
      </fieldset>
    </section>
  );
}
export function PolarPointTable({
  rows,
  expanded,
  onExpand,
  selected,
  onSelect,
  color,
  error,
  controls,
  enabled,
}: {
  rows: PolarSample[];
  expanded: boolean;
  onExpand: (v: boolean) => void;
  selected: string | null;
  onSelect: (id: string) => void;
  color: string;
  error: string;
  controls: ReactNode;
  enabled: boolean;
}) {
  return (
    <section
      className={`point-table-panel${expanded ? " expanded" : ""}`}
      aria-label="极坐标描点表"
      style={{ "--point-color": color } as React.CSSProperties}
    >
      <button
        className="point-table-header"
        aria-expanded={expanded}
        onClick={() => onExpand(!expanded)}
      >
        <span>
          <i />
          描点表 <small>{enabled ? `${rows.length} 行` : "未开启"}</small>
        </span>
        {expanded ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
      </button>
      {expanded && (
        <div className="point-table-content">
          {controls}
          {!enabled ? (
            <p className="point-table-note">
              开启“显示描点”，即可查看等分点和数值表。
            </p>
          ) : error ? (
            <p className="point-table-error">{error}</p>
          ) : (
            <div className="point-table-scroll">
              <table>
                <caption>按当前 θ 范围等分，r 为近似值</caption>
                <thead>
                  <tr>
                    <th>点</th>
                    <th>θ（弧度）</th>
                    <th>θ（角度）</th>
                    <th>r ≈</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={selected === row.id ? "selected" : ""}
                      onClick={() => onSelect(row.id)}
                    >
                      <th scope="row">
                        <button
                          aria-label={`选中描点 ${row.label}`}
                          onClick={() => onSelect(row.id)}
                        >
                          {row.label}
                        </button>
                      </th>
                      <td>{formatAngle(row.theta)}</td>
                      <td>{formatDegrees(row.theta)}</td>
                      <td>
                        {row.r !== null ? (
                          formatRadius(row.r)
                        ) : row.limit !== null ? (
                          <>
                            <span>→ {formatRadius(row.limit)}</span>
                            <small>未定义</small>
                          </>
                        ) : (
                          <small>
                            {row.status === "excluded"
                              ? "未定义"
                              : row.status === "hidden"
                                ? "负 r 已隐藏"
                                : "无实数值"}
                          </small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {enabled && (
            <p className="point-table-note">
              点击点号，在图中查看对应点；Q 表示第二个实数解。
            </p>
          )}
        </div>
      )}
    </section>
  );
}
