using System.Text.Json;
using System.Text.Json.Nodes;

namespace WinHelper;

/// <summary>An error with a stable code the Node side can act on.</summary>
public class HelperException(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}

/// <summary>
/// Turns one JSON request line {"id", "cmd", "args"} into one JSON response line
/// {"id", "ok", "result"} or {"id", "ok": false, "error": {"code", "message"}}.
/// </summary>
public class Dispatcher
{
    private readonly Dictionary<string, Func<JsonObject?, JsonNode?>> _handlers = new();

    public void Register(string command, Func<JsonObject?, JsonNode?> handler) => _handlers[command] = handler;

    public string HandleLine(string line)
    {
        JsonNode? id = null;
        try
        {
            if (JsonNode.Parse(line) is not JsonObject request)
                return Error(null, "BAD_REQUEST", "Request must be a JSON object.");
            id = request["id"]?.DeepClone();

            var command = request["cmd"]?.GetValueKind() == JsonValueKind.String ? (string)request["cmd"]! : null;
            if (command is null) return Error(id, "BAD_REQUEST", "Missing \"cmd\".");
            if (!_handlers.TryGetValue(command, out var handler))
                return Error(id, "UNKNOWN_COMMAND", $"Unknown command \"{command}\".");

            var result = handler(request["args"] as JsonObject);
            return new JsonObject { ["id"] = id, ["ok"] = true, ["result"] = result }.ToJsonString();
        }
        catch (JsonException)
        {
            return Error(id, "BAD_REQUEST", "Request is not valid JSON.");
        }
        catch (HelperException e)
        {
            return Error(id, e.Code, e.Message);
        }
        catch (Exception e)
        {
            return Error(id, "INTERNAL", $"{e.GetType().Name}: {e.Message}");
        }
    }

    private static string Error(JsonNode? id, string code, string message) =>
        new JsonObject
        {
            ["id"] = id?.DeepClone(),
            ["ok"] = false,
            ["error"] = new JsonObject { ["code"] = code, ["message"] = message },
        }.ToJsonString();
}
