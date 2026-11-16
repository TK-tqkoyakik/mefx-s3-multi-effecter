import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

const rootElement = document.getElementById("root");

function renderFatalError(error: unknown) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  if (!rootElement) return;
  rootElement.innerHTML = `
    <div style="padding:24px;color:#e8edf2;background:#101418;font-family:sans-serif;line-height:1.6">
      <h1 style="font-size:22px;margin:0 0 12px">MEFX-S3 Desktop の起動に失敗しました</h1>
      <p style="margin:0 0 12px">以下の内容をCodexに見せてください。</p>
      <pre style="white-space:pre-wrap;background:#1b232a;padding:16px;border-radius:8px">${message}</pre>
    </div>
  `;
}

window.addEventListener("error", (event) => renderFatalError(event.error ?? event.message));
window.addEventListener("unhandledrejection", (event) => renderFatalError(event.reason));

try {
  if (!rootElement) throw new Error("Root element was not found.");
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (error) {
  renderFatalError(error);
}
