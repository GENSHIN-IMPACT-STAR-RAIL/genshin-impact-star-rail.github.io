import { useEffect, useState } from "react";
import { Link2, Unlink } from "lucide-react";
import { type Scene, type SceneObject, type Vec } from "./model";
import {
  planeEndpoints,
  planeFromEndpoints,
  setPlaneGeometry,
  resolvedEndpoints,
  anchorLabel,
  objectPorts,
  anchorPosition,
  bindEndpoint,
  releaseEndpoint,
  changeEndpoint,
  syncConnections,
  type AnchorRef,
  type Endpoint,
  type ConnectionIntent,
} from "./relations";
function CoordinateInput({
  label,
  value,
  onCommit,
  unit = "m",
}: {
  label: string;
  value: number;
  onCommit: (n: number) => boolean;
  unit?: string;
}) {
  const [text, setText] = useState(String(Number(value.toFixed(6))));
  useEffect(
    () =>
      setText(Number.isFinite(value) ? String(Number(value.toFixed(6))) : ""),
    [value],
  );
  function commit() {
    const n = text.trim() === "" ? NaN : Number(text);
    if (!onCommit(n))
      setText(Number.isFinite(value) ? String(Number(value.toFixed(6))) : "");
  }
  return (
    <label className="wb-field">
      <span>{label}</span>
      <div>
        <input
          type="number"
          aria-label={label}
          step="0.1"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              e.stopPropagation();
              setText(String(Number(value.toFixed(6))));
            }
          }}
        />
        <small>{unit}</small>
      </div>
    </label>
  );
}
export function PlaneEditor({
  object,
  scene,
  onChange,
  onError,
}: {
  object: SceneObject;
  scene: Scene;
  onChange: (s: Scene) => void;
  onError: (message: string) => void;
}) {
  const ends = planeEndpoints(object);
  const apply = (fn: () => SceneObject) => {
    try {
      const next = fn();
      onChange(
        syncConnections({
          ...scene,
          objects: scene.objects.map((o) => (o.id === object.id ? next : o)),
        }),
      );
      return true;
    } catch (e) {
      onError((e as Error).message);
      return false;
    }
  };
  return (
    <section className="wb-connection-section">
      <h3>平面几何</h3>
      <div className="wb-position-fields">
        <CoordinateInput
          label="平面长度"
          value={object.width}
          onCommit={(n) =>
            apply(() => setPlaneGeometry(object, n, object.angle))
          }
        />
        <CoordinateInput
          label="平面角度"
          value={object.angle}
          unit="°"
          onCommit={(n) =>
            apply(() => setPlaneGeometry(object, object.width, n))
          }
        />
      </div>
      <p className="wb-help">
        拖动画布上的 A、B 控制点。拖动一端时，另一端保持不动。
      </p>
      <details className="wb-endpoint-coordinates">
        <summary>直接输入端点坐标</summary>
        {(["a", "b"] as const).map((side) => (
          <div key={side} className="wb-position-fields">
            <CoordinateInput
              label={`${side.toUpperCase()} 点 x`}
              value={ends[side].x}
              onCommit={(n) =>
                apply(() =>
                  planeFromEndpoints(
                    object,
                    side === "a" ? { ...ends.a, x: n } : ends.a,
                    side === "b" ? { ...ends.b, x: n } : ends.b,
                  ),
                )
              }
            />
            <CoordinateInput
              label={`${side.toUpperCase()} 点 y`}
              value={ends[side].y}
              onCommit={(n) =>
                apply(() =>
                  planeFromEndpoints(
                    object,
                    side === "a" ? { ...ends.a, y: n } : ends.a,
                    side === "b" ? { ...ends.b, y: n } : ends.b,
                  ),
                )
              }
            />
          </div>
        ))}
      </details>
    </section>
  );
}
export function ConnectionEditor({
  object,
  scene,
  onChange,
  onError,
  onPick,
  intent,
}: {
  object: SceneObject;
  scene: Scene;
  onChange: (s: Scene) => void;
  onError: (s: string) => void;
  onPick: (i: ConnectionIntent) => void;
  intent: ConnectionIntent | null;
}) {
  let ends: { a: Vec; b: Vec };
  try {
    ends = resolvedEndpoints(scene, object);
  } catch {
    return <p className="wb-help">连接需要修正，请执行搭建检查。</p>;
  }
  const apply = (f: () => Scene) => {
    try {
      onChange(f());
      return true;
    } catch (e) {
      onError((e as Error).message);
      return false;
    }
  };
  return (
    <section className="wb-connection-section">
      <h3>连接端点</h3>
      <p className="wb-help">
        拖动端点吸附到连接点，或选择下方目标。连接会随目标移动与旋转。
      </p>
      {(["a", "b"] as const).map((side) => {
        const connection = scene.connections.find(
            (c) => c.connectorId === object.id && c.endpoint === side,
          ),
          target = connection?.target;
        const targetValue = !target
          ? "free"
          : target.kind === "object"
            ? target.objectId
            : target.kind === "environment"
              ? target.boundary
              : "world";
        const picking =
          intent &&
          "connectorId" in intent &&
          intent.connectorId === object.id &&
          intent.endpoint === side;
        function selectTarget(value: string) {
          if (value === "free") {
            apply(() => releaseEndpoint(scene, object.id, side));
            return;
          }
          let target: AnchorRef;
          if (value === "world") target = { kind: "world", ...ends[side] };
          else if (value === "ground" || value === "ceiling")
            target = { kind: "environment", boundary: value, x: ends[side].x };
          else {
            const o = scene.objects.find((o) => o.id === value)!;
            const ports = objectPorts(o),
              port =
                o.catalogId === "C01"
                  ? ports[2]
                  : ["C09", "C10", "C12"].includes(o.catalogId)
                    ? ports.at(-1)!
                    : ports[0];
            target = { kind: "object", objectId: o.id, ...port };
          }
          apply(() => bindEndpoint(scene, object.id, side, target));
        }
        const setPosition = (key: "x" | "y", value: number) =>
          apply(() => {
            const p = { ...ends[side], [key]: value };
            if (!Number.isFinite(value)) throw Error("请输入有效端点坐标。");
            return target?.kind === "world"
              ? bindEndpoint(scene, object.id, side, { kind: "world", ...p })
              : target?.kind === "environment"
                ? bindEndpoint(scene, object.id, side, { ...target, x: p.x })
                : changeEndpoint(scene, object.id, side, p);
          });
        return (
          <div key={side} className="wb-endpoint-card">
            <div className="wb-endpoint-heading">
              <strong>端点 {side.toUpperCase()}</strong>
              <button
                className={picking ? "active" : ""}
                onClick={() =>
                  onPick({ connectorId: object.id, endpoint: side })
                }
              >
                <Link2 size={12} />
                选点
              </button>
              <button
                title="解除这一端的连接"
                aria-label={`解除端点 ${side.toUpperCase()} 连接`}
                disabled={!connection}
                onClick={() =>
                  apply(() => releaseEndpoint(scene, object.id, side))
                }
              >
                <Unlink size={12} />
              </button>
            </div>
            <select
              aria-label={`端点 ${side.toUpperCase()} 连接目标`}
              value={targetValue}
              onChange={(e) => selectTarget(e.target.value)}
            >
              <option value="free">未连接（自由端点）</option>
              <option value="world">固定坐标</option>
              {scene.environment.ground && <option value="ground">地面</option>}
              {scene.environment.ceiling && (
                <option value="ceiling">天花板</option>
              )}
              {target?.kind === "environment" &&
                !scene.environment[target.boundary] && (
                  <option value={target.boundary}>
                    {target.boundary === "ground" ? "地面" : "天花板"}（已关闭）
                  </option>
                )}
              {scene.objects
                .filter((o) => o.id !== object.id)
                .map((o) => (
                  <option value={o.id} key={o.id}>
                    {o.name}
                  </option>
                ))}
            </select>
            {target?.kind === "object" &&
              (() => {
                const o = scene.objects.find((o) => o.id === target.objectId);
                if (!o) return null;
                const ports = objectPorts(o),
                  value = `${target.u},${target.v}`;
                return (
                  <select
                    aria-label={`端点 ${side.toUpperCase()} 目标连接点`}
                    value={value}
                    onChange={(e) => {
                      const port = ports.find(
                        (p) => `${p.u},${p.v}` === e.target.value,
                      )!;
                      apply(() =>
                        bindEndpoint(scene, object.id, side, {
                          kind: "object",
                          objectId: o.id,
                          ...port,
                        }),
                      );
                    }}
                  >
                    {!ports.some((p) => `${p.u},${p.v}` === value) && (
                      <option value={value}>
                        {target.label ?? "自定义连接点"}
                      </option>
                    )}
                    {ports.map((p, i) => (
                      <option key={i} value={`${p.u},${p.v}`}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                );
              })()}
            {(!target || target.kind === "world") && (
              <div className="wb-position-fields">
                <CoordinateInput
                  label={`${side.toUpperCase()} 端 x`}
                  value={ends[side].x}
                  onCommit={(n) => setPosition("x", n)}
                />
                <CoordinateInput
                  label={`${side.toUpperCase()} 端 y`}
                  value={ends[side].y}
                  onCommit={(n) => setPosition("y", n)}
                />
              </div>
            )}
            {target?.kind === "environment" && (
              <CoordinateInput
                label={`${side.toUpperCase()} 端水平位置`}
                value={ends[side].x}
                onCommit={(n) => setPosition("x", n)}
              />
            )}
            {target && (
              <p className="wb-endpoint-status">{anchorLabel(scene, target)}</p>
            )}
          </div>
        );
      })}
      <details className="wb-endpoint-coordinates">
        <summary>连接状态</summary>
        <p className="wb-help">
          当前两端间距{" "}
          {Math.hypot(ends.b.x - ends.a.x, ends.b.y - ends.a.y).toFixed(3)}{" "}
          m。绘制与附着已建立，长度可行性请用“检查搭建”核对。
        </p>
      </details>
    </section>
  );
}
