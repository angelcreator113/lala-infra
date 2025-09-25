// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "../css/index.css";

// App + Error Boundary
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";

// Global client-side error logging (side-effect import)
import "./logging/client-errors";

// Auth callback (exchanges ?code=... â†’ tokens; no-op if none)
import { handleAuthCallback } from "./auth";

async function boot() {
  try {
    await handleAuthCallback();
  } catch (err) {
    console.error("Auth callback failed:", err);
  }

  const rootEl = document.getElementById("root");
  if (!rootEl) {
    throw new Error("Root element #root not found");
  }

  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}

boot();

