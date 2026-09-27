export type View = { x: number; y: number; scale: number };
export const DEFAULT_VIEW: View = { x: 0, y: 0, scale: 52 };
export function curveSegments(
  fn: (x: number) => number,
  view: View,
  width: number,
  height: number,
) {
  const lines: [number, number][][] = [];
  let line: [number, number][] = [];
  const flush = () => {
    if (line.length > 1) lines.push(line);
    line = [];
  };
  let previousY = NaN;
  for (let px = 0; px <= width; px += 1.5) {
    const x = view.x + (px - width / 2) / view.scale;
    const y = fn(x);
    const py = height / 2 - (y - view.y) * view.scale;
    const mid = fn(x - 0.75 / view.scale);
    const offscreen =
      !Number.isFinite(py) || Math.abs(py - height / 2) > height * 4;
    const discontinuity =
      Number.isFinite(previousY) &&
      (!Number.isFinite(mid) ||
        Math.abs(mid - (previousY + y) / 2) * view.scale > 8);
    if (offscreen || discontinuity) flush();
    if (!offscreen) line.push([px, py]);
    previousY = y;
  }
  flush();
  return lines;
}
