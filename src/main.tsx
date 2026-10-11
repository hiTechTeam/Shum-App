import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { inApp } from "./core";
import "./styles.css";

if (!inApp) document.title = "Shum - Web";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
