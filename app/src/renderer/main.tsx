import { App } from "@renderer/App";
import { GlobalErrorBoundary } from "@renderer/components/GlobalErrorBoundary";
import { initRendererMonitor } from "@renderer/monitor";
import React from "react";
import ReactDOM from "react-dom/client";

import "@rrweb/replay/dist/style.css";
import "./index.css";

initRendererMonitor();

document.documentElement.dataset.platform = /Mac/i.test(navigator.userAgent)
  ? "darwin"
  : /Win/i.test(navigator.userAgent)
    ? "win32"
    : "linux";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </React.StrictMode>,
);
