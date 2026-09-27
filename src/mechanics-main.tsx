import React from "react";
import { createRoot } from "react-dom/client";
import WorkbenchApp from "./workbench/WorkbenchApp";
import "./ui.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WorkbenchApp />
  </React.StrictMode>,
);
