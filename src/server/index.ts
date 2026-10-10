import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { FallbackHelper, helperBackends } from "../helper-client/fallback.js";
import { codeExeCandidates, openLocation, resolveCodeCli } from "../ide/vscode-cli.js";
import { OpenFileError } from "../locator/locator.js";
import { Coordinator } from "./coordinator.js";
import { launchOverlay } from "./overlay-launcher.js";
import { createServer } from "./tools.js";

const require = createRequire(import.meta.url);
// In Node, the electron package exports the path to its executable.
const electronPath = require("electron") as string;
const mainPath = fileURLToPath(new URL("../overlay/main.cjs", import.meta.url));
// The .NET exe when it can run, otherwise the PowerShell host (Smart App Control blocks the unsigned exe).
// EASY_INSTRUCT_HELPER=dotnet|powershell forces one. If none runs, observe reports HELPER_UNAVAILABLE.
const helperDir = fileURLToPath(new URL("../win-helper/", import.meta.url));
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
