import { build } from "esbuild";

const define = {
  "import.meta.env.MODE": JSON.stringify("production"),
  "import.meta.env.VITE_COGNITO_DOMAIN": JSON.stringify("https://lala-637423256673.auth.us-east-1.amazoncognito.com"),
  "import.meta.env.VITE_COGNITO_CLIENT_ID": JSON.stringify("18pssf28ocbr1ojmb20dtl4jh6"),
  "import.meta.env.VITE_REDIRECT_URI": JSON.stringify("https://app.stylingadventures.com/"),
  "import.meta.env.VITE_FAN_API": JSON.stringify("https://5x8drhfsq3.execute-api.us-east-1.amazonaws.com/prod"),
  "import.meta.env.VITE_UPLOADS_API": JSON.stringify("https://cvhoikmknh.execute-api.us-east-1.amazonaws.com/prod"),
};
define["import.meta.env"] = "{}";

await build({
  entryPoints: ["src/main.tsx"],
  bundle: true,
  format: "esm",
  sourcemap: true,
  outdir: ".",
  loader: { ".css": "css" },
  define,
  logLevel: "info",
});

const fs = await import("fs/promises");
const js = await fs.readFile("./main.js", "utf8");
const runtimeEnvRef = /\bimport\.meta\.env(?=\.|\[)/.test(js);
if (runtimeEnvRef) {
  throw new Error("import.meta.env runtime reference still present in main.js — add a define or switch to src/config.ts.");
}
console.log("✅ esbuild done (env inlined)");
