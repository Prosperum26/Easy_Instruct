using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace WinHelper;

/// <summary>Finding, measuring and focusing top-level windows. All coordinates are physical pixels.</summary>
public static class WindowCommands
{
    private const uint GW_OWNER = 4;

    public static void Register(Dispatcher dispatcher)
    {
        dispatcher.Register("list_windows", ListWindows);
        dispatcher.Register("window_bounds", WindowBounds);
        dispatcher.Register("foreground_window", ForegroundWindow);
        dispatcher.Register("focus_window", FocusWindow);
        dispatcher.Register("display_info", DisplayInfo);
    }

    /// <summary>The primary display; with PerMonitorV2 awareness the metrics are physical pixels.</summary>
    public static JsonObject? DisplayInfo(JsonObject? args) => new()
    {
        ["bounds"] = new JsonObject
        {
            ["x"] = 0,
            ["y"] = 0,
            ["w"] = Win32.GetSystemMetrics(Win32.SM_CXSCREEN),
            ["h"] = Win32.GetSystemMetrics(Win32.SM_CYSCREEN),
        },
    };

    /// <summary>Visible, titled, unowned windows in z-order (topmost first), optionally of one process.</summary>
    public static JsonNode? ListWindows(JsonObject? args)
    {
        var process = Args.OptionalString(args, "process");
        var foreground = Win32.GetForegroundWindow();
        var result = new JsonArray();
        Win32.EnumWindows((hwnd, _) =>
        {
            if (!Win32.IsWindowVisible(hwnd) || Win32.IsCloaked(hwnd) || Win32.GetWindow(hwnd, GW_OWNER) != 0) return true;
            var title = Win32.WindowTitle(hwnd);
            if (title.Length == 0) return true;
            var processName = ProcessName(hwnd);
            if (process is not null && !string.Equals(processName, process, StringComparison.OrdinalIgnoreCase)) return true;
            var bounds = Bounds(Win32.WindowFrame(hwnd));
            if ((int)bounds["w"]! <= 0 || (int)bounds["h"]! <= 0) return true;

            result.Add(new JsonObject
            {
                ["hwnd"] = (long)hwnd,
                ["title"] = title,
                ["process"] = processName,
                ["bounds"] = bounds,
                ["minimized"] = Win32.IsIconic(hwnd),
                ["foreground"] = hwnd == foreground,
            });
            return true;
        }, 0);
        return result;
    }

    public static JsonNode? WindowBounds(JsonObject? args)
    {
        var hwnd = RequireWindow(args);
        return new JsonObject
        {
            ["bounds"] = Bounds(Win32.WindowFrame(hwnd)),
            ["minimized"] = Win32.IsIconic(hwnd),
            ["foreground"] = Win32.GetForegroundWindow() == hwnd,
        };
    }

    public static JsonObject? ForegroundWindow(JsonObject? args)
    {
        var hwnd = Win32.GetForegroundWindow();
        if (hwnd == 0) return null;
        return new JsonObject { ["hwnd"] = (long)hwnd, ["title"] = Win32.WindowTitle(hwnd), ["process"] = ProcessName(hwnd) };
    }

    /// <summary>
    /// Brings a window to the foreground. Windows only lets the foreground thread do that, so this
    /// briefly attaches to the current foreground thread's input (no synthetic key presses, which
    /// would open VS Code's menu bar).
    /// </summary>
    public static JsonNode? FocusWindow(JsonObject? args)
    {
        var hwnd = RequireWindow(args);
        if (Win32.IsIconic(hwnd)) Win32.ShowWindow(hwnd, Win32.SW_RESTORE);

        var foregroundThread = Win32.GetWindowThreadProcessId(Win32.GetForegroundWindow(), out _);
        var ownThread = Win32.GetCurrentThreadId();
        var attached = foregroundThread != 0 && foregroundThread != ownThread &&
                       Win32.AttachThreadInput(ownThread, foregroundThread, true);
        try
        {
            Win32.BringWindowToTop(hwnd);
            Win32.SetForegroundWindow(hwnd);
        }
        finally
        {
            if (attached) Win32.AttachThreadInput(ownThread, foregroundThread, false);
        }
        return new JsonObject { ["focused"] = Win32.GetForegroundWindow() == hwnd };
    }

    private static nint RequireWindow(JsonObject? args)
    {
        var hwnd = (nint)Args.RequireLong(args, "hwnd");
        if (!Win32.IsWindow(hwnd)) throw new HelperException("WINDOW_NOT_FOUND", $"No window with handle {hwnd}.");
        return hwnd;
    }

    private static JsonObject Bounds(RECT r) =>
        new() { ["x"] = r.Left, ["y"] = r.Top, ["w"] = r.Right - r.Left, ["h"] = r.Bottom - r.Top };

    private static string ProcessName(nint hwnd)
    {
        Win32.GetWindowThreadProcessId(hwnd, out var pid);
        try
        {
            using var process = Process.GetProcessById((int)pid);
            return process.ProcessName;
        }
        catch (ArgumentException)
        {
            return "";
        }
    }
}

internal static class Args
{
    public static long RequireLong(JsonObject? args, string name)
    {
        if (args?[name] is JsonValue value && value.GetValueKind() == JsonValueKind.Number)
        {
            if (value.TryGetValue(out long whole)) return whole;
            if (value.TryGetValue(out int small)) return small;
            if (value.TryGetValue(out double real) && real == Math.Floor(real) && Math.Abs(real) < long.MaxValue)
                return (long)real;
        }
        throw new HelperException("BAD_ARGS", $"\"{name}\" must be an integer.");
    }

    public static int RequireInt(JsonObject? args, string name) => checked((int)RequireLong(args, name));

    public static string? OptionalString(JsonObject? args, string name) =>
        args?[name] is JsonValue value && value.GetValueKind() == JsonValueKind.String ? (string)value! : null;

    public static bool OptionalBool(JsonObject? args, string name, bool fallback) =>
        args?[name] is JsonValue value && value.TryGetValue(out bool flag) ? flag : fallback;
}
