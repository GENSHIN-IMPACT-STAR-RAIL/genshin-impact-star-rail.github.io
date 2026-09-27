import { useEffect, useState } from "react";
import { applyTheme, readTheme, type Theme } from "./theme";
export function useColorTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => applyTheme(theme), [theme]);
  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    try {
      localStorage.setItem("mathroom-theme", next);
    } catch {
      /* Switching still works without persistence. */
    }
    applyTheme(next);
    setTheme(next);
  };
  return { theme, toggleTheme };
}
