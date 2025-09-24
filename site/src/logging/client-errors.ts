// src/logging/client-errors.ts
import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN; // leave undefined if you don't want it live yet
if (dsn) {
  Sentry.init({
    dsn,
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    environment: import.meta.env.MODE, // "development" | "production"
    release: import.meta.env.VITE_GIT_SHA, // optional, if you inject it
  });
}
