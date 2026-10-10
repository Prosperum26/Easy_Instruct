import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readdir } from "node:fs/promises";

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

// win-helper, two ways to run the same C# sources (see native/win-helper/host.ps1):
// 1. host.ps1 + sources, compiled at runtime by Windows PowerShell. Always shipped; needs no .NET SDK.
const helperDir = "dist/win-helper";
await mkdir(`${helperDir}/src`, { recursive: true });
await copyFile("native/win-helper/host.ps1", `${helperDir}/host.ps1`);
for (const file of await readdir("native/win-helper/src")) {
  if (file.endsWith(".cs")) await copyFile(`native/win-helper/src/${file}`, `${helperDir}/src/${file}`);
}
console.log("Copied the PowerShell win-helper into", helperDir);

// 2. A .NET 10 exe: starts faster, but unsigned, so Smart App Control may block it. Built when dotnet exists.
const dotnet = [process.env.DOTNET ?? "dotnet", "C:/Program Files/dotnet/dotnet.exe"].find((candidate) => {
  try {
    execFileSync(candidate, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
});
if (!dotnet) {
  console.warn("dotnet not found: skipping win-helper.exe (the PowerShell helper is used instead).");
} else {
  execFileSync(
    dotnet,
    ["publish", "native/win-helper/src/WinHelper.csproj", "-c", "Release", "-o", helperDir, "--nologo", "-v", "quiet"],
    { stdio: "inherit", env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" } },
  );
  console.log("Built win-helper.exe into", helperDir);
}
