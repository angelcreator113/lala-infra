// src/sentry.ts
import { SENTRY_DSN } from "./config";
// import * as Sentry from "@sentry/react";

if (SENTRY_DSN) {
  /* Sentry.init({
    dsn: SENTRY_DSN,
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  }); */
}
export {};
