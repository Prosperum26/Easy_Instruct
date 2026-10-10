using System.Text;
using System.Text.Json.Nodes;
using WinHelper;

// Reads one JSON request per line on stdin and answers one JSON line on stdout.
// Exits when stdin closes, so it never outlives the MCP server that started it.
var dispatcher = new Dispatcher();
dispatcher.Register("ping", _ => new JsonObject { ["pong"] = true });

Console.InputEncoding = Encoding.UTF8;
var stdout = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true };

string? line;
while ((line = Console.In.ReadLine()) is not null)
{
    if (string.IsNullOrWhiteSpace(line)) continue;
    stdout.WriteLine(dispatcher.HandleLine(line));
}
