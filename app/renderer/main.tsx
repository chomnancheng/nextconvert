import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./globals.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Missing #root");
}

if (!window.electronAPI) {
  rootEl.innerHTML =
    "<div style=\"padding:24px;font-family:system-ui,sans-serif;max-width:520px\">" +
    "<h1 style=\"font-size:18px;margin:0 0 12px\">Preload did not run</h1>" +
    "<p style=\"margin:0 0 12px;color:#444\">" +
    "<code>window.electronAPI</code> is missing. Rebuild the main process " +
    "(<code>bun run dev</code> runs <code>tsc</code> before Electron) and check the terminal for preload errors." +
    "</p></div>";
} else {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
