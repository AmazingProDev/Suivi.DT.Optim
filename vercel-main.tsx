import React from "react";
import { createRoot } from "react-dom/client";
import Dashboard from "./app/page";
import "./app/globals.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Le conteneur principal de l'application est introuvable.");
}

createRoot(container).render(
  <React.StrictMode>
    <Dashboard />
  </React.StrictMode>,
);
