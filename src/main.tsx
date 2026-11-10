import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/rubik";
import "flag-icons/css/flag-icons.min.css";
import { App } from "./App";
import { SettingsProvider } from "./hooks";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </StrictMode>,
);
