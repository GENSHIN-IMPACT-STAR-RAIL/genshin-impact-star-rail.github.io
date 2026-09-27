export type Theme = "light" | "dark";
export type PlotTheme = {
  background: string;
  minor: string;
  major: string;
  axis: string;
  text: string;
  axisText: string;
  labelBackground: string;
};
export const lightCurveColors = [
  "#4d657a",
  "#b08442",
  "#337462",
  "#a65f65",
  "#7b7294",
  "#98705b",
];
const darkCurveColors = [
  "#b1c3d1",
  "#d7b477",
  "#88c3ac",
  "#e69a9d",
  "#b6a7cd",
  "#cca991",
];
export const plotThemes: Record<Theme, PlotTheme> = {
  light: {
    background: "#fffefa",
    minor: "#f0f1eb",
    major: "#e0e5df",
    axis: "#a0aeae",
    text: "#647781",
    axisText: "#5d7079",
    labelBackground: "#fffefaf2",
  },
  dark: {
    background: "#18242e",
    minor: "#21313c",
    major: "#2e414e",
    axis: "#586e7c",
    text: "#9bafbd",
    axisText: "#b1c3d1",
    labelBackground: "#18242ef2",
  },
};
export function curveColor(color: string, theme: Theme) {
  const index = lightCurveColors.indexOf(color);
  return theme === "dark" && index >= 0 ? darkCurveColors[index] : color;
}
export function readTheme(): Theme {
  try {
    const stored = localStorage.getItem("mathroom-theme");
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    /* Storage may be unavailable. */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#17212b" : "#f6f5f1");
}
