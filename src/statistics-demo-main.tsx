import React from "react";
import { createRoot } from "react-dom/client";
import { StatisticsApp } from "./statistics/StatisticsApp";
import "./statistics/statistics.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <StatisticsApp />
  </React.StrictMode>,
);
