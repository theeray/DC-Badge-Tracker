import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./globals.css";
import Tracker from "./tracker";

const root = document.getElementById("root");
if (!root) {
  throw new Error("DC Central could not find its page root.");
}

createRoot(root).render(
  <StrictMode>
    <Tracker />
  </StrictMode>,
);
