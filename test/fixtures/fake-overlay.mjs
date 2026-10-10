// Stands in for the Electron overlay in launcher tests. Behaviour is picked with FAKE_OVERLAY:
//   hello (default) - connect, say hello, quit on close
//   silent          - start but never connect
//   crash-early     - exit with code 3 before connecting
//   crash-later     - say hello, then exit with code 4 after 100 ms
//   stubborn        - say hello, ignore close and keep running
// Like Electron, it cannot be an overlay when ELECTRON_RUN_AS_NODE is set (it exits with code 5).
import WebSocket from "ws";

if (process.env.ELECTRON_RUN_AS_NODE) process.exit(5);

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const mode = process.env.FAKE_OVERLAY ?? "hello";
process.stdout.write("this must not reach the MCP stdout\n");

if (mode === "crash-early") process.exit(3);
if (mode === "silent") setInterval(() => {}, 1000);
else {
  const socket = new WebSocket(`ws://127.0.0.1:${arg("port")}`);
  socket.on("open", () => {
    socket.send(
      JSON.stringify({
        type: "hello",
        token: arg("token"),
        display: { scaleFactor: 1, boundsPhysical: { x: 0, y: 0, w: 1920, h: 1080 } },
      }),
    );
    if (mode === "crash-later") setTimeout(() => process.exit(4), 100);
    if (mode === "stubborn") setInterval(() => {}, 1000);
  });
  socket.on("message", (data) => {
    if (mode !== "stubborn" && JSON.parse(String(data)).type === "close") process.exit(0);
  });
  socket.on("close", () => {
    if (mode !== "stubborn") process.exit(0);
  });
}
