import React from "react";
import { createRoot } from "react-dom/client";
import { StatisticsSuite } from "./statistics/StatisticsSuite";
import "./statistics/suite.css";
import "./ui.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <StatisticsSuite />
  </React.StrictMode>,
);
