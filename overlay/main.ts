import { app, globalShortcut } from "electron";
import { parseConnectArgs } from "./args.js";
import { runConnected } from "./connected-mode.js";
import { runDemo } from "./demo-mode.js";
import { createOverlay } from "./window.js";

// Started by the MCP server with --port/--token; without them, runs the demo walkthrough.
const connect = parseConnectArgs(process.argv);

app.whenReady().then(() => {
  const overlay = createOverlay();
  if (connect) runConnected(overlay, connect);
  else runDemo(overlay, process.argv);
});

app.on("will-quit", () => globalShortcut.unregisterAll());
