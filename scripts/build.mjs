import { build } from "esbuild";
import { execFileSync } from "node:child_process";
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

// win-helper (.NET 10). Framework-dependent publish: needs the .NET 10 runtime where it runs.
const dotnet = [process.env.DOTNET ?? "dotnet", "C:/Program Files/dotnet/dotnet.exe"].find((candidate) => {
  try {
    execFileSync(candidate, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
});
if (!dotnet) {
  console.warn("dotnet not found: skipping win-helper (observe and VS Code focus will be unavailable).");
} else {
  execFileSync(
    dotnet,
    ["publish", "native/win-helper/src/WinHelper.csproj", "-c", "Release", "-o", "dist/win-helper", "--nologo", "-v", "quiet"],
    { stdio: "inherit", env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" } },
  );
  console.log("Built win-helper into dist/win-helper");
}
