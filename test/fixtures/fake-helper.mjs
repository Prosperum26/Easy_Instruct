// Stands in for win-helper in client tests. Commands:
//   echo {..}      -> result = args
//   fail           -> error WINDOW_NOT_FOUND
//   delay {ms, v}  -> answers {v} after ms
//   silent         -> never answers
//   die            -> exits with code 1 without answering
//   garbage        -> prints a non-JSON line, then answers {ok: true}
//   pid            -> result = process.pid
import readline from "node:readline";

const reply = (id, result) => process.stdout.write(JSON.stringify({ id, ok: true, result }) + "\n");
const fail = (id, code, message) => process.stdout.write(JSON.stringify({ id, ok: false, error: { code, message } }) + "\n");

readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const { id, cmd, args } = JSON.parse(line);
  switch (cmd) {
    case "echo":
      return reply(id, args ?? null);
    case "fail":
      return fail(id, "WINDOW_NOT_FOUND", "no such window");
    case "delay":
      return setTimeout(() => reply(id, { v: args.v }), args.ms);
    case "silent":
      return;
    case "die":
      return process.exit(1);
    case "garbage":
      process.stdout.write("not json at all\n");
      return reply(id, { ok: true });
    case "pid":
      return reply(id, process.pid);
    default:
      return fail(id, "UNKNOWN_COMMAND", cmd);
  }
});
