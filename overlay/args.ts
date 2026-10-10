const flag = (argv: string[], name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

/** Reads `--port` and `--token` given by the server; null means demo mode. */
export function parseConnectArgs(argv: string[]): { port: number; token: string } | null {
  const portArg = flag(argv, "port");
  if (portArg === undefined) return null;
  const port = Number(portArg);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid --port value "${portArg}"`);
  const token = flag(argv, "token");
  if (!token) throw new Error("--port requires --token");
  return { port, token };
}
