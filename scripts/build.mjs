import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";

const outdir = "dist/overlay";

await Promise.all([
  build({
    entryPoints: ["overlay/main.ts", "overlay/preload.ts"],
    outdir,
    outExtension: { ".js": ".cjs" },
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron"],
    sourcemap: true,
  }),
  build({
    entryPoints: ["src/server/index.ts"],
    outfile: "dist/server/index.js",
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    packages: "external",
    banner: { js: "#!/usr/bin/env node" },
    sourcemap: true,
  }),
  build({
    entryPoints: ["overlay/renderer/renderer.ts"],
    outdir: `${outdir}/renderer`,
    bundle: true,
    platform: "browser",
    format: "iife",
    target: "chrome130",
    sourcemap: true,
  }),
]);

await mkdir(`${outdir}/renderer`, { recursive: true });
await Promise.all(
  ["index.html", "styles.css"].map((file) => copyFile(`overlay/renderer/${file}`, `${outdir}/renderer/${file}`)),
);

console.log("Built server into dist/server and overlay into", outdir);
