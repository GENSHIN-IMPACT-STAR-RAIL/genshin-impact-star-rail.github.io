import {
  useEffect,
  useRef,
  type HTMLAttributes,
  type RefAttributes,
} from "react";
import { MathfieldElement, type VirtualKeyboardLayout } from "mathlive";
import { computeEngine } from "./latex";
import "mathlive/fonts.css";
import "mathlive/static.css";
import "./keyboard.css";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "math-field": HTMLAttributes<MathfieldElement> &
        RefAttributes<MathfieldElement>;
    }
  }
}
MathfieldElement.fontsDirectory = null;
MathfieldElement.soundsDirectory = null;
MathfieldElement.computeEngine = computeEngine;
MathfieldElement.locale = "zh-cn";
const key = (latex: string, insert: string, tooltip: string) => ({
  latex: `\\textstyle ${latex}`,
  insert,
  tooltip,
});
const nextPlaceholder = {
  label: "下一格",
  command: "moveToNextPlaceholder",
  tooltip: "移到下一个占位框",
  class: "action math-key-next hide-shift",
};
const layouts: VirtualKeyboardLayout[] = [
  {
    label: "123",
    tooltip: "基础与结构",
    rows: [
      ["x", "y", "\\pi", "e"],
      [
        key("\\frac{\\square}{\\square}", "\\frac{#0}{#?}", "分式"),
        key("\\square^2", "#@^2", "平方"),
        key("\\square^{\\square}", "#@^{#?}", "幂"),
        key("\\sqrt{\\square}", "\\sqrt{#0}", "平方根"),
      ],
      [
        key("\\left(\\square\\right)", "\\left(#0\\right)", "括号"),
        key("\\left|\\square\\right|", "\\left|#0\\right|", "绝对值"),
        key("\\sqrt[\\square]{\\square}", "\\sqrt[#?]{#0}", "n 次根"),
        key("\\square_{\\square}", "#@_{#?}", "下标"),
      ],
      ["[left]", "[right]", nextPlaceholder, "[undo]"],
      ["7", "8", "9", "[backspace]"],
      ["4", "5", "6", "\\times"],
      ["1", "2", "3", "-"],
      ["0", ".", "+", "[hide-keyboard]"],
    ],
  },
  {
    label: "f(x)",
    tooltip: "函数与微积分",
    rows: [
      [
        key("\\sin", "\\sin\\left(#0\\right)", "正弦"),
        key("\\cos", "\\cos\\left(#0\\right)", "余弦"),
        key("\\tan", "\\tan\\left(#0\\right)", "正切"),
        key("\\ln", "\\ln\\left(#0\\right)", "自然对数"),
        key("\\log_{10}", "\\log_{10}\\left(#0\\right)", "常用对数"),
        key(
          "\\log_{\\square}",
          "\\log_{#?}\\left(#0\\right)",
          "指定底数的对数",
        ),
      ],
      [
        key("\\sin^{-1}", "\\arcsin\\left(#0\\right)", "反正弦"),
        key("\\cos^{-1}", "\\arccos\\left(#0\\right)", "反余弦"),
        key("\\tan^{-1}", "\\arctan\\left(#0\\right)", "反正切"),
        key("e^{\\square}", "e^{#0}", "指数"),
        key("10^{\\square}", "10^{#0}", "10 的幂"),
        "x",
      ],
      [
        key(
          "\\sum",
          "\\sum_{n=#?}^{#?}\\left(#0\\right)",
          "求和（最多 100 项）",
        ),
        key(
          "\\prod",
          "\\prod_{n=#?}^{#?}\\left(#0\\right)",
          "连乘（最多 100 项）",
        ),
        key(
          "\\int_{\\square}^{\\square}",
          "\\int_{#?}^{#?}\\left(#0\\right)\\,\\mathrm{d}x",
          "定积分（数值）",
        ),
        key(
          "\\int",
          "\\int\\left(#0\\right)\\,\\mathrm{d}x",
          "不定积分（仅录入）",
        ),
        key(
          "\\frac{\\mathrm{d}}{\\mathrm{d}x}",
          "\\frac{\\mathrm{d}}{\\mathrm{d}x}\\left(#0\\right)",
          "导数（数值）",
        ),
      ],
      [
        "[left]",
        "[right]",
        nextPlaceholder,
        "[undo]",
        "[redo]",
        "[backspace]",
        "[hide-keyboard]",
      ],
    ],
  },
  {
    label: "ABC",
    tooltip: "英文字母",
    rows: [
      ..."qwertyuiop asdfghjkl zxcvbnm".split(" ").map((row) => row.split("")),
      ["(", ")", "[left]", "[right]", "[backspace]", "[hide-keyboard]"],
    ],
  },
  {
    label: "αβ",
    tooltip: "希腊字母",
    rows: [
      ["\\alpha", "\\beta", "\\gamma", "\\delta", "\\epsilon", "\\theta"],
      ["\\lambda", "\\mu", "\\nu", "\\rho", "\\sigma", "\\tau"],
      ["\\phi", "\\chi", "\\psi", "\\omega", "\\pi", "[backspace]"],
      ["(", ")", "[left]", "[right]", "[undo]", "[hide-keyboard]"],
    ],
  },
  {
    label: "#&",
    tooltip: "关系与符号（部分仅录入）",
    rows: [
      ["=", "\\ne", "<", ">", "\\le", "\\ge"],
      ["\\infty", "\\in", "\\subset", "\\cup", "\\cap", "\\emptyset"],
      ["\\to", "\\pm", "\\degree", "[", "]", "[backspace]"],
      ["(", ")", "[left]", "[right]", "[undo]", "[hide-keyboard]"],
    ],
  },
];

