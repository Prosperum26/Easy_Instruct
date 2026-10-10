import { app } from "electron";
import { writeFile } from "node:fs/promises";
import type { RenderMessage } from "../src/shared/protocol.js";
import { buildDemoSteps, buildRectCheckStep, parseRectArg, parseStepArg } from "./demo.js";
import { debug, type Overlay } from "./window.js";

const ADVANCE = new Set(["next", "done", "skip", "start"]);

/** `--capture=<file.png>`: saves what the overlay renders for the first step, then quits. */
function parseCaptureArg(argv: string[]): string | null {
  return argv.find((a) => a.startsWith("--capture="))?.slice("--capture=".length) ?? null;
}

/** Runs the built-in walkthrough without a server; events are logged to stdout. */
export function runDemo(overlay: Overlay, argv: string[]) {
  const rect = parseRectArg(argv);
  const bounds = overlay.display().boundsPhysical;
  const steps: RenderMessage[] = rect ? [buildRectCheckStep(rect)] : buildDemoSteps(bounds);
  let index = parseStepArg(argv, steps.length);
  const capturePath = parseCaptureArg(argv);

  overlay.onReady(() => {
    overlay.show(steps[index]);
    if (capturePath) {
      setTimeout(async () => {
        const image = await overlay.window.webContents.capturePage();
        await writeFile(capturePath, image.toPNG());
        debug("captured", capturePath);
        app.quit();
      }, 800);
    }
  });

  overlay.onEvent((message) => {
    process.stdout.write(`${JSON.stringify(message)}\n`);
    if (message.type !== "button") return;
    if (ADVANCE.has(message.button)) index++;
    else if (message.button === "back") index = Math.max(0, index - 1);
    else if (message.button === "exit" || message.button === "close") index = steps.length;
    else return;

    if (index >= steps.length) app.quit();
    else overlay.show(steps[index]);
  });

  overlay.onQuitShortcut(() => app.quit());
}
