import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  curveColor,
  lightCurveColors,
  plotThemes,
  type Theme,
} from "./theme.ts";
const luminance = (hex: string) => {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};
const contrast = (a: string, b: string) => {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
describe("light and dark plot readability", () => {
  for (const theme of ["light", "dark"] as Theme[])
    it(`${theme}: curves and labels remain distinguishable from the canvas`, () => {
      const paint = plotThemes[theme];
      for (const color of lightCurveColors)
        assert.ok(
          contrast(curveColor(color, theme), paint.background) >= 3,
          `${theme}: ${color}`,
        );
      assert.ok(contrast(paint.text, paint.background) >= 4.5);
      assert.ok(contrast(paint.axisText, paint.background) >= 4.5);
    });
  it("switches palettes without changing canonical expression colors", () => {
    const before = [...lightCurveColors];
    assert.notEqual(curveColor(before[0], "dark"), before[0]);
    assert.equal(curveColor(before[0], "light"), before[0]);
    assert.deepEqual(lightCurveColors, before);
  });
});
