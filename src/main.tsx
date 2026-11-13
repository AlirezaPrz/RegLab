/** Browser entry point: loads fonts and styles and mounts the app. */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/stix-two-text/latin-400.css";
import "@fontsource/stix-two-text/latin-400-italic.css";
import "@fontsource/stix-two-text/latin-600.css";
import "@fontsource/stix-two-text/greek-400.css";
import "@fontsource/stix-two-text/greek-400-italic.css";
import "./styles/tokens.css";
import "./styles/app.css";
import { App } from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
