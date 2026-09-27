import React from "react";
import { createRoot } from "react-dom/client";
import MechanicsApp from "./MechanicsApp";
import "./mechanics.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MechanicsApp />
  </React.StrictMode>,
);
