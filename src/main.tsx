import { createRoot } from "react-dom/client";
import "./fonts.ts";
import "./styles/app.css";
import { AppProvider } from "./state/store.tsx";
import { App } from "./App.tsx";
import { tauriDriver } from "./platform/native.ts";

createRoot(document.getElementById("root")!).render(
  <AppProvider db={tauriDriver}>
    <App />
  </AppProvider>,
);
