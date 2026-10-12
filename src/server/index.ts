import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { FallbackHelper, helperBackends } from "../helper-client/fallback.js";
import { HelperClient } from "../helper-client/helper-client.js";
import { codeExeCandidates, openLocation, resolveCodeCli } from "../ide/vscode-cli.js";
import { OpenFileError } from "../locator/locator.js";
import { Coordinator } from "./coordinator.js";
import { formatReport, isReady, runDoctor } from "./doctor.js";
import { guideDir, listGuide } from "./guide.js";
import { launchOverlay } from "./overlay-launcher.js";
import { PROBE_USAGE, parseProbeArgs, runProbe } from "./probe.js";
import { createServer, VERSION } from "./tools.js";

const require = createRequire(import.meta.url);
// In Node, the electron package exports the path to its executable.
const electronPath = require("electron") as string;
const mainPath = fileURLToPath(new URL("../overlay/main.cjs", import.meta.url));
const helperDir = fileURLToPath(new URL("../win-helper/", import.meta.url));

const [command, ...flags] = process.argv.slice(2);
if (command === "doctor") await doctor();
else if (command === "probe") await probe();
else if (command === "--version" || command === "-v") console.log(VERSION);
else if (command === undefined) await serve();
else {
  console.error(`Unknown command: ${command}\nUsage: easy-instruct          MCP server over stdio\n       easy-instruct doctor   check this machine [--json] [--no-overlay]
       ${PROBE_USAGE}`);
  process.exit(2);
}

async function doctor() {
  const checks = await runDoctor(
    {
      platform: process.platform,
      nodeVersion: process.versions.node,
      backends: helperBackends(helperDir, process.env.EASY_INSTRUCT_HELPER),
      // PowerShell compiles the helper on first start, which can take a while on a cold machine.
      connect: (backend) => new HelperClient({ command: backend.command, args: backend.args, requestTimeoutMs: 60_000 }),
      findCodeCli: (fromWindow) => resolveCodeCli(codeExeCandidates(fromWindow)),
      launchOverlay: () => launchOverlay({ electronPath, mainPath }),
      guideFiles: () => {
        try {
          return listGuide(guideDir());
        } catch {
          return [];
        }
      },
    },
    { overlay: !flags.includes("--no-overlay") },
  );
  if (flags.includes("--json")) console.log(JSON.stringify({ version: VERSION, ready: isReady(checks), checks }, null, 2));
  else console.log(formatReport(checks));
  process.exit(isReady(checks) ? 0 : 1);
}

async function probe() {
  const args = parseProbeArgs(flags);
  if ("error" in args) {
    console.error(`${args.error}
Usage: ${PROBE_USAGE}`);
    process.exit(2);
  }
  const helper = new FallbackHelper(helperBackends(helperDir, process.env.EASY_INSTRUCT_HELPER));
  try {
    const report = await runProbe(helper, { ...args, includeSnapshot: true });
    const { snapshot, ...summary } = report;
    console.log(JSON.stringify(summary, null, 2));
    if (args.out && snapshot) writeFileSync(args.out, JSON.stringify(report, null, 2));
    await helper.close();
    process.exit(report.window ? 0 : 1);
  } catch (error) {
    console.error((error as Error).message);
    await helper.close();
    process.exit(1);
  }
}

async function serve() {
  // The .NET exe when it can run, otherwise the PowerShell host (Smart App Control blocks the unsigned exe).
  // EASY_INSTRUCT_HELPER=dotnet|powershell forces one. If none runs, observe reports HELPER_UNAVAILABLE.
  const helper = new FallbackHelper(helperBackends(helperDir, process.env.EASY_INSTRUCT_HELPER));

  const coordinator = new Coordinator({
    helper,
    // VS Code's CLI next to the executable of the window being taught, else the usual install folders.
    async openFile(file, line, column, exePath) {
      const cli = resolveCodeCli(codeExeCandidates(exePath));
      if (!cli) throw new OpenFileError("ide_cli_not_found", "Could not find VS Code's command line (cli.js).");
      try {
        await openLocation(cli, file, line, column);
      } catch (error) {
        throw new OpenFileError("ide_cli_failed", (error as Error).message);
      }
    },
    async launch() {
      const overlay = await launchOverlay({ electronPath, mainPath });
      return {
        connection: {
          display: () => overlay.connection.display,
          send: (message) => overlay.connection.send(message),
          onMessage: (listener) => overlay.connection.onMessage(listener),
        },
        onExit: (listener) => overlay.onExit(listener),
        stop: () => overlay.stop(),
      };
    },
  });

  const server = createServer(coordinator);
  await server.connect(new StdioServerTransport());

  // The agent closing stdin ends the server; process exit hooks then kill the overlay and helper.
  process.stdin.on("close", async () => {
    await helper.close();
    process.exit(0);
  });

  // Start the helper now so the first observe does not pay for backend fallback and compilation.
  helper.request("ping").catch(() => {});
}