export function KeyboardManager({
  desktopContainer,
  polar = false,
  parametric = false,
  implicit = false,
  ode = false,
  odeOrder = 1,
}: {
  desktopContainer: HTMLElement | null;
  polar?: boolean;
  parametric?: boolean;
  implicit?: boolean;
  ode?: boolean;
  odeOrder?: 1 | 2;
}) {
  useEffect(() => {
    const keyboard = window.mathVirtualKeyboard;
    const configuredLayouts =
      polar || parametric || implicit || ode
        ? layouts.map((layout, i) =>
            i === 0 && "rows" in layout
              ? {
                  ...layout,
                  rows: [
                    [
                      polar ? "\\theta" : parametric ? "t" : "x",
                      polar ? "r" : implicit || ode ? "y" : "x",
                      implicit || ode ? "=" : parametric ? "y" : "\\pi",
                      ...(ode
                        ? [
                            key(
                              odeOrder === 2
                                ? "\\frac{\\mathrm{d}^2y}{\\mathrm{d}x^2}"
                                : "\\frac{\\mathrm{d}y}{\\mathrm{d}x}",
                              odeOrder === 2
                                ? "\\frac{\\mathrm{d}^2y}{\\mathrm{d}x^2}"
                                : "\\frac{\\mathrm{d}y}{\\mathrm{d}x}",
                              odeOrder === 2 ? "二阶导数" : "一阶导数 dy/dx",
                            ),
                          ]
                        : layout.rows[0].slice(3)),
                    ],
                    ...layout.rows.slice(1),
                  ],
                }
              : ode && i === 1 && "rows" in layout
                ? {
                    ...layout,
                    rows: [
                      [
                        key(
                          "\\frac{\\mathrm{d}y}{\\mathrm{d}x}",
                          "\\frac{\\mathrm{d}y}{\\mathrm{d}x}",
                          "一阶导数 dy/dx",
                        ),
                        key("y'", "y'", "一阶导数 y'"),
                        key(
                          odeOrder === 2
                            ? "\\frac{\\mathrm{d}^2y}{\\mathrm{d}x^2}"
                            : "\\frac{\\mathrm{d}x}{\\mathrm{d}y}",
                          odeOrder === 2
                            ? "\\frac{\\mathrm{d}^2y}{\\mathrm{d}x^2}"
                            : "\\frac{\\mathrm{d}x}{\\mathrm{d}y}",
                          odeOrder === 2 ? "二阶导数" : "一阶导数 dx/dy",
                        ),
                        odeOrder === 2
                          ? key("y''", "y''", "二阶导数 y''")
                          : "=",
                      ],
                      ...layout.rows,
                    ],
                  }
                : layout,
          )
        : layouts;
    keyboard.layouts = configuredLayouts.map((layout, i) => {
      if (!("rows" in layout)) return layout;
      const { rows, ...metadata } = layout;
      const controls: Record<string, string> = {
        "[backspace]": "math-key-backspace",
        "[hide-keyboard]": "math-key-hide",
        "[left]": "math-key-arrow",
        "[right]": "math-key-arrow",
        "[undo]": "math-key-history",
        "[redo]": "math-key-history",
      };
      const balancedRows = rows.map((row) =>
        row.map((item) =>
          typeof item === "string" && controls[item]
            ? {
                ...keyboard.getKeycap(item),
                class: `action hide-shift ${controls[item]}`,
              }
            : item,
        ),
      );
      return {
        ...metadata,
        layers: [
          {
            id: `mathroom-keys-${["basic", "functions", "letters", "greek", "symbols"][i]}`,
            rows: balancedRows,
          },
        ],
      };
    });
  }, [polar, parametric, implicit, ode, odeOrder]);
  useEffect(() => {
    if (!desktopContainer) return;
    const keyboard = window.mathVirtualKeyboard;
    keyboard.editToolbar = "none";
    const desktop = window.matchMedia("(min-width: 641px)");
    for (const [key, tooltip] of [
      ["[undo]", "撤销"],
      ["[redo]", "重做"],
      ["[hide-keyboard]", "收起键盘"],
      ["[backspace]", "退格"],
    ]) {
      keyboard.setKeycap(key, { ...keyboard.getKeycap(key), tooltip });
    }
    const resize = () => {
      const height =
        keyboard.visible && !desktop.matches ? keyboard.boundingRect.height : 0;
      document.documentElement.style.setProperty(
        "--math-keyboard-height",
        `${height}px`,
      );
      document.documentElement.toggleAttribute(
        "data-math-keyboard",
        keyboard.visible,
      );
    };
    const moveKeyboard = () => {
      const visible = keyboard.visible;
      // Hide before changing containers so MathLive restores mobile body padding.
      keyboard.hide();
      keyboard.container = desktop.matches ? desktopContainer : document.body;
      if (visible) keyboard.show();
      resize();
    };
    keyboard.addEventListener("geometrychange", resize);
    desktop.addEventListener("change", moveKeyboard);
    window.addEventListener("resize", resize);
    moveKeyboard();
    return () => {
      keyboard.removeEventListener("geometrychange", resize);
      desktop.removeEventListener("change", moveKeyboard);
      window.removeEventListener("resize", resize);
      keyboard.hide();
      keyboard.container = document.body;
      document.documentElement.style.removeProperty("--math-keyboard-height");
      document.documentElement.removeAttribute("data-math-keyboard");
    };
  }, [desktopContainer]);
  return null;
}

export function MathInput({
  value,
  label,
  onChange,
  onFocus,
}: {
  value: string;
  label: string;
  onChange: (latex: string) => void;
  onFocus?: () => void;
}) {
  const ref = useRef<MathfieldElement>(null);
  const change = useRef(onChange);
  change.current = onChange;
  const focused = useRef(onFocus);
  focused.current = onFocus;
  useEffect(() => {
    const mf = ref.current!;
    mf.mathVirtualKeyboardPolicy = "manual";
    mf.smartFence = true;
    mf.smartMode = false;
    mf.menuItems = [];
    const input = () => change.current(mf.value);
    const focus = () => {
      focused.current?.();
      window.mathVirtualKeyboard.show();
    };
    mf.addEventListener("input", input);
    mf.addEventListener("focusin", focus);
    return () => {
      mf.removeEventListener("input", input);
      mf.removeEventListener("focusin", focus);
    };
  }, []);
  useEffect(() => {
    const mf = ref.current;
    if (mf && mf.value !== value)
      mf.setValue(value, { silenceNotifications: true });
  }, [value]);
  return <math-field ref={ref} aria-label={label} />;
}
export { StaticMath } from "./StaticMath";
