import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Coordinator } from "./coordinator.js";
import { launchOverlay } from "./overlay-launcher.js";
import { createServer } from "./tools.js";

const require = createRequire(import.meta.url);
// In Node, the electron package exports the path to its executable.
const electronPath = require("electron") as string;
const mainPath = fileURLToPath(new URL("../overlay/main.cjs", import.meta.url));

const coordinator = new Coordinator({
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

// The agent closing stdin ends the server; process exit hooks then kill any overlay.
process.stdin.on("close", () => process.exit(0));
