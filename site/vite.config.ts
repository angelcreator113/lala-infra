// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";

const enableSentry = !!process.env.SENTRY_AUTH_TOKEN && process.env.NODE_ENV === "production";

export default defineConfig({
  plugins: [
    react(),
    ...(enableSentry
      ? [
          sentryVitePlugin({
            // Prefer env vars so CI/local differ without code changes
            org: process.env.SENTRY_ORG || "<your-org>",
            project: process.env.SENTRY_PROJECT || "lala-web",
            authToken: process.env.SENTRY_AUTH_TOKEN, // required for upload
            telemetry: false,

            // Optional: fine-tune source map upload behavior
            // sourceMaps: {
            //   include: ["dist"],
            //   ignore: ["node_modules"],
            //   urlPrefix: "~/", // adjust if your app serves from a subpath
            // },
          }),
        ]
      : []),
  ],
  resolve: { dedupe: ["react", "react-dom"] },
  server: { port: 5173, open: true },
  build: {
    // Needed so Sentry gets readable stack traces
    sourcemap: true,
  },
  css: {
    devSourcemap: true,
  },
});
