import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
import "./mobile.css";
import "./layout.css";
import "./workbench.css";
import "./appearance.css";
import "./ode.css";
import "./ui.css";
import { applyTheme, readTheme } from "./theme";

applyTheme(readTheme());

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
