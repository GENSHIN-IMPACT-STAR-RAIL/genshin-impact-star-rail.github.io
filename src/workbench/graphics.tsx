import { glyphMarkup, type ObjectSpec } from "../mechanics-objects/art";
import { specFor, type SceneObject } from "./model";
import { BOUNDS } from "./glyph-layout";
export function Miniature({
  spec,
  variant,
}: {
  spec: ObjectSpec;
  variant?: string;
}) {
  return (
    <svg
      viewBox="0 0 220 140"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: glyphMarkup(spec, variant) }}
    />
  );
}
export function ObjectGraphic({
  object,
  scale,
}: {
  object: SceneObject;
  scale: number;
}) {
  const spec = specFor(object.catalogId);
  if (!spec) return null;
  const bounds = BOUNDS[object.variant] ?? [0, 0, 220, 140];
  const width =
    Number.isFinite(object.width) && object.width > 0
      ? object.width * scale
      : scale;
  const height =
    Number.isFinite(object.height) && object.height > 0
      ? object.height * scale
      : scale;
  if (object.catalogId === "C01")
    return (
      <g className="wb-custom-plane">
        <rect
          x={-width / 2}
          y={-height / 2}
          width={width}
          height={height}
          fill="var(--surface)"
          stroke="var(--field-line)"
          strokeWidth="1"
        />
        <line
          x1={-width / 2}
          x2={width / 2}
          y1={-height / 2}
          y2={-height / 2}
          stroke="var(--secondary-ink)"
          strokeWidth="2.5"
        />
        {object.variant === "plane-rough" &&
          Array.from(
            { length: Math.max(1, Math.min(50, Math.floor(width / 12))) },
            (_, i) => (
              <line
                key={i}
                x1={-width / 2 + 7 + i * 12}
                x2={-width / 2 + 10 + i * 12}
                y1={-height / 2}
                y2={-height / 2 - 4}
                stroke="var(--secondary-ink)"
                strokeWidth="1"
              />
            ),
          )}
      </g>
    );
  if (["C05", "C06", "C07", "C11"].includes(object.catalogId)) {
    if (!Number.isFinite(object.width) || object.width < 0.05)
      return (
        <g>
          <circle r="6" fill="var(--canvas-bg)" stroke="var(--danger)" />
          <path d="M-3 -3L3 3M-3 3L3 -3" stroke="var(--danger)" />
        </g>
      );
    const length = object.width,
      limit =
        object.catalogId === "C11"
          ? object.properties.constraintLength
          : object.properties.naturalLength;
    const invalid =
      limit !== undefined &&
      (object.catalogId === "C05"
        ? length > limit + 1e-5
        : object.catalogId === "C11" && Math.abs(length - limit) > 1e-5);
    const color = invalid
      ? "var(--danger)"
      : object.catalogId === "C11"
        ? "var(--secondary-ink)"
        : "var(--object-rope)";
    let d = `M${-width / 2} 0L${width / 2} 0`;
    if (object.catalogId === "C07") {
      const margin = Math.min(15, width * 0.12),
        span = width - 2 * margin;
      d =
        `M${-width / 2} 0h${margin}` +
        Array.from(
          { length: 12 },
          (_, i) =>
            `L${-width / 2 + margin + (span * (i + 0.5)) / 12} ${i % 2 ? 8 : -8}`,
        ).join(" ") +
        `L${width / 2 - margin} 0H${width / 2}`;
    }
    const slack =
      (object.catalogId === "C05" || object.catalogId === "C06") &&
      limit !== undefined &&
      length < limit - 1e-5;
    return (
      <g>
        <path
          d={d}
          strokeDasharray={slack ? "5 4" : undefined}
          fill="none"
          stroke={color}
          strokeWidth={object.catalogId === "C11" ? 5 : 2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {object.catalogId === "C11" && (
          <path d={d} fill="none" stroke="var(--canvas-bg)" strokeWidth="2" />
        )}
        {object.catalogId === "C06" && length >= (limit ?? 0) && (
          <path
            d={`M${-width * 0.23} 0H${width * 0.23}`}
            stroke={color}
            strokeWidth="7"
            opacity=".22"
          />
        )}
      </g>
    );
  }
  return (
    <svg
      className="wb-object-art"
      x={-width / 2}
      y={-height / 2}
      width={width}
      height={height}
      viewBox={bounds.join(" ")}
      preserveAspectRatio="none"
      overflow="visible"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: glyphMarkup(spec, object.variant) }}
    />
  );
}
