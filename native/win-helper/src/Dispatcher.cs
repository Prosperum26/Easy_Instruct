using System;
using System.Collections.Generic;

namespace WinHelper
{
    /// <summary>An error with a stable code the Node side can act on.</summary>
    public class HelperException : Exception
    {
        public HelperException(string code, string message) : base(message) { Code = code; }

        public string Code { get; private set; }
    }

    public delegate object Handler(Dictionary<string, object> args);

    /// <summary>
    /// Turns one JSON request line {"id", "cmd", "args"} into one JSON response line
    /// {"id", "ok", "result"} or {"id", "ok": false, "error": {"code", "message"}}.
    /// </summary>
    public class Dispatcher
    {
        private readonly Dictionary<string, Handler> _handlers = new Dictionary<string, Handler>();

        public void Register(string command, Handler handler) { _handlers[command] = handler; }

        public string HandleLine(string line)
        {
            object id = null;
            try
            {
                var request = Json.Parse(line) as Dictionary<string, object>;
                if (request == null) return Error(null, "BAD_REQUEST", "Request must be a JSON object.");
                request.TryGetValue("id", out id);

                object commandValue;
                request.TryGetValue("cmd", out commandValue);
                var command = commandValue as string;
                if (command == null) return Error(id, "BAD_REQUEST", "Missing \"cmd\".");

                Handler handler;
                if (!_handlers.TryGetValue(command, out handler))
                    return Error(id, "UNKNOWN_COMMAND", "Unknown command \"" + command + "\".");

                object argsValue;
                request.TryGetValue("args", out argsValue);
                var result = handler(argsValue as Dictionary<string, object>);
                return Json.Serialize(new Dictionary<string, object> { { "id", id }, { "ok", true }, { "result", result } });
            }
            catch (JsonFormatException)
            {
                return Error(id, "BAD_REQUEST", "Request is not valid JSON.");
            }
            catch (HelperException e)
            {
                return Error(id, e.Code, e.Message);
            }
            catch (Exception e)
            {
                return Error(id, "INTERNAL", e.GetType().Name + ": " + e.Message);
            }
        }

        private static string Error(object id, string code, string message)
        {
            return Json.Serialize(new Dictionary<string, object>
            {
                { "id", id },
                { "ok", false },
                { "error", new Dictionary<string, object> { { "code", code }, { "message", message } } },
            });
        }
    }

    /// <summary>Typed access to request arguments; bad input becomes BAD_ARGS.</summary>
    public static class Args
    {
        public static long RequireLong(Dictionary<string, object> args, string name)
        {
            object value;
            if (args != null && args.TryGetValue(name, out value) && value is double)
            {
                var number = (double)value;
                if (number == Math.Floor(number) && Math.Abs(number) < 9007199254740992.0) return (long)number;
            }
            throw new HelperException("BAD_ARGS", "\"" + name + "\" must be an integer.");
        }

        public static int RequireInt(Dictionary<string, object> args, string name)
        {
            return checked((int)RequireLong(args, name));
        }

        public static int OptionalInt(Dictionary<string, object> args, string name, int fallback)
        {
            return args != null && args.ContainsKey(name) && args[name] != null ? RequireInt(args, name) : fallback;
        }

        public static string OptionalString(Dictionary<string, object> args, string name)
        {
            object value;
            return args != null && args.TryGetValue(name, out value) ? value as string : null;
        }

        public static bool OptionalBool(Dictionary<string, object> args, string name, bool fallback)
        {
            object value;
            return args != null && args.TryGetValue(name, out value) && value is bool ? (bool)value : fallback;
        }
    }
}
